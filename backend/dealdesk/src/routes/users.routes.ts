import { Router } from 'express';
import { z } from 'zod';
import { createUser } from '../controllers/users.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../middleware/validate';
import { objectIdSchema } from '../utils/objectId';

const createUserSchema = z
  .object({
    email: z.email(),
    password: z.string().min(8),
    roleId: objectIdSchema,
    branchId: objectIdSchema,
    managerId: objectIdSchema.nullable().optional(),
  })
  .strict();

const router = Router();

router.post(
  '/',
  authenticate,
  requirePermission('admin.manage'),
  validate(createUserSchema, 'body'),
  createUser,
);

export default router;
