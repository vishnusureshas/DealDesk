import { Router } from 'express';
import { z } from 'zod';
import { requestDiscount } from '../controllers/approvals.controller';
import {
  convertDeal,
  createDeal,
  getDeal,
  listDealDiscountRequests,
  listDeals,
  updateDeal,
} from '../controllers/deals.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../middleware/validate';
import { DEAL_STATUSES } from '../models/Deal';
import { objectIdSchema } from '../utils/objectId';

const dealItemSchema = z
  .object({
    productId: objectIdSchema,
    qty: z.number().int().min(1),
  })
  .strict();

const createDealSchema = z
  .object({
    title: z.string().trim().min(1),
    customerId: objectIdSchema,
    items: z.array(dealItemSchema),
  })
  .strict();

const updateDealSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    customerId: objectIdSchema.optional(),
    items: z.array(dealItemSchema).optional(),
  })
  .strict();

const listDealsQuerySchema = z.object({
  limit: z.string().optional(),
  cursor: z.string().optional(),
  status: z.enum(DEAL_STATUSES).optional(),
});

const discountRequestSchema = z
  .object({
    pct: z.number().min(0).max(100),
  })
  .strict();

const dealParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission('deal.view'),
  validate(listDealsQuerySchema, 'query'),
  listDeals,
);

router.post(
  '/',
  authenticate,
  requirePermission('deal.edit'),
  validate(createDealSchema, 'body'),
  createDeal,
);

router.get(
  '/:id',
  authenticate,
  requirePermission('deal.view'),
  validate(dealParamsSchema, 'params'),
  getDeal,
);

router.get(
  '/:id/discount-requests',
  authenticate,
  requirePermission('deal.view'),
  validate(dealParamsSchema, 'params'),
  listDealDiscountRequests,
);

router.patch(
  '/:id',
  authenticate,
  requirePermission('deal.edit'),
  validate(dealParamsSchema, 'params'),
  validate(updateDealSchema, 'body'),
  updateDeal,
);

router.post(
  '/:id/convert',
  authenticate,
  requirePermission('invoice.issue'),
  requirePermission('deal.view'),
  validate(dealParamsSchema, 'params'),
  convertDeal,
);

router.post(
  '/:id/discount-requests',
  authenticate,
  requirePermission('deal.edit'),
  validate(dealParamsSchema, 'params'),
  validate(discountRequestSchema, 'body'),
  requestDiscount,
);

export default router;
