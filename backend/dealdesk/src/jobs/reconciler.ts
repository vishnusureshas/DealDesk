import type { HydratedDocument } from 'mongoose';
import { Types } from 'mongoose';
import { env } from '../config/env';
import {
  getInvoiceStatus,
  type BillPortStatusResult,
} from '../integrations/billport.client';
import { writeIntegrationLog } from '../integrations/webhook.processor';
import { BalanceEntry } from '../models/BalanceEntry';
import { Customer } from '../models/Customer';
import {
  Invoice,
  type InvoiceAttrs,
  type InvoiceStatus,
} from '../models/Invoice';
import {
  WEBHOOK_EVENT_STATUSES,
  type WebhookEventStatus,
} from '../models/WebhookEvent';
import { applyLedgerEntry } from '../services/balance.service';
import {
  applyExternalStatus,
  type ExternalStatusResult,
} from '../services/transition.service';

const RECONCILABLE_STATUSES: InvoiceStatus[] = [
  'pending',
  'sent',
  'viewed',
];

const STATUS_RANK: Record<WebhookEventStatus, number> = {
  QUEUED: 0,
  SENT: 1,
  VIEWED: 2,
  PAID: 3,
  FAILED: 3,
};

const STATUS_SEQUENCE: Partial<Record<WebhookEventStatus, number>> = {
  SENT: 1,
  VIEWED: 2,
  PAID: 3,
  FAILED: 3,
};

let timer: NodeJS.Timeout | null = null;
let cycleRunning = false;

function isWebhookStatus(
  value: unknown,
): value is WebhookEventStatus {
  return (
    typeof value === 'string' &&
    (WEBHOOK_EVENT_STATUSES as readonly string[]).includes(value)
  );
}

async function logReconciled(
  invoice: HydratedDocument<InvoiceAttrs>,
  result: BillPortStatusResult,
  observedStatus: string | undefined,
  transitioned: boolean,
  transition?: ExternalStatusResult,
): Promise<void> {
  await writeIntegrationLog({
    direction: 'outbound',
    invoiceId: invoice._id,
    externalId: invoice.externalId,
    eventId: null,
    attempt: null,
    request: { externalId: invoice.externalId },
    response: {
      observedStatus: observedStatus ?? null,
      transitioned,
      previousStatus: transition?.from ?? null,
      status: transition?.to ?? invoice.status,
      error: result.error ?? null,
    },
    httpStatus: result.httpStatus,
    outcome: 'reconciled',
    durationMs: result.durationMs,
    at: new Date(),
  });
}

async function reconcileInvoice(
  invoice: HydratedDocument<InvoiceAttrs>,
): Promise<void> {
  const externalId = invoice.externalId;

  if (!externalId) {
    return;
  }

  await Invoice.updateOne(
    { _id: invoice._id },
    { $set: { lastSyncedAt: new Date() } },
  ).exec();

  const result = await getInvoiceStatus(externalId);

  if (
    result.httpStatus !== 200 ||
    !isWebhookStatus(result.status)
  ) {
    await logReconciled(
      invoice,
      result,
      result.status,
      false,
    );
    return;
  }

  const observedStatus = result.status;
  const sequence = STATUS_SEQUENCE[observedStatus];

  if (STATUS_RANK[observedStatus] === 0 || !sequence) {
    await logReconciled(
      invoice,
      result,
      observedStatus,
      false,
    );
    return;
  }

  const transition = await applyExternalStatus(
    invoice,
    observedStatus,
    sequence,
    'reconcile',
  );

  await logReconciled(
    invoice,
    result,
    observedStatus,
    transition.applied,
    transition,
  );
}

async function repairPaidLedgerEntries(): Promise<void> {
  const paidInvoices = await Invoice.find({ status: 'paid' })
    .select('_id customerId amount')
    .exec();

  for (const invoice of paidInvoices) {
    await applyLedgerEntry({
      customerId: invoice.customerId,
      invoiceId: invoice._id,
      kind: 'payment',
      amount: invoice.amount,
    });
  }
}

async function repairBalances(): Promise<void> {
  const rows = await BalanceEntry.aggregate<{
    _id: Types.ObjectId;
    net: number;
  }>([
    {
      $group: {
        _id: '$customerId',
        net: {
          $sum: {
            $cond: [
              { $eq: ['$kind', 'receivable'] },
              '$amount',
              { $multiply: ['$amount', -1] },
            ],
          },
        },
      },
    },
  ]).exec();
  const expectedByCustomer = new Map(
    rows.map((row) => [row._id.toString(), row.net]),
  );
  const customers = await Customer.find({})
    .select('_id outstandingBalance')
    .exec();

  for (const customer of customers) {
    const expected =
      expectedByCustomer.get(customer._id.toString()) ?? 0;

    if (customer.outstandingBalance === expected) {
      continue;
    }

    const previous = customer.outstandingBalance;

    await Customer.updateOne(
      { _id: customer._id },
      { $set: { outstandingBalance: expected } },
    ).exec();

    await writeIntegrationLog({
      direction: 'outbound',
      invoiceId: null,
      externalId: null,
      eventId: null,
      attempt: null,
      request: {
        customerId: customer._id.toString(),
        previous,
        expected,
      },
      response: { repaired: true },
      httpStatus: null,
      outcome: 'balance_repaired',
      durationMs: null,
      at: new Date(),
    });
  }
}

async function runCycle(): Promise<void> {
  if (cycleRunning) {
    return;
  }

  cycleRunning = true;

  try {
    const staleBefore = new Date(
      Date.now() - env.RECON_STALE_MINUTES * 60_000,
    );
    const candidates = await Invoice.find({
      externalId: { $ne: null },
      status: { $in: RECONCILABLE_STATUSES },
      $or: [
        { lastSyncedAt: null },
        { lastSyncedAt: { $lt: staleBefore } },
      ],
    }).exec();

    for (const invoice of candidates) {
      await reconcileInvoice(invoice);
    }

    await repairPaidLedgerEntries();
    await repairBalances();
  } catch (error) {
    console.error('[reconciler] Cycle failed', error);
  } finally {
    cycleRunning = false;
  }
}

export async function runReconcilerCycle(): Promise<void> {
  await runCycle();
}

export function startReconciler(): void {
  if (timer) {
    return;
  }

  void runCycle();
  timer = setInterval(() => {
    void runCycle();
  }, env.RECON_INTERVAL_SECONDS * 1000);
}

export function stopReconciler(): void {
  if (!timer) {
    return;
  }

  clearInterval(timer);
  timer = null;
}
