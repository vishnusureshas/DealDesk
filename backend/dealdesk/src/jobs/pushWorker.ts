import type { HydratedDocument } from 'mongoose';
import { env } from '../config/env';
import type { BillPortPushResult } from '../integrations/billport.client';
import { pushInvoice } from '../integrations/billport.client';
import { reprocessOrphanedWebhookEvents } from '../integrations/webhook.processor';
import {
  IntegrationLog,
  type IntegrationLogAttrs,
} from '../models/IntegrationLog';
import {
  Invoice,
  type InvoiceAttrs,
  type InvoiceStatus,
} from '../models/Invoice';
import { nextRetryDelayMs } from '../utils/backoff';

const TERMINAL_STATUSES: InvoiceStatus[] = [
  'paid',
  'failed',
  'cancelled',
];

let timer: NodeJS.Timeout | null = null;
let cycleRunning = false;

async function writeLog(entry: IntegrationLogAttrs): Promise<void> {
  try {
    await IntegrationLog.create(entry);
  } catch (error) {
    console.error('[pushWorker] Failed to write integration log', error);
  }
}

async function claimInvoice(
  now: Date,
): Promise<HydratedDocument<InvoiceAttrs> | null> {
  return Invoice.findOneAndUpdate(
    {
      status: { $ne: 'cancelled' },
      $or: [
        { pushState: 'queued', nextAttemptAt: { $lte: now } },
        { pushState: 'in_flight', lockedUntil: { $lt: now } },
      ],
    },
    {
      $set: {
        pushState: 'in_flight',
        lockedUntil: new Date(
          now.getTime() + env.PUSH_TIMEOUT_MS + 5000,
        ),
      },
      $inc: { pushAttempts: 1 },
    },
    {
      new: true,
      sort: { nextAttemptAt: 1 },
    },
  ).exec();
}

function isRetryable(result: BillPortPushResult): boolean {
  if (result.httpStatus === null) {
    return true;
  }

  if (result.httpStatus >= 500) {
    return true;
  }

  if (result.httpStatus === 408 || result.httpStatus === 429) {
    return true;
  }

  return false;
}

async function logOutcome(
  invoice: HydratedDocument<InvoiceAttrs>,
  result: BillPortPushResult,
  attempt: number,
  outcome: IntegrationLogAttrs['outcome'],
  at: Date,
  externalId = result.externalId ?? invoice.externalId,
): Promise<void> {
  await writeLog({
    direction: 'outbound',
    invoiceId: invoice._id,
    externalId,
    eventId: null,
    attempt,
    request: result.request,
    response: result.response,
    httpStatus: result.httpStatus,
    outcome,
    durationMs: result.durationMs,
    at,
  });
}

async function recordSuccess(
  invoice: HydratedDocument<InvoiceAttrs>,
  result: BillPortPushResult,
  externalId: string,
  attempt: number,
  at: Date,
): Promise<void> {
  await Invoice.updateOne(
    {
      _id: invoice._id,
      status: { $nin: TERMINAL_STATUSES },
    },
    { $set: { status: 'pending' } },
  ).exec();

  const updated = await Invoice.updateOne(
    {
      _id: invoice._id,
      status: { $ne: 'cancelled' },
    },
    {
      $set: {
        externalId,
        pushState: 'succeeded',
        lockedUntil: null,
        nextAttemptAt: null,
        lastError: null,
        lastSyncedAt: at,
      },
    },
  ).exec();

  if (updated.matchedCount === 0) {
    return;
  }

  await logOutcome(
    invoice,
    result,
    attempt,
    'push_succeeded',
    at,
    externalId,
  );

  try {
    await reprocessOrphanedWebhookEvents(externalId);
  } catch (error) {
    console.error(
      '[pushWorker] Failed to reprocess orphaned webhook events',
      error,
    );
  }
}

async function recordTerminalFailure(
  invoice: HydratedDocument<InvoiceAttrs>,
  result: BillPortPushResult,
  attempt: number,
  at: Date,
): Promise<void> {
  const error =
    result.error ??
    `BillPort responded with HTTP ${result.httpStatus ?? 'unknown'}`;

  const updated = await Invoice.updateOne(
    {
      _id: invoice._id,
      status: { $ne: 'cancelled' },
    },
    {
      $set: {
        pushState: 'failed',
        lastError: error,
        lockedUntil: null,
        nextAttemptAt: null,
      },
    },
  ).exec();

  if (updated.matchedCount === 0) {
    return;
  }

  await logOutcome(
    invoice,
    result,
    attempt,
    'push_failed_terminal',
    at,
  );
}

async function recordRetryableFailure(
  invoice: HydratedDocument<InvoiceAttrs>,
  result: BillPortPushResult,
  attempt: number,
  at: Date,
): Promise<void> {
  const error =
    result.error ??
    `BillPort responded with HTTP ${result.httpStatus ?? 'unknown'}`;

  if (attempt >= env.PUSH_MAX_ATTEMPTS) {
    await recordTerminalFailure(invoice, result, attempt, at);
    return;
  }

  const delayMs = nextRetryDelayMs(
    attempt,
    env.PUSH_BASE_DELAY_MS,
    env.PUSH_MAX_DELAY_MS,
  );

  const updated = await Invoice.updateOne(
    {
      _id: invoice._id,
      status: { $ne: 'cancelled' },
    },
    {
      $set: {
        pushState: 'queued',
        lastError: error,
        nextAttemptAt: new Date(at.getTime() + delayMs),
        lockedUntil: null,
      },
    },
  ).exec();

  if (updated.matchedCount === 0) {
    return;
  }

  await logOutcome(
    invoice,
    result,
    attempt,
    'retry_scheduled',
    at,
  );
}

function thrownPushResult(
  error: unknown,
  durationMs: number,
): BillPortPushResult {
  return {
    httpStatus: null,
    durationMs,
    error:
      error instanceof Error ? error.message : 'BillPort push failed',
    request: { invoiceId: null },
    response: null,
  };
}

async function processInvoice(
  invoice: HydratedDocument<InvoiceAttrs>,
): Promise<void> {
  const attempt = invoice.pushAttempts;
  const startedAt = Date.now();
  let result: BillPortPushResult;

  try {
    result = await pushInvoice(invoice);
  } catch (error) {
    // A broken reference must fail this invoice, not abort the whole cycle.
    result = thrownPushResult(error, Date.now() - startedAt);
  }

  const at = new Date();

  await logOutcome(
    invoice,
    result,
    attempt,
    'push_attempt',
    at,
  );

  if (
    result.httpStatus !== null &&
    result.httpStatus >= 200 &&
    result.httpStatus < 300 &&
    result.externalId
  ) {
    await recordSuccess(
      invoice,
      result,
      result.externalId,
      attempt,
      at,
    );
    return;
  }

  if (isRetryable(result)) {
    await recordRetryableFailure(invoice, result, attempt, at);
    return;
  }

  await recordTerminalFailure(invoice, result, attempt, at);
}

async function runCycle(): Promise<void> {
  if (cycleRunning) {
    return;
  }

  cycleRunning = true;

  try {
    let invoice = await claimInvoice(new Date());

    while (invoice) {
      try {
        await processInvoice(invoice);
      } catch (error) {
        console.error(
          `[pushWorker] Invoice ${invoice._id.toString()} failed`,
          error,
        );
      }

      invoice = await claimInvoice(new Date());
    }
  } catch (error) {
    console.error('[pushWorker] Cycle failed', error);
  } finally {
    cycleRunning = false;
  }
}

export async function runPushWorkerCycle(): Promise<void> {
  await runCycle();
}

export function startPushWorker(): void {
  if (timer) {
    return;
  }

  void runCycle();
  timer = setInterval(() => {
    void runCycle();
  }, env.WORKER_POLL_MS);
}

export function stopPushWorker(): void {
  if (!timer) {
    return;
  }

  clearInterval(timer);
  timer = null;
}
