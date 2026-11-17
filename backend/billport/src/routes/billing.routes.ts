import express, { Router } from 'express';
import {
  createInvoice,
  getInvoiceStatus,
} from '../services/billing.service';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();
const rawJson = express.raw({
  type: 'application/json',
  limit: '1mb',
});

router.post(
  '/invoices',
  rawJson,
  asyncHandler(async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.alloc(0);
    const result = await createInvoice({
      rawBody,
      signature: req.get('x-signature'),
      idempotencyKey: req.get('idempotency-key'),
    });

    res.status(201).json(result);
  }),
);

router.get(
  '/invoices/:externalId',
  asyncHandler(async (req, res) => {
    res
      .status(200)
      .json(await getInvoiceStatus(req.params.externalId));
  }),
);

export default router;
