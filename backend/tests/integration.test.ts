import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { Server as SocketServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { createApp } from '../dealdesk/src/app';
import { reprocessOrphanedWebhookEvents } from '../dealdesk/src/integrations/webhook.processor';
import { runPushWorkerCycle } from '../dealdesk/src/jobs/pushWorker';
import { runReconcilerCycle } from '../dealdesk/src/jobs/reconciler';
import { ApprovalConfig } from '../dealdesk/src/models/ApprovalConfig';
import {
  ApprovalHistory,
  type ApprovalHistoryAttrs,
} from '../dealdesk/src/models/ApprovalHistory';
import { BalanceEntry } from '../dealdesk/src/models/BalanceEntry';
import { Branch, type BranchAttrs } from '../dealdesk/src/models/Branch';
import {
  Customer,
  type CustomerAttrs,
} from '../dealdesk/src/models/Customer';
import {
  Deal,
  type DealAttrs,
  type DealStatus,
} from '../dealdesk/src/models/Deal';
import {
  DiscountRequest,
  type DiscountRequestAttrs,
} from '../dealdesk/src/models/DiscountRequest';
import {
  IntegrationLog,
  type IntegrationLogAttrs,
} from '../dealdesk/src/models/IntegrationLog';
import {
  Invoice,
  type InvoiceAttrs,
  type InvoiceStatus,
} from '../dealdesk/src/models/Invoice';
import {
  Product,
  type ProductAttrs,
} from '../dealdesk/src/models/Product';
import { Role } from '../dealdesk/src/models/Role';
import { Sale } from '../dealdesk/src/models/Sale';
import {
  WebhookEvent,
  type WebhookEventAttrs,
  type WebhookEventStatus,
} from '../dealdesk/src/models/WebhookEvent';
import { User, type UserAttrs } from '../dealdesk/src/models/User';
import { RealtimeGateway } from '../dealdesk/src/realtime/gateway';
import { registerSocketAuth } from '../dealdesk/src/realtime/socketAuth';
import { applyLedgerEntry } from '../dealdesk/src/services/balance.service';
import { sign } from '../dealdesk/src/utils/hmac';
import type { HydratedDocument } from 'mongoose';

const TEST_DB = 'mongodb://127.0.0.1:27017/dealdesk_test_suite';
const BILLPORT_PORT = 51240;

type App = ReturnType<typeof createApp>;

interface Fixture {
  app: App;
  branchA: HydratedDocument<BranchAttrs>;
  branchB: HydratedDocument<BranchAttrs>;
  customer: HydratedDocument<CustomerAttrs>;
  product: HydratedDocument<ProductAttrs>;
  users: {
    execA: HydratedDocument<UserAttrs>;
    execB: HydratedDocument<UserAttrs>;
    managerA: HydratedDocument<UserAttrs>;
    managerB: HydratedDocument<UserAttrs>;
    finance: HydratedDocument<UserAttrs>;
    admin: HydratedDocument<UserAttrs>;
  };
  tokens: Record<string, string>;
}

interface BillPortRecord {
  externalId: string;
  status: string;
}

let fixture: Fixture;
let billportServer: http.Server | null = null;
let billportRequests = 0;
let billportFirstDelayMs = 0;
const billportRecords = new Map<string, BillPortRecord>();
const billportStatuses = new Map<string, string>();

function tokenFor(userId: Types.ObjectId): string {
  return jwt.sign({ sub: userId.toString() }, 'test-jwt-secret', {
    expiresIn: '1h',
  });
}

function auth(testRequest: request.Test, token: string): request.Test {
  return testRequest.set('Authorization', `Bearer ${token}`);
}

function expectError(
  response: request.Response,
  status: number,
  code: string,
): void {
  expect(response.status).toBe(status);
  expect(response.body.error?.code).toBe(code);
}

async function waitFor<T>(
  check: () => Promise<T | null | undefined | false>,
  timeoutMs = 8000,
): Promise<T> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await check();

    if (value) {
      return value;
    }

    await sleep(25);
  }

  throw new Error('Timed out waiting for condition');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function onceConnect(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('socket connect timeout')),
      5000,
    );

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function socketAck(
  socket: ClientSocket,
  event: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; [key: string]: unknown }> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (response: { ok: boolean }) => {
      resolve(response);
    });
  });
}

async function createDirectDeal(
  ownerId: Types.ObjectId,
  branchId: Types.ObjectId,
  title: string,
  options: {
    customerId?: Types.ObjectId;
    status?: DealStatus;
    discountPct?: number;
    total?: number;
  } = {},
): Promise<HydratedDocument<DealAttrs>> {
  return Deal.create({
    title,
    customerId: options.customerId ?? fixture.customer._id,
    ownerId,
    branchId,
    items: [
      {
        productId: fixture.product._id,
        qty: 2,
        price: fixture.product.price,
      },
    ],
    subtotal: 20000,
    discountPct: options.discountPct ?? 0,
    total: options.total ?? 0,
    status: options.status ?? 'open',
    rejectionReason: null,
    convertedAt: null,
  });
}

async function createInvoiceFixture(
  externalId: string | null,
  status: InvoiceStatus = 'sent',
): Promise<{
  customer: HydratedDocument<CustomerAttrs>;
  deal: HydratedDocument<DealAttrs>;
  invoice: HydratedDocument<InvoiceAttrs>;
}> {
  const customer = await Customer.create({
    name: `Webhook customer ${randomUUID()}`,
    outstandingBalance: 0,
  });
  const deal = await createDirectDeal(
    fixture.users.execA._id,
    fixture.branchA._id,
    `Invoice deal ${randomUUID()}`,
    {
      customerId: customer._id,
      status: 'won',
      total: 20000,
    },
  );
  const sale = await Sale.create({
    dealId: deal._id,
    customerId: customer._id,
    amount: 20000,
  });
  const invoice = await Invoice.create({
    saleId: sale._id,
    dealId: deal._id,
    customerId: customer._id,
    ownerId: fixture.users.execA._id,
    branchId: fixture.branchA._id,
    amount: 20000,
    status,
    externalId,
    idempotencyKey: randomUUID(),
    lastSequence: 0,
    lastSyncedAt: null,
    pushState: 'succeeded',
    pushAttempts: 0,
    nextAttemptAt: null,
    lockedUntil: null,
    lastError: null,
  });

  return { customer, deal, invoice };
}

function webhookBody(
  eventId: string,
  externalId: string,
  status: WebhookEventStatus,
  sequence: number,
): {
  eventId: string;
  externalId: string;
  status: WebhookEventStatus;
  sequence: number;
  occurredAt: string;
} {
  return {
    eventId,
    externalId,
    status,
    sequence,
    occurredAt: new Date().toISOString(),
  };
}

function postWebhook(
  body: Record<string, unknown>,
  signature?: string,
): request.Test {
  const raw = JSON.stringify(body);

  return request(fixture.app)
    .post('/webhooks/billport')
    .set('Content-Type', 'application/json')
    .set('X-Signature', signature ?? sign(raw))
    .send(raw);
}

function tamperSignature(body: Record<string, unknown>): string {
  const signature = sign(JSON.stringify(body));
  const last = signature.endsWith('0') ? '1' : '0';

  return `${signature.slice(0, -1)}${last}`;
}

async function startBillportMock(): Promise<void> {
  if (billportServer) {
    return;
  }

  billportServer = http.createServer((req, res) => {
    if (req.method === 'GET') {
      const match = /^\/billing\/invoices\/(.+)$/.exec(req.url ?? '');

      if (match) {
        const externalId = decodeURIComponent(match[1]);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            externalId,
            status: billportStatuses.get(externalId) ?? 'QUEUED',
            updatedAt: new Date().toISOString(),
          }),
        );
        return;
      }
    }

    if (req.method !== 'POST' || req.url !== '/billing/invoices') {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    let rawBody = '';
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => {
      rawBody += chunk;
    });
    req.on('end', () => {
      void rawBody;
      const key = req.headers['idempotency-key'];

      if (typeof key !== 'string' || key.length === 0) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'missing idempotency key' }));
        return;
      }

      let record = billportRecords.get(key);

      if (!record) {
        record = {
          externalId: `ext_${randomUUID()}`,
          status: 'QUEUED',
        };
        billportRecords.set(key, record);
      }

      billportRequests += 1;
      const send = (): void => {
        res.statusCode = 201;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(record));
      };

      if (billportFirstDelayMs > 0) {
        const delay = billportFirstDelayMs;
        billportFirstDelayMs = 0;
        setTimeout(send, delay);
      } else {
        send();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    billportServer?.once('error', reject);
    billportServer?.listen(BILLPORT_PORT, '127.0.0.1', resolve);
  });
}

beforeAll(async () => {
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();

  await Promise.all([
    ApprovalConfig.syncIndexes(),
    ApprovalHistory.syncIndexes(),
    BalanceEntry.syncIndexes(),
    Branch.syncIndexes(),
    Customer.syncIndexes(),
    Deal.syncIndexes(),
    DiscountRequest.syncIndexes(),
    IntegrationLog.syncIndexes(),
    Invoice.syncIndexes(),
    Product.syncIndexes(),
    Role.syncIndexes(),
    Sale.syncIndexes(),
    User.syncIndexes(),
    WebhookEvent.syncIndexes(),
  ]);

  const branchA = await Branch.create({ name: 'Branch A' });
  const branchB = await Branch.create({ name: 'Branch B' });

  const execRole = await Role.create({
    key: 'sales_exec',
    name: 'Sales Executive',
    permissions: [
      { key: 'deal.view', scope: 'own' },
      { key: 'deal.edit', scope: 'own' },
      { key: 'chat.send', scope: 'all' },
    ],
  });
  const managerRole = await Role.create({
    key: 'sales_manager',
    name: 'Sales Manager',
    permissions: [
      { key: 'deal.view', scope: 'branch' },
      { key: 'deal.edit', scope: 'own' },
      { key: 'discount.approve', scope: 'branch' },
      { key: 'chat.send', scope: 'all' },
    ],
  });
  const financeRole = await Role.create({
    key: 'finance',
    name: 'Finance',
    permissions: [
      { key: 'deal.view', scope: 'all' },
      { key: 'discount.approve', scope: 'all' },
      { key: 'invoice.issue', scope: 'all' },
      { key: 'invoice.cancel', scope: 'all' },
      { key: 'chat.send', scope: 'all' },
    ],
  });
  const adminRole = await Role.create({
    key: 'admin',
    name: 'Administrator',
    permissions: [
      { key: 'deal.view', scope: 'all' },
      { key: 'deal.edit', scope: 'all' },
      { key: 'discount.approve', scope: 'all' },
      { key: 'invoice.issue', scope: 'all' },
      { key: 'invoice.cancel', scope: 'all' },
      { key: 'chat.send', scope: 'all' },
      { key: 'admin.manage', scope: 'all' },
    ],
  });

  const passwordHash = await bcrypt.hash('Password123!', 4);

  const managerA = await User.create({
    email: 'managerA@dealdesk.test',
    passwordHash,
    roleId: managerRole._id,
    branchId: branchA._id,
    managerId: null,
  });
  const managerB = await User.create({
    email: 'managerB@dealdesk.test',
    passwordHash,
    roleId: managerRole._id,
    branchId: branchB._id,
    managerId: null,
  });
  const execA = await User.create({
    email: 'execA@dealdesk.test',
    passwordHash,
    roleId: execRole._id,
    branchId: branchA._id,
    managerId: managerA._id,
  });
  const execB = await User.create({
    email: 'execB@dealdesk.test',
    passwordHash,
    roleId: execRole._id,
    branchId: branchB._id,
    managerId: managerB._id,
  });
  const finance = await User.create({
    email: 'finance@dealdesk.test',
    passwordHash,
    roleId: financeRole._id,
    branchId: branchA._id,
    managerId: null,
  });
  const admin = await User.create({
    email: 'admin@dealdesk.test',
    passwordHash,
    roleId: adminRole._id,
    branchId: branchA._id,
    managerId: null,
  });

  const customer = await Customer.create({
    name: 'Scope Customer',
    outstandingBalance: 0,
  });
  const product = await Product.create({
    name: 'Scope Product',
    sku: 'SCOPE-1',
    price: 10000,
  });

  await ApprovalConfig.create([
    { minPct: 0, maxPct: 10, chain: [] },
    { minPct: 10, maxPct: 25, chain: ['sales_manager'] },
    {
      minPct: 25,
      maxPct: 40,
      chain: ['sales_manager', 'finance'],
    },
    {
      minPct: 40,
      maxPct: 100,
      chain: ['sales_manager', 'finance', 'admin'],
    },
  ]);

  fixture = {
    app: createApp(),
    branchA,
    branchB,
    customer,
    product,
    users: {
      execA,
      execB,
      managerA,
      managerB,
      finance,
      admin,
    },
    tokens: {
      execA: tokenFor(execA._id),
      execB: tokenFor(execB._id),
      managerA: tokenFor(managerA._id),
      managerB: tokenFor(managerB._id),
      finance: tokenFor(finance._id),
      admin: tokenFor(admin._id),
    },
  };
});

afterAll(async () => {
  if (billportServer) {
    await new Promise<void>((resolve) => {
      billportServer?.close(() => resolve());
    });
    billportServer = null;
  }

  await mongoose.connection.dropDatabase().catch(() => undefined);
  await mongoose.disconnect();
});

describe.sequential('DealDesk API integration', () => {
  it('enforces cross-branch detail and own/branch/all list scope', async () => {
    const dealA = await createDirectDeal(
      fixture.users.execA._id,
      fixture.branchA._id,
      'Branch A deal',
    );
    const dealB = await createDirectDeal(
      fixture.users.execB._id,
      fixture.branchB._id,
      'Branch B deal',
    );

    expectError(
      await auth(
        request(fixture.app).get(`/deals/${dealB._id}`),
        fixture.tokens.execA,
      ),
      404,
      'NOT_FOUND',
    );

    await auth(
      request(fixture.app).get(`/deals/${dealB._id}`),
      fixture.tokens.finance,
    ).expect(200);

    const ownList = await auth(
      request(fixture.app).get('/deals'),
      fixture.tokens.execA,
    ).expect(200);
    expect(
      ownList.body.items.map((deal: { _id: string }) => deal._id),
    ).toEqual([String(dealA._id)]);

    const branchList = await auth(
      request(fixture.app).get('/deals'),
      fixture.tokens.managerA,
    ).expect(200);
    expect(
      branchList.body.items.map((deal: { _id: string }) => deal._id),
    ).toEqual([String(dealA._id)]);

    const allList = await auth(
      request(fixture.app).get('/deals'),
      fixture.tokens.finance,
    ).expect(200);
    expect(
      new Set(
        allList.body.items.map(
          (deal: { _id: string }) => deal._id,
        ),
      ),
    ).toEqual(
      new Set([String(dealA._id), String(dealB._id)]),
    );
  });

  it('rejects client-supplied monetary and branch fields on create and patch', async () => {
    expectError(
      await auth(
        request(fixture.app).post('/deals'),
        fixture.tokens.execA,
      ).send({
        title: 'Bypass attempt',
        customerId: String(fixture.customer._id),
        items: [
          {
            productId: String(fixture.product._id),
            qty: 1,
          },
        ],
        discountPct: 50,
      }),
      400,
      'VALIDATION_ERROR',
    );

    const deal = await createDirectDeal(
      fixture.users.execA._id,
      fixture.branchA._id,
      'Patch target',
    );

    expectError(
      await auth(
        request(fixture.app).patch(`/deals/${deal._id}`),
        fixture.tokens.execA,
      ).send({ discountPct: 50 }),
      400,
      'VALIDATION_ERROR',
    );

    expectError(
      await auth(
        request(fixture.app).patch(`/deals/${deal._id}`),
        fixture.tokens.execA,
      ).send({ total: 1 }),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('resolves approval bands at the 10%, 25%, 25.01% and 40.01% boundaries', async () => {
    const createDeal = async (title: string): Promise<string> => {
      const response = await auth(
        request(fixture.app).post('/deals'),
        fixture.tokens.execA,
      )
        .send({
          title,
          customerId: String(fixture.customer._id),
          items: [
            {
              productId: String(fixture.product._id),
              qty: 2,
            },
          ],
        })
        .expect(201);

      return response.body._id as string;
    };

    const autoDealId = await createDeal('Auto 10%');
    const autoRequest = await auth(
      request(fixture.app).post(
        `/deals/${autoDealId}/discount-requests`,
      ),
      fixture.tokens.execA,
    )
      .send({ pct: 10 })
      .expect(201);
    expect(autoRequest.body.status).toBe('auto_approved');
    expect(autoRequest.body.chain).toEqual([]);
    const autoDeal = await auth(
      request(fixture.app).get(`/deals/${autoDealId}`),
      fixture.tokens.execA,
    ).expect(200);
    expect(autoDeal.body.status).toBe('won');
    expect(autoDeal.body.discountPct).toBe(10);
    expect(autoDeal.body.total).toBe(18000);

    const managerDealId = await createDeal('Manager 25%');
    const managerRequest = await auth(
      request(fixture.app).post(
        `/deals/${managerDealId}/discount-requests`,
      ),
      fixture.tokens.execA,
    )
      .send({ pct: 25 })
      .expect(201);
    expect(managerRequest.body.chain).toEqual([
      { step: 1, roleKey: 'sales_manager' },
    ]);
    expect(managerRequest.body.currentRole).toBe('sales_manager');
    await auth(
      request(fixture.app).post(
        `/approvals/${managerRequest.body._id}/decide`,
      ),
      fixture.tokens.managerA,
    )
      .send({ action: 'approve' })
      .expect(200);
    const managerDeal = await auth(
      request(fixture.app).get(`/deals/${managerDealId}`),
      fixture.tokens.execA,
    ).expect(200);
    expect(managerDeal.body.status).toBe('won');

    const twoStepDealId = await createDeal('Two step 25.01%');
    const twoStepRequest = await auth(
      request(fixture.app).post(
        `/deals/${twoStepDealId}/discount-requests`,
      ),
      fixture.tokens.execA,
    )
      .send({ pct: 25.01 })
      .expect(201);
    expect(twoStepRequest.body.chain).toEqual([
      { step: 1, roleKey: 'sales_manager' },
      { step: 2, roleKey: 'finance' },
    ]);
    const afterManager = await auth(
      request(fixture.app).post(
        `/approvals/${twoStepRequest.body._id}/decide`,
      ),
      fixture.tokens.managerA,
    )
      .send({ action: 'approve' })
      .expect(200);
    expect(afterManager.body.request.currentRole).toBe('finance');
    await auth(
      request(fixture.app).post(
        `/approvals/${twoStepRequest.body._id}/decide`,
      ),
      fixture.tokens.finance,
    )
      .send({ action: 'approve' })
      .expect(200);
    const twoStepDeal = await auth(
      request(fixture.app).get(`/deals/${twoStepDealId}`),
      fixture.tokens.execA,
    ).expect(200);
    expect(twoStepDeal.body.status).toBe('won');

    const threeStepDealId = await createDeal('Three step 40.01%');
    const threeStepRequest = await auth(
      request(fixture.app).post(
        `/deals/${threeStepDealId}/discount-requests`,
      ),
      fixture.tokens.execA,
    )
      .send({ pct: 40.01 })
      .expect(201);
    expect(threeStepRequest.body.chain).toEqual([
      { step: 1, roleKey: 'sales_manager' },
      { step: 2, roleKey: 'finance' },
      { step: 3, roleKey: 'admin' },
    ]);

    for (const token of [
      fixture.tokens.managerA,
      fixture.tokens.finance,
      fixture.tokens.admin,
    ]) {
      await auth(
        request(fixture.app).post(
          `/approvals/${threeStepRequest.body._id}/decide`,
        ),
        token,
      )
        .send({ action: 'approve' })
        .expect(200);
    }

    const threeStepDeal = await auth(
      request(fixture.app).get(`/deals/${threeStepDealId}`),
      fixture.tokens.execA,
    ).expect(200);
    expect(threeStepDeal.body.status).toBe('won');
  });

  it('rejects out-of-order decisions and completes in sequence', async () => {
    const deal = await auth(
      request(fixture.app).post('/deals'),
      fixture.tokens.execA,
    )
      .send({
        title: 'Ordering deal',
        customerId: String(fixture.customer._id),
        items: [
          {
            productId: String(fixture.product._id),
            qty: 2,
          },
        ],
      })
      .expect(201);

    const approval = await auth(
      request(fixture.app).post(
        `/deals/${String(deal.body._id)}/discount-requests`,
      ),
      fixture.tokens.execA,
    )
      .send({ pct: 30 })
      .expect(201);

    const managerPending = await auth(
      request(fixture.app).get('/approvals/pending'),
      fixture.tokens.managerA,
    ).expect(200);
    expect(
      managerPending.body.items.map(
        (item: { _id: string }) => item._id,
      ),
    ).toContain(String(approval.body._id));

    const financePending = await auth(
      request(fixture.app).get('/approvals/pending'),
      fixture.tokens.finance,
    ).expect(200);
    expect(
      financePending.body.items.map(
        (item: { _id: string }) => item._id,
      ),
    ).not.toContain(String(approval.body._id));

    expectError(
      await auth(
        request(fixture.app).post(
          `/approvals/${String(approval.body._id)}/decide`,
        ),
        fixture.tokens.finance,
      ).send({ action: 'approve' }),
      409,
      'CONFLICT',
    );

    await auth(
      request(fixture.app).post(
        `/approvals/${String(approval.body._id)}/decide`,
      ),
      fixture.tokens.managerA,
    )
      .send({ action: 'approve' })
      .expect(200);

    await auth(
      request(fixture.app).post(
        `/approvals/${String(approval.body._id)}/decide`,
      ),
      fixture.tokens.finance,
    )
      .send({ action: 'approve' })
      .expect(200);

    const wonDeal = await auth(
      request(fixture.app).get(`/deals/${String(deal.body._id)}`),
      fixture.tokens.execA,
    ).expect(200);
    expect(wonDeal.body.status).toBe('won');
    expect(wonDeal.body.discountPct).toBe(30);

    const history = await ApprovalHistory.find({
      requestId: approval.body._id,
    })
      .sort({ timestamp: 1 })
      .lean()
      .exec();
    expect(
      history.map(
        (entry: ApprovalHistoryAttrs) => entry.action,
      ),
    ).toEqual(['requested', 'approve', 'approve']);
  });

  it('snapshots the chain for in-flight requests', async () => {
    const createDeal = async (title: string): Promise<string> => {
      const response = await auth(
        request(fixture.app).post('/deals'),
        fixture.tokens.execA,
      )
        .send({
          title,
          customerId: String(fixture.customer._id),
          items: [
            {
              productId: String(fixture.product._id),
              qty: 2,
            },
          ],
        })
        .expect(201);

      return response.body._id as string;
    };

    const firstDealId = await createDeal('Snapshot first');
    const firstRequest = await auth(
      request(fixture.app).post(
        `/deals/${firstDealId}/discount-requests`,
      ),
      fixture.tokens.execA,
    )
      .send({ pct: 30 })
      .expect(201);
    expect(firstRequest.body.chain).toHaveLength(2);

    await auth(
      request(fixture.app).put('/approval-config'),
      fixture.tokens.admin,
    )
      .send({
        bands: [
          { minPct: 0, maxPct: 10, chain: [] },
          {
            minPct: 10,
            maxPct: 25,
            chain: ['sales_manager'],
          },
          {
            minPct: 25,
            maxPct: 40,
            chain: ['sales_manager', 'finance', 'admin'],
          },
          {
            minPct: 40,
            maxPct: 100,
            chain: ['sales_manager', 'finance', 'admin'],
          },
        ],
      })
      .expect(200);

    const secondDealId = await createDeal('Snapshot second');
    const secondRequest = await auth(
      request(fixture.app).post(
        `/deals/${secondDealId}/discount-requests`,
      ),
      fixture.tokens.execA,
    )
      .send({ pct: 30 })
      .expect(201);
    expect(secondRequest.body.chain).toHaveLength(3);

    await auth(
      request(fixture.app).post(
        `/approvals/${String(firstRequest.body._id)}/decide`,
      ),
      fixture.tokens.managerA,
    )
      .send({ action: 'approve' })
      .expect(200);
    await auth(
      request(fixture.app).post(
        `/approvals/${String(firstRequest.body._id)}/decide`,
      ),
      fixture.tokens.finance,
    )
      .send({ action: 'approve' })
      .expect(200);

    const firstDeal = await auth(
      request(fixture.app).get(`/deals/${firstDealId}`),
      fixture.tokens.execA,
    ).expect(200);
    expect(firstDeal.body.status).toBe('won');

    await auth(
      request(fixture.app).put('/approval-config'),
      fixture.tokens.admin,
    )
      .send({
        bands: [
          { minPct: 0, maxPct: 10, chain: [] },
          {
            minPct: 10,
            maxPct: 25,
            chain: ['sales_manager'],
          },
          {
            minPct: 25,
            maxPct: 40,
            chain: ['sales_manager', 'finance'],
          },
          {
            minPct: 40,
            maxPct: 100,
            chain: ['sales_manager', 'finance', 'admin'],
          },
        ],
      })
      .expect(200);
  });

  it('applies one duplicate webhook and ignores the replayed copies', async () => {
    const { invoice } = await createInvoiceFixture('ext_duplicate');
    const eventId = randomUUID();
    const body = webhookBody(
      eventId,
      'ext_duplicate',
      'PAID',
      1,
    );

    for (let copy = 0; copy < 3; copy += 1) {
      await postWebhook(body).expect(200);
    }

    await waitFor(async () => {
      const applied = await IntegrationLog.countDocuments({
        eventId,
        outcome: 'applied',
      });
      const duplicates = await IntegrationLog.countDocuments({
        eventId,
        outcome: 'duplicate_ignored',
      });

      return applied === 1 && duplicates === 2;
    });

    const updated = await Invoice.findById(invoice._id).exec();
    expect(updated?.status).toBe('paid');
    expect(updated?.lastSequence).toBe(1);
    expect(await WebhookEvent.countDocuments({ eventId })).toBe(1);
  });

  it('keeps a paid invoice paid when an older VIEWED event arrives', async () => {
    const { invoice } = await createInvoiceFixture('ext_stale');
    const paidEventId = randomUUID();
    const viewedEventId = randomUUID();

    await postWebhook(
      webhookBody(paidEventId, 'ext_stale', 'PAID', 3),
    ).expect(200);
    await waitFor(async () => {
      const event = await WebhookEvent.findOne({
        eventId: paidEventId,
      }).exec();
      return event?.outcome === 'applied';
    });

    await postWebhook(
      webhookBody(viewedEventId, 'ext_stale', 'VIEWED', 2),
    ).expect(200);
    await waitFor(async () => {
      const event = await WebhookEvent.findOne({
        eventId: viewedEventId,
      }).exec();
      return event?.outcome === 'stale_ignored';
    });

    const updated = await Invoice.findById(invoice._id).exec();
    expect(updated?.status).toBe('paid');
    expect(updated?.lastSequence).toBe(3);
  });

  it('rejects a tampered webhook without changing state', async () => {
    const { invoice } = await createInvoiceFixture('ext_tampered');
    const eventId = randomUUID();
    const body = webhookBody(
      eventId,
      'ext_tampered',
      'PAID',
      1,
    );

    const response = await postWebhook(
      body,
      tamperSignature(body),
    );
    expectError(response, 401, 'BAD_SIGNATURE');

    await sleep(100);

    const updated = await Invoice.findById(invoice._id).exec();
    expect(updated?.status).toBe('sent');
    expect(await WebhookEvent.countDocuments({ eventId })).toBe(0);
    expect(
      await IntegrationLog.countDocuments({
        outcome: 'bad_signature',
      }),
    ).toBeGreaterThan(0);
  });

  it('parks orphaned webhooks and applies them after externalId linking', async () => {
    const { invoice } = await createInvoiceFixture(null);
    const eventId = randomUUID();

    await postWebhook(
      webhookBody(eventId, 'ext_orphan', 'PAID', 1),
    ).expect(200);
    await waitFor(async () => {
      const event = await WebhookEvent.findOne({ eventId }).exec();
      return event?.outcome === 'orphaned';
    });

    await Invoice.updateOne(
      { _id: invoice._id },
      { $set: { externalId: 'ext_orphan' } },
    ).exec();
    await reprocessOrphanedWebhookEvents('ext_orphan');

    const updated = await Invoice.findById(invoice._id).exec();
    const event = await WebhookEvent.findOne({ eventId }).exec();
    expect(updated?.status).toBe('paid');
    expect(event?.outcome).toBe('applied');
    expect(event?.invoiceId?.toString()).toBe(
      invoice._id.toString(),
    );
  });

  it('increments the payment ledger once for repeated paid deliveries', async () => {
    const { customer, invoice } = await createInvoiceFixture(
      'ext_balance',
    );

    await applyLedgerEntry({
      customerId: invoice.customerId,
      invoiceId: invoice._id,
      kind: 'receivable',
      amount: invoice.amount,
    });

    const eventBody = webhookBody(
      randomUUID(),
      'ext_balance',
      'PAID',
      1,
    );

    for (let copy = 0; copy < 3; copy += 1) {
      await postWebhook(eventBody).expect(200);
    }

    await waitFor(async () => {
      const entries = await BalanceEntry.countDocuments({
        invoiceId: invoice._id,
        kind: 'payment',
      });
      const customerDocument = await Customer.findById(
        customer._id,
      ).exec();

      return (
        entries === 1 &&
        customerDocument?.outstandingBalance === 0
      );
    });
  });

  it('creates one invoice on repeated convert and exactly one BillPort record on retry', async () => {
    const customer = await Customer.create({
      name: `Exactly once customer ${randomUUID()}`,
      outstandingBalance: 0,
    });
    const deal = await createDirectDeal(
      fixture.users.execA._id,
      fixture.branchA._id,
      `Exactly once deal ${randomUUID()}`,
      {
        customerId: customer._id,
        status: 'won',
        discountPct: 10,
        total: 18000,
      },
    );

    const firstConvert = await auth(
      request(fixture.app).post(`/deals/${deal._id}/convert`),
      fixture.tokens.finance,
    )
      .send({})
      .expect(200);
    const invoiceId = String(firstConvert.body.invoice._id);

    const secondConvert = await auth(
      request(fixture.app).post(`/deals/${deal._id}/convert`),
      fixture.tokens.finance,
    )
      .send({})
      .expect(200);
    expect(String(secondConvert.body.invoice._id)).toBe(invoiceId);
    expect(
      await Invoice.countDocuments({ dealId: deal._id }),
    ).toBe(1);
    expect(await Sale.countDocuments({ dealId: deal._id })).toBe(1);
    expect(
      await BalanceEntry.countDocuments({
        invoiceId: new Types.ObjectId(invoiceId),
        kind: 'receivable',
      }),
    ).toBe(1);

    const invoice = await Invoice.findById(invoiceId).exec();
    expect(invoice?.pushState).toBe('queued');
    expect(invoice?.externalId).toBeNull();

    await startBillportMock();
    billportRecords.clear();
    billportRequests = 0;
    billportFirstDelayMs = 400;

    await runPushWorkerCycle();
    await sleep(120);
    await runPushWorkerCycle();

    const pushed = await waitFor(async () => {
      const current = await Invoice.findById(invoiceId).exec();
      return current?.pushState === 'succeeded' &&
        current.externalId
        ? current
        : null;
    });

    expect(billportRecords.size).toBe(1);
    expect(billportRequests).toBeGreaterThanOrEqual(2);
    expect(pushed.externalId).toBe(
      billportRecords.values().next().value?.externalId,
    );

    const logs = await IntegrationLog.find({
      invoiceId: pushed._id,
      direction: 'outbound',
    })
      .lean()
      .exec();

    expect(
      logs.some(
        (log: IntegrationLogAttrs) =>
          log.outcome === 'push_succeeded' &&
          log.externalId === pushed.externalId,
      ),
    ).toBe(true);
    expect(
      logs.some(
        (log: IntegrationLogAttrs) =>
          log.outcome === 'retry_scheduled',
      ),
    ).toBe(true);
  });

  it('does not mutate a cancelled invoice after an in-flight push succeeds', async () => {
    const { invoice } = await createInvoiceFixture(null, 'pending');

    await Invoice.updateOne(
      { _id: invoice._id },
      {
        $set: {
          externalId: null,
          pushState: 'queued',
          pushAttempts: 0,
          nextAttemptAt: new Date(0),
          lockedUntil: null,
          lastError: null,
        },
      },
    ).exec();

    await startBillportMock();
    billportFirstDelayMs = 600;
    billportRequests = 0;

    const cycle = runPushWorkerCycle();
    await waitFor(async () => billportRequests > 0);

    await auth(
      request(fixture.app).post(`/invoices/${invoice._id}/cancel`),
      fixture.tokens.finance,
    ).expect(200);

    await cycle;

    const cancelled = await Invoice.findById(invoice._id).exec();
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.externalId).toBeNull();
    expect(cancelled?.pushState).not.toBe('succeeded');
  });

  it('rejects an invalid approval config without touching the stored bands', async () => {
    const before = (
      await ApprovalConfig.find().sort({ minPct: 1 }).lean().exec()
    ).map((band) => ({
      minPct: band.minPct,
      maxPct: band.maxPct,
      chain: band.chain,
    }));

    expectError(
      await auth(
        request(fixture.app).put('/approval-config'),
        fixture.tokens.admin,
      ).send({
        bands: [
          { minPct: 0, maxPct: 10, chain: [] },
          { minPct: 20, maxPct: 100, chain: ['sales_manager'] },
        ],
      }),
      400,
      'VALIDATION_ERROR',
    );

    const after = (
      await ApprovalConfig.find().sort({ minPct: 1 }).lean().exec()
    ).map((band) => ({
      minPct: band.minPct,
      maxPct: band.maxPct,
      chain: band.chain,
    }));

    expect(after).toEqual(before);
  });

  it('repairs a paid invoice that is missing its payment ledger entry', async () => {
    const { customer, invoice } = await createInvoiceFixture(
      'ext_paid_ledger_repair',
      'paid',
    );

    await applyLedgerEntry({
      customerId: invoice.customerId,
      invoiceId: invoice._id,
      kind: 'receivable',
      amount: invoice.amount,
    });

    expect(
      await BalanceEntry.countDocuments({
        invoiceId: invoice._id,
        kind: 'payment',
      }),
    ).toBe(0);

    await runReconcilerCycle();

    expect(
      await BalanceEntry.countDocuments({
        invoiceId: invoice._id,
        kind: 'payment',
      }),
    ).toBe(1);

    const repaired = await Customer.findById(customer._id).exec();
    expect(repaired?.outstandingBalance).toBe(0);
  });

  it('reconciles a missed payment and repairs balance drift', async () => {
    const { customer, invoice } = await createInvoiceFixture(
      'ext_reconcile',
      'sent',
    );

    await applyLedgerEntry({
      customerId: invoice.customerId,
      invoiceId: invoice._id,
      kind: 'receivable',
      amount: invoice.amount,
    });

    billportStatuses.set('ext_reconcile', 'PAID');
    await Customer.updateOne(
      { _id: customer._id },
      { $set: { outstandingBalance: 777 } },
    ).exec();

    await runReconcilerCycle();

    const reconciled = await Invoice.findById(invoice._id).exec();
    expect(reconciled?.status).toBe('paid');
    expect(reconciled?.lastSequence).toBe(3);

    const repaired = await Customer.findById(customer._id).exec();
    expect(repaired?.outstandingBalance).toBe(0);

    expect(
      await IntegrationLog.countDocuments({
        invoiceId: invoice._id,
        outcome: 'reconciled',
      }),
    ).toBeGreaterThanOrEqual(1);
    expect(
      await IntegrationLog.countDocuments({
        outcome: 'balance_repaired',
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  it('serves participant-only threads with unread counts', async () => {
    const created = await auth(
      request(fixture.app).post('/deals'),
      fixture.tokens.execA,
    )
      .send({
        title: 'Chat deal',
        customerId: String(fixture.customer._id),
        items: [
          {
            productId: String(fixture.product._id),
            qty: 1,
          },
        ],
      })
      .expect(201);
    const dealId = String(created.body._id);

    const execThreads = await auth(
      request(fixture.app).get('/threads'),
      fixture.tokens.execA,
    ).expect(200);
    expect(execThreads.body.nextCursor).toBeNull();

    const thread = execThreads.body.items.find(
      (item: { dealId: string }) => item.dealId === dealId,
    );
    expect(thread).toBeTruthy();
    expect(thread.threadId).toBeTruthy();

    expectError(
      await auth(
        request(fixture.app).get(
          `/threads/${String(thread.threadId)}/messages`,
        ),
        fixture.tokens.execB,
      ),
      404,
      'NOT_FOUND',
    );

    const sent = await auth(
      request(fixture.app).post(
        `/threads/${String(thread.threadId)}/messages`,
      ),
      fixture.tokens.execA,
    )
      .send({ body: 'Any update?' })
      .expect(201);
    expect(sent.body.message.body).toBe('Any update?');

    const managerThreads = await auth(
      request(fixture.app).get('/threads'),
      fixture.tokens.managerA,
    ).expect(200);
    const managerThread = managerThreads.body.items.find(
      (item: { dealId: string }) => item.dealId === dealId,
    );
    expect(managerThread.unreadCount).toBe(1);
    expect(managerThread.lastMessage.preview).toBe('Any update?');

    const read = await auth(
      request(fixture.app).post(
        `/threads/${String(thread.threadId)}/read`,
      ),
      fixture.tokens.managerA,
    ).expect(200);
    expect(read.body.ok).toBe(true);

    const afterRead = await auth(
      request(fixture.app).get('/threads'),
      fixture.tokens.managerA,
    ).expect(200);
    expect(
      afterRead.body.items.find(
        (item: { dealId: string }) => item.dealId === dealId,
      ).unreadCount,
    ).toBe(0);
  });

  it('paginates threads with an opaque cursor', async () => {
    for (const title of ['Paged thread one', 'Paged thread two']) {
      await auth(
        request(fixture.app).post('/deals'),
        fixture.tokens.execA,
      )
        .send({
          title,
          customerId: String(fixture.customer._id),
          items: [
            {
              productId: String(fixture.product._id),
              qty: 1,
            },
          ],
        })
        .expect(201);
    }

    const firstPage = await auth(
      request(fixture.app).get('/threads?limit=1'),
      fixture.tokens.execA,
    ).expect(200);

    expect(firstPage.body.items).toHaveLength(1);
    expect(typeof firstPage.body.nextCursor).toBe('string');

    const secondPage = await auth(
      request(fixture.app).get(
        `/threads?limit=1&cursor=${encodeURIComponent(
          firstPage.body.nextCursor,
        )}`,
      ),
      fixture.tokens.execA,
    ).expect(200);

    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.items[0].threadId).not.toBe(
      firstPage.body.items[0].threadId,
    );

    expectError(
      await auth(
        request(fixture.app).get('/threads?cursor=not-a-cursor'),
        fixture.tokens.execA,
      ),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('rejects unauthenticated sockets and delivers chat through rooms', async () => {
    const created = await auth(
      request(fixture.app).post('/deals'),
      fixture.tokens.execA,
    )
      .send({
        title: 'Socket deal',
        customerId: String(fixture.customer._id),
        items: [
          {
            productId: String(fixture.product._id),
            qty: 1,
          },
        ],
      })
      .expect(201);
    const dealId = String(created.body._id);

    const httpServer = http.createServer(fixture.app);
    const socketServer = new SocketServer(httpServer);
    registerSocketAuth(socketServer);
    new RealtimeGateway(socketServer).start();

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', resolve);
    });

    const { port } = httpServer.address() as AddressInfo;
    const url = `http://127.0.0.1:${port}`;
    const clients: ClientSocket[] = [];

    try {
      const rejected = ioClient(url, {
        auth: { token: 'not-a-token' },
        transports: ['websocket'],
        reconnection: false,
      });
      clients.push(rejected);

      const rejection = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('expected a handshake rejection')),
          5000,
        );

        rejected.once('connect', () => {
          clearTimeout(timer);
          reject(new Error('invalid token was accepted'));
        });
        rejected.once('connect_error', (error) => {
          clearTimeout(timer);
          resolve(error.message);
        });
      });
      expect(rejection).toContain('UNAUTHENTICATED');

      const execSocket = ioClient(url, {
        auth: { token: fixture.tokens.execA },
        transports: ['websocket'],
        reconnection: false,
      });
      const managerSocket = ioClient(url, {
        auth: { token: fixture.tokens.managerA },
        transports: ['websocket'],
        reconnection: false,
      });
      clients.push(execSocket, managerSocket);

      await Promise.all([
        onceConnect(execSocket),
        onceConnect(managerSocket),
      ]);

      const execJoin = await socketAck(execSocket, 'thread:join', {
        dealId,
      });
      const managerJoin = await socketAck(
        managerSocket,
        'thread:join',
        { dealId },
      );
      expect(execJoin.ok).toBe(true);
      expect(managerJoin.ok).toBe(true);

      const received = new Promise<{
        type: string;
        data: { message: { body: string; clientId?: string } };
      }>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('chat message was not delivered')),
          5000,
        );

        managerSocket.once('chat:message', (envelope) => {
          clearTimeout(timer);
          resolve(envelope);
        });
      });

      const sent = await socketAck(execSocket, 'message:send', {
        dealId,
        body: 'socket hello',
        clientId: 'client-1',
      });
      expect(sent.ok).toBe(true);

      const envelope = await received;
      expect(envelope.type).toBe('chat:message');
      expect(envelope.data.message.body).toBe('socket hello');
      expect(envelope.data.message.clientId).toBe('client-1');
    } finally {
      for (const client of clients) {
        client.close();
      }

      await new Promise<void>((resolve) => {
        socketServer.close(() => resolve());
      });
    }
  });
});
