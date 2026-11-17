import { Router } from 'express';
import { z } from 'zod';
import {
  listCustomers,
  listProducts,
} from '../controllers/catalog.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../middleware/validate';

const listQuerySchema = z.object({
  limit: z.string().optional(),
  cursor: z.string().optional(),
});

const router = Router();

router.get(
  '/customers',
  authenticate,
  requirePermission('deal.edit'),
  validate(listQuerySchema, 'query'),
  listCustomers,
);

router.get(
  '/products',
  authenticate,
  requirePermission('deal.view'),
  validate(listQuerySchema, 'query'),
  listProducts,
);

export default router;
