import { Router } from 'express';
import { z } from 'zod';
import {
  cancelInvoice,
  getInvoice,
  getInvoiceLog,
  listInvoices,
  retryInvoice,
} from '../controllers/invoices.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../middleware/validate';
import {
  INVOICE_PUSH_STATES,
  INVOICE_STATUSES,
} from '../models/Invoice';
import { objectIdSchema } from '../utils/objectId';

const listInvoicesQuerySchema = z.object({
  limit: z.string().optional(),
  cursor: z.string().optional(),
  status: z.enum(INVOICE_STATUSES).optional(),
  pushState: z.enum(INVOICE_PUSH_STATES).optional(),
});

const invoiceLogQuerySchema = z.object({
  limit: z.string().optional(),
  cursor: z.string().optional(),
});

const invoiceParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission('deal.view'),
  validate(listInvoicesQuerySchema, 'query'),
  listInvoices,
);

router.get(
  '/:id/log',
  authenticate,
  requirePermission('deal.view'),
  validate(invoiceParamsSchema, 'params'),
  validate(invoiceLogQuerySchema, 'query'),
  getInvoiceLog,
);

router.get(
  '/:id',
  authenticate,
  requirePermission('deal.view'),
  validate(invoiceParamsSchema, 'params'),
  getInvoice,
);

router.post(
  '/:id/retry',
  authenticate,
  requirePermission('invoice.issue'),
  validate(invoiceParamsSchema, 'params'),
  retryInvoice,
);

router.post(
  '/:id/cancel',
  authenticate,
  requirePermission('invoice.cancel'),
  validate(invoiceParamsSchema, 'params'),
  cancelInvoice,
);

export default router;
