import type { HydratedDocument } from 'mongoose';
import { env } from '../config/env';
import {
  BillingInvoice,
  type BillingInvoiceAttrs,
  type BillingInvoiceStage,
} from '../models/BillingInvoice';
import { sign } from '../utils/hmac';

export interface WebhookEvent {
  eventId: string;
  status: BillingInvoiceStage;
  sequence: number;
  occurredAt: Date;
}

export interface DeliveryResult {
  delivered: boolean;
  retried: boolean;
  status: number | null;
}

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 3000;
const RETRY_DELAY_MS = 3000;
const TICK_INTERVAL_MS = 1000;

const inFlight = new Set<string>();
const invoiceQueues = new Map<string, Promise<void>>();
let ticker: NodeJS.Timeout | null = null;
let ticking = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function computeLogicalStage(
  invoice: Pick<BillingInvoiceAttrs, 'scheduledEvents'>,
  now: Date = new Date(),
): BillingInvoiceStage {
  const dueEvents = invoice.scheduledEvents
    .filter((event) => event.occurredAt.getTime() <= now.getTime())
    .sort((left, right) => left.sequence - right.sequence);

  return dueEvents.length > 0
    ? dueEvents[dueEvents.length - 1].status
    : 'QUEUED';
}

export async function deliverWebhook(
  externalId: string,
  event: WebhookEvent,
  options: { tampered?: boolean } = {},
): Promise<DeliveryResult> {
  const payload = {
    eventId: event.eventId,
    externalId,
    status: event.status,
    sequence: event.sequence,
    occurredAt: event.occurredAt.toISOString(),
  };
  const rawBody = JSON.stringify(payload);
  const tampered =
    options.tampered ?? Math.random() < env.BAD_SIG_RATE;
  const signature = sign(
    rawBody,
    tampered ? 'wrong-secret' : env.BILLPORT_SHARED_SECRET,
  );

  let retried = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    if (attempt > 0) {
      retried = true;
      await sleep(RETRY_DELAY_MS);
    }

    try {
      const response = await fetch(env.DEALDESK_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Signature': signature,
        },
        body: rawBody,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 401) {
        console.log(
          `[webhook] ${externalId} ${event.status} rejected with 401`,
        );
        return { delivered: false, retried, status: 401 };
      }

      if (response.ok) {
        console.log(
          `[webhook] ${externalId} ${event.status} delivered ${response.status}`,
        );
        return { delivered: true, retried, status: response.status };
      }

      if (response.status >= 500 && attempt < MAX_RETRIES) {
        console.warn(
          `[webhook] ${externalId} ${event.status} got ${response.status}; retrying`,
        );
        continue;
      }

      console.warn(
        `[webhook] ${externalId} ${event.status} failed with ${response.status}`,
      );
      return { delivered: false, retried, status: response.status };
    } catch (error) {
      if (attempt < MAX_RETRIES) {
        console.warn(
          `[webhook] ${externalId} ${event.status} attempt ${attempt + 1} failed; retrying`,
        );
        continue;
      }

      console.error(
        `[webhook] ${externalId} ${event.status} exhausted retries`,
        error,
      );
      return { delivered: false, retried: true, status: null };
    }
  }

  return { delivered: false, retried, status: null };
}

async function advanceLogicalStage(
  invoice: HydratedDocument<BillingInvoiceAttrs>,
  now: Date,
): Promise<void> {
  const stage = computeLogicalStage(invoice, now);

  if (invoice.logicalStage !== stage) {
    invoice.logicalStage = stage;
    await invoice.save();
  }
}

async function deliverScheduledEvent(
  externalId: string,
  eventId: string,
  kind: 'primary' | 'duplicate',
): Promise<void> {
  const key = `${externalId}:${eventId}:${kind}`;

  if (inFlight.has(key)) {
    return;
  }

  inFlight.add(key);

  try {
    const invoice = await BillingInvoice.findOne({ externalId }).exec();

    if (!invoice || invoice.paused) {
      return;
    }

    const event = invoice.scheduledEvents.find(
      (candidate) => candidate.eventId === eventId,
    );

    if (!event) {
      return;
    }

    const now = new Date();

    if (kind === 'primary') {
      if (
        event.deliveredAt ||
        event.deliverAt.getTime() > now.getTime()
      ) {
        return;
      }
    } else if (
      !event.duplicateDeliverAt ||
      event.duplicateDeliverAt.getTime() > now.getTime()
    ) {
      return;
    }

    const result = await deliverWebhook(externalId, event);

    if (kind === 'primary') {
      event.deliveredAt = new Date();
    } else {
      event.duplicateDeliverAt = null;
    }

    event.retried = event.retried || result.retried;
    await invoice.save();
  } finally {
    inFlight.delete(key);
  }
}

function enqueueDelivery(
  externalId: string,
  eventId: string,
  kind: 'primary' | 'duplicate',
): void {
  const queueKey = externalId;
  const previous = invoiceQueues.get(queueKey) ?? Promise.resolve();
  const next = previous
    .then(() => deliverScheduledEvent(externalId, eventId, kind))
    .catch((error) => {
      console.error('[webhook] delivery task failed', error);
    });

  let queued: Promise<void>;
  queued = next.finally(() => {
    if (invoiceQueues.get(queueKey) === queued) {
      invoiceQueues.delete(queueKey);
    }
  });
  invoiceQueues.set(queueKey, queued);
}

export async function tick(now: Date = new Date()): Promise<void> {
  const invoices = await BillingInvoice.find({}).exec();

  for (const invoice of invoices) {
    await advanceLogicalStage(invoice, now);

    if (invoice.paused) {
      continue;
    }

    for (const event of invoice.scheduledEvents) {
      if (
        !event.deliveredAt &&
        event.deliverAt.getTime() <= now.getTime()
      ) {
        enqueueDelivery(invoice.externalId, event.eventId, 'primary');
      }

      if (
        event.duplicateDeliverAt &&
        event.duplicateDeliverAt.getTime() <= now.getTime()
      ) {
        enqueueDelivery(invoice.externalId, event.eventId, 'duplicate');
      }
    }
  }
}

export function startWebhookTicker(): void {
  if (ticker) {
    return;
  }

  ticker = setInterval(() => {
    if (ticking) {
      return;
    }

    ticking = true;
    void tick()
      .catch((error) => {
        console.error('[webhook] tick failed', error);
      })
      .finally(() => {
        ticking = false;
      });
  }, TICK_INTERVAL_MS);

  ticker.unref?.();
  console.log('[webhook] ticker started');
}

export function stopWebhookTicker(): void {
  if (!ticker) {
    return;
  }

  clearInterval(ticker);
  ticker = null;
  console.log('[webhook] ticker stopped');
}
