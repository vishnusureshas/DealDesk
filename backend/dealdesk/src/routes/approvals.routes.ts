import { Router } from 'express';
import { z } from 'zod';
import {
  decideApprovalRequest,
  getApprovalRequest,
  listPendingApprovals,
} from '../controllers/approvals.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../middleware/validate';
import { objectIdSchema } from '../utils/objectId';

const listPendingQuerySchema = z.object({
  limit: z.string().optional(),
  cursor: z.string().optional(),
});

const decideSchema = z
  .object({
    action: z.enum(['approve', 'reject']),
    remarks: z.string().trim().optional(),
  })
  .strict();

const approvalParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

const router = Router();

router.get(
  '/pending',
  authenticate,
  requirePermission('discount.approve'),
  validate(listPendingQuerySchema, 'query'),
  listPendingApprovals,
);

router.get(
  '/:id',
  authenticate,
  requirePermission('deal.view'),
  validate(approvalParamsSchema, 'params'),
  getApprovalRequest,
);

router.post(
  '/:id/decide',
  authenticate,
  requirePermission('discount.approve'),
  validate(approvalParamsSchema, 'params'),
  validate(decideSchema, 'body'),
  decideApprovalRequest,
);

export default router;
