import { Router } from 'express';
import { z, type ZodType } from 'zod';
import { BILLING_INVOICE_STAGES } from '../models/BillingInvoice';
import {
  getInvoiceState,
  pauseDelivery,
  replayDebugWebhook,
  resumeDelivery,
  sendDebugWebhook,
} from '../services/billing.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

const sendSchema = z
  .object({
    externalId: z.string().min(1),
    status: z.enum(BILLING_INVOICE_STAGES),
    sequence: z.number().int().min(1),
    occurredAt: z.iso.datetime().optional(),
    tampered: z.boolean().optional(),
  })
  .strict();

const replaySchema = z
  .object({
    externalId: z.string().min(1),
    eventId: z.string().min(1),
  })
  .strict();

function parseBody<T>(schema: ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);

  if (!result.success) {
    const message = result.error.issues
      .map((issue) => {
        const path = issue.path.map(String).join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join('; ');

    throw new ApiError(400, 'VALIDATION_ERROR', message);
  }

  return result.data;
}

const router = Router();

router.post(
  '/pause',
  asyncHandler(async (_req, res) => {
    res.status(200).json(await pauseDelivery());
  }),
);

router.post(
  '/resume',
  asyncHandler(async (_req, res) => {
    res.status(200).json(await resumeDelivery());
  }),
);

router.post(
  '/send',
  asyncHandler(async (req, res) => {
    const input = parseBody(sendSchema, req.body);
    res.status(200).json(await sendDebugWebhook(input));
  }),
);

router.post(
  '/replay',
  asyncHandler(async (req, res) => {
    const input = parseBody(replaySchema, req.body);
    res.status(200).json(await replayDebugWebhook(input));
  }),
);

router.get(
  '/state/:externalId',
  asyncHandler(async (req, res) => {
    res
      .status(200)
      .json(await getInvoiceState(req.params.externalId));
  }),
);

export default router;
