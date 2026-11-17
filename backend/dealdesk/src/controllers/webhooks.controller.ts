import type { RequestHandler } from 'express';
import { z } from 'zod';
import {
  processWebhookEvent,
  writeIntegrationLog,
  type BillPortWebhookEvent,
} from '../integrations/webhook.processor';
import { WEBHOOK_EVENT_STATUSES } from '../models/WebhookEvent';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { verify } from '../utils/hmac';

const webhookPayloadSchema = z
  .object({
    eventId: z.string().trim().min(1),
    externalId: z.string().trim().min(1),
    status: z.enum(WEBHOOK_EVENT_STATUSES),
    sequence: z.number().int().min(0),
    occurredAt: z.iso.datetime(),
  })
  .strict();

function toLogRecord(value: unknown): Record<string, unknown> {
  if (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  return { value };
}

function extractStringField(
  value: unknown,
  field: string,
): string | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const candidate = (value as Record<string, unknown>)[field];

  return typeof candidate === 'string' ? candidate : null;
}

export const handleBillPortWebhook: RequestHandler = asyncHandler(
  async (req, res) => {
    const startedAt = Date.now();
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.alloc(0);
    const signature = req.get('x-signature');

    if (!signature || !verify(rawBody, signature)) {
      await writeIntegrationLog({
        direction: 'inbound',
        invoiceId: null,
        externalId: null,
        eventId: null,
        attempt: null,
        request: { rawBody: rawBody.toString('utf8') },
        response: { error: 'Invalid signature' },
        httpStatus: 401,
        outcome: 'bad_signature',
        durationMs: Date.now() - startedAt,
        at: new Date(),
      });

      throw new ApiError(401, 'BAD_SIGNATURE', 'Invalid signature');
    }

    let parsedBody: unknown;

    try {
      parsedBody = JSON.parse(rawBody.toString('utf8'));
    } catch {
      await writeIntegrationLog({
        direction: 'inbound',
        invoiceId: null,
        externalId: null,
        eventId: null,
        attempt: null,
        request: { rawBody: rawBody.toString('utf8') },
        response: { error: 'Invalid JSON body' },
        httpStatus: 400,
        outcome: 'bad_payload',
        durationMs: Date.now() - startedAt,
        at: new Date(),
      });

      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        'Invalid JSON body',
      );
    }

    const parsed = webhookPayloadSchema.safeParse(parsedBody);

    if (!parsed.success) {
      const externalId = extractStringField(
        parsedBody,
        'externalId',
      );
      const eventId = extractStringField(parsedBody, 'eventId');
      const message = parsed.error.issues
        .map((issue) => {
          const path = issue.path.map(String).join('.');
          return path ? `${path}: ${issue.message}` : issue.message;
        })
        .join('; ');

      await writeIntegrationLog({
        direction: 'inbound',
        invoiceId: null,
        externalId,
        eventId,
        attempt: null,
        request: toLogRecord(parsedBody),
        response: { error: message },
        httpStatus: 400,
        outcome: 'bad_payload',
        durationMs: Date.now() - startedAt,
        at: new Date(),
      });

      throw new ApiError(400, 'VALIDATION_ERROR', message);
    }

    const event: BillPortWebhookEvent = {
      ...parsed.data,
      occurredAt: new Date(parsed.data.occurredAt),
    };

    res.status(200).json({ received: true });

    setImmediate(() => {
      void processWebhookEvent(event).catch((error) => {
        console.error('[webhook] Processing failed', error);
      });
    });
  },
);
