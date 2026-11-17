import type { HydratedDocument } from 'mongoose';
import {
  IntegrationLog,
  type IntegrationLogAttrs,
} from '../models/IntegrationLog';
import { Invoice } from '../models/Invoice';
import {
  WebhookEvent,
  type WebhookEventAttrs,
  type WebhookEventOutcome,
  type WebhookEventStatus,
} from '../models/WebhookEvent';
import { applyExternalStatus } from '../services/transition.service';

export interface BillPortWebhookEvent {
  eventId: string;
  externalId: string;
  status: WebhookEventStatus;
  sequence: number;
  occurredAt: Date;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

function eventRequest(
  event: BillPortWebhookEvent,
): Record<string, unknown> {
  return {
    eventId: event.eventId,
    externalId: event.externalId,
    status: event.status,
    sequence: event.sequence,
    occurredAt: event.occurredAt.toISOString(),
  };
}

export async function writeIntegrationLog(
  entry: IntegrationLogAttrs,
): Promise<void> {
  try {
    await IntegrationLog.create(entry);
  } catch (error) {
    console.error('[webhook] Failed to write integration log', error);
  }
}

async function logEvent(
  event: BillPortWebhookEvent,
  invoiceId: HydratedDocument<WebhookEventAttrs>['invoiceId'],
  outcome: IntegrationLogAttrs['outcome'],
  response: Record<string, unknown>,
  startedAt: number,
): Promise<void> {
  await writeIntegrationLog({
    direction: 'inbound',
    invoiceId,
    externalId: event.externalId,
    eventId: event.eventId,
    attempt: null,
    request: eventRequest(event),
    response,
    httpStatus: 200,
    outcome,
    durationMs: Date.now() - startedAt,
    at: new Date(),
  });
}

async function markEvent(
  eventId: string,
  outcome: WebhookEventOutcome,
  invoiceId: HydratedDocument<WebhookEventAttrs>['invoiceId'],
): Promise<void> {
  await WebhookEvent.updateOne(
    { eventId },
    { $set: { outcome, invoiceId } },
  ).exec();
}

export async function processWebhookEvent(
  event: BillPortWebhookEvent,
): Promise<void> {
  const startedAt = Date.now();
  const receivedAt = new Date();

  try {
    await WebhookEvent.create({
      eventId: event.eventId,
      externalId: event.externalId,
      invoiceId: null,
      status: event.status,
      sequence: event.sequence,
      occurredAt: event.occurredAt,
      receivedAt,
      outcome: 'received',
    });
  } catch (error) {
    if (!isDuplicateKeyError(error)) {
      throw error;
    }

    const existing = await WebhookEvent.findOne({
      eventId: event.eventId,
    }).exec();

    await logEvent(
      event,
      existing?.invoiceId ?? null,
      'duplicate_ignored',
      { outcome: 'duplicate_ignored' },
      startedAt,
    );
    return;
  }

  const invoice = await Invoice.findOne({
    externalId: event.externalId,
  }).exec();

  if (!invoice) {
    await markEvent(event.eventId, 'orphaned', null);
    await logEvent(
      event,
      null,
      'orphan_parked',
      {
        outcome: 'orphan_parked',
        sequence: event.sequence,
        status: event.status,
      },
      startedAt,
    );
    return;
  }

  const transition = await applyExternalStatus(
    invoice,
    event.status,
    event.sequence,
    'webhook',
    event.eventId,
  );
  const outcome: WebhookEventOutcome = transition.applied
    ? 'applied'
    : 'stale_ignored';

  await markEvent(event.eventId, outcome, invoice._id);
  await logEvent(
    event,
    invoice._id,
    outcome,
    {
      outcome,
      previousStatus: transition.from,
      status: transition.to,
      sequence: event.sequence,
    },
    startedAt,
  );
}

async function reprocessOrphan(
  event: HydratedDocument<WebhookEventAttrs>,
): Promise<void> {
  const startedAt = Date.now();
  const invoice = await Invoice.findOne({
    externalId: event.externalId,
  }).exec();

  if (!invoice) {
    return;
  }

  const transition = await applyExternalStatus(
    invoice,
    event.status,
    event.sequence,
    'webhook',
    event.eventId,
  );
  const outcome: WebhookEventOutcome = transition.applied
    ? 'applied'
    : 'stale_ignored';

  await markEvent(event.eventId, outcome, invoice._id);
  await logEvent(
    {
      eventId: event.eventId,
      externalId: event.externalId,
      status: event.status,
      sequence: event.sequence,
      occurredAt: event.occurredAt,
    },
    invoice._id,
    outcome,
    {
      outcome,
      previousStatus: transition.from,
      status: transition.to,
      sequence: event.sequence,
    },
    startedAt,
  );
}

export async function reprocessOrphanedWebhookEvents(
  externalId: string,
): Promise<void> {
  const events = await WebhookEvent.find({
    externalId,
    outcome: 'orphaned',
  })
    .sort({ sequence: 1 })
    .exec();

  for (const event of events) {
    await reprocessOrphan(event);
  }
}
