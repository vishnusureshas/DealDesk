import { randomUUID } from 'node:crypto';
import type { HydratedDocument } from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env';
import {
  BillingInvoice,
  type BillingInvoiceAttrs,
  type BillingInvoiceStage,
  type BillingScheduledEvent,
} from '../models/BillingInvoice';
import { ApiError } from '../utils/ApiError';
import { verify } from '../utils/hmac';
import {
  computeLogicalStage,
  deliverWebhook,
} from './webhookEmitter';

const createInvoiceSchema = z
  .object({
    reference: z.string().trim().min(1),
    customer: z.record(z.string(), z.unknown()),
    amount: z.number().int().min(0),
    currency: z.string().trim().min(1).max(10),
    lineItems: z.array(z.unknown()).default([]),
    issuedAt: z.iso.datetime(),
  })
  .strict();

export interface CreateInvoiceInput {
  rawBody: Buffer;
  signature?: string;
  idempotencyKey?: string;
}

export interface CreateInvoiceResult {
  externalId: string;
  status: BillingInvoiceStage;
}

export interface DebugSendInput {
  externalId: string;
  status: BillingInvoiceStage;
  sequence: number;
  occurredAt?: string;
  tampered?: boolean;
}

export interface DebugReplayInput {
  externalId: string;
  eventId: string;
}

export interface DebugSendResult {
  eventId: string;
  externalId: string;
  status: BillingInvoiceStage;
  sequence: number;
  sentAt: string;
}

let deliveryPaused = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelaySeconds(): number {
  return (
    env.EVENT_MIN_DELAY_SECONDS +
    Math.floor(
      Math.random() *
        (env.EVENT_MAX_DELAY_SECONDS -
          env.EVENT_MIN_DELAY_SECONDS +
          1),
    )
  );
}

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

export function buildScheduledEvents(
  now: Date,
): BillingScheduledEvent[] {
  const sentAt = addSeconds(now, randomDelaySeconds());
  const viewedAt = addSeconds(sentAt, randomDelaySeconds());
  const finalAt = addSeconds(viewedAt, randomDelaySeconds());
  const finalStatus: BillingInvoiceStage =
    Math.random() < 0.2 ? 'FAILED' : 'PAID';

  const events: BillingScheduledEvent[] = [
    {
      eventId: randomUUID(),
      status: 'SENT',
      sequence: 1,
      occurredAt: sentAt,
      deliverAt: sentAt,
      deliveredAt: null,
      duplicateDeliverAt: null,
      retried: false,
    },
    {
      eventId: randomUUID(),
      status: 'VIEWED',
      sequence: 2,
      occurredAt: viewedAt,
      deliverAt: viewedAt,
      deliveredAt: null,
      duplicateDeliverAt: null,
      retried: false,
    },
    {
      eventId: randomUUID(),
      status: finalStatus,
      sequence: 3,
      occurredAt: finalAt,
      deliverAt: finalAt,
      deliveredAt: null,
      duplicateDeliverAt: null,
      retried: false,
    },
  ];

  if (Math.random() < 0.3) {
    const viewedDeliverAt = events[1].deliverAt;
    events[1].deliverAt = events[2].deliverAt;
    events[2].deliverAt = viewedDeliverAt;
  }

  for (const event of events) {
    if (Math.random() < env.DUP_RATE) {
      event.duplicateDeliverAt = addSeconds(
        event.deliverAt,
        2 + Math.floor(Math.random() * 4),
      );
    }
  }

  return events;
}

async function findInvoice(externalId: string) {
  const invoice = await BillingInvoice.findOne({ externalId }).exec();

  if (!invoice) {
    throw new ApiError(404, 'NOT_FOUND', 'Invoice not found');
  }

  return invoice;
}

async function syncLogicalStage(
  invoice: Awaited<ReturnType<typeof findInvoice>>,
): Promise<void> {
  const stage = computeLogicalStage(invoice);

  if (invoice.logicalStage !== stage) {
    invoice.logicalStage = stage;
    await invoice.save();
  }
}

async function idempotentResult(
  invoice: Awaited<ReturnType<typeof findInvoice>>,
): Promise<CreateInvoiceResult> {
  await syncLogicalStage(invoice);

  return {
    externalId: invoice.externalId,
    status: invoice.logicalStage,
  };
}

export async function isDeliveryPaused(): Promise<boolean> {
  return (
    deliveryPaused ||
    (await BillingInvoice.exists({ paused: true })) !== null
  );
}

export async function pauseDelivery() {
  deliveryPaused = true;
  await BillingInvoice.updateMany(
    {},
    { $set: { paused: true } },
  ).exec();

  return { paused: true };
}

export async function resumeDelivery() {
  deliveryPaused = false;
  await BillingInvoice.updateMany(
    {},
    { $set: { paused: false } },
  ).exec();

  return { paused: false };
}

export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<CreateInvoiceResult> {
  if (!input.signature || !verify(input.rawBody, input.signature)) {
    throw new ApiError(
      401,
      'BAD_SIGNATURE',
      'Invalid signature',
    );
  }

  const idempotencyKey = input.idempotencyKey?.trim();

  if (!idempotencyKey) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'Idempotency-Key header is required',
    );
  }

  const existing = await BillingInvoice.findOne({
    idempotencyKey,
  }).exec();

  if (existing) {
    return idempotentResult(existing);
  }

  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(input.rawBody.toString('utf8'));
  } catch {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid JSON body');
  }

  const parsed = createInvoiceSchema.safeParse(parsedBody);

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => {
        const path = issue.path.map(String).join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; ');

    throw new ApiError(400, 'VALIDATION_ERROR', message);
  }

  const roll = Math.random();

  if (roll < env.FAIL_RATE) {
    throw new ApiError(
      503,
      'BILLPORT_UNAVAILABLE',
      'Temporary billing failure',
    );
  }

  const shouldDelay = roll < env.FAIL_RATE + env.SLOW_RATE;
  const now = new Date();
  const externalId = randomUUID();
  const scheduledEvents = buildScheduledEvents(now);
  const paused = await isDeliveryPaused();

  let invoice: HydratedDocument<BillingInvoiceAttrs>;

  try {
    invoice = await BillingInvoice.create({
      externalId,
      idempotencyKey,
      reference: parsed.data.reference,
      customer: parsed.data.customer,
      amount: parsed.data.amount,
      currency: parsed.data.currency,
      lineItems: parsed.data.lineItems,
      issuedAt: new Date(parsed.data.issuedAt),
      logicalStage: 'QUEUED',
      scheduledEvents,
      paused,
    });
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const concurrent = await BillingInvoice.findOne({
        idempotencyKey,
      }).exec();

      if (concurrent) {
        return idempotentResult(concurrent);
      }
    }

    throw error;
  }

  if (shouldDelay) {
    console.log(
      `[billing] ${externalId} stored; simulating a 6s slow response`,
    );
    await sleep(6000);
  }

  return {
    externalId: invoice.externalId,
    status: invoice.logicalStage,
  };
}

export async function getInvoiceStatus(externalId: string) {
  const invoice = await findInvoice(externalId);
  await syncLogicalStage(invoice);

  return {
    externalId: invoice.externalId,
    status: invoice.logicalStage,
    updatedAt: invoice.updatedAt,
  };
}

export async function getInvoiceState(externalId: string) {
  const invoice = await findInvoice(externalId);
  await syncLogicalStage(invoice);

  return invoice.toObject();
}

export async function sendDebugWebhook(
  input: DebugSendInput,
): Promise<DebugSendResult> {
  const invoice = await findInvoice(input.externalId);
  const scheduled = invoice.scheduledEvents.find(
    (event) => event.sequence === input.sequence,
  );
  const eventId = scheduled?.eventId ?? randomUUID();
  const occurredAt = input.occurredAt
    ? new Date(input.occurredAt)
    : (scheduled?.occurredAt ?? new Date());

  if (Number.isNaN(occurredAt.getTime())) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      'occurredAt must be a valid ISO timestamp',
    );
  }

  await deliverWebhook(
    invoice.externalId,
    {
      eventId,
      status: input.status,
      sequence: input.sequence,
      occurredAt,
    },
    { tampered: input.tampered },
  );

  return {
    eventId,
    externalId: invoice.externalId,
    status: input.status,
    sequence: input.sequence,
    sentAt: new Date().toISOString(),
  };
}

export async function replayDebugWebhook(
  input: DebugReplayInput,
): Promise<DebugSendResult> {
  const invoice = await findInvoice(input.externalId);
  const event = invoice.scheduledEvents.find(
    (candidate) => candidate.eventId === input.eventId,
  );

  if (!event) {
    throw new ApiError(404, 'NOT_FOUND', 'Event not found');
  }

  await deliverWebhook(invoice.externalId, event);

  return {
    eventId: event.eventId,
    externalId: invoice.externalId,
    status: event.status,
    sequence: event.sequence,
    sentAt: new Date().toISOString(),
  };
}
