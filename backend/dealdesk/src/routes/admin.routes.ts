import { Router } from 'express';
import { z } from 'zod';
import { PERMISSION_KEYS, SCOPES } from '../constants/permissions';
import {
  createRole,
  getApprovalConfig,
  getPermissions,
  getRoles,
  putApprovalConfig,
  updateRole,
} from '../controllers/admin.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../middleware/validate';
import { objectIdSchema } from '../utils/objectId';

const permissionSchema = z
  .object({
    key: z.enum(PERMISSION_KEYS),
    scope: z.enum(SCOPES),
  })
  .strict();

const createRoleSchema = z
  .object({
    key: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(120).optional(),
    permissions: z.array(permissionSchema),
  })
  .strict();

const updateRoleSchema = z
  .object({
    key: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(120).optional(),
    permissions: z.array(permissionSchema).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

const roleParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

const bandSchema = z
  .object({
    minPct: z.number().min(0).max(100),
    maxPct: z.number().min(0).max(100),
    chain: z.array(z.string().trim().min(1)).default([]),
  })
  .strict()
  .refine((band) => band.minPct < band.maxPct, {
    message: 'minPct must be less than maxPct',
    path: ['maxPct'],
  });

const putApprovalConfigSchema = z
  .object({
    bands: z.array(bandSchema).min(1),
  })
  .strict();

const router = Router();

router.get(
  '/permissions',
  authenticate,
  requirePermission('admin.manage'),
  getPermissions,
);

router.get(
  '/roles',
  authenticate,
  requirePermission('admin.manage'),
  getRoles,
);

router.post(
  '/roles',
  authenticate,
  requirePermission('admin.manage'),
  validate(createRoleSchema, 'body'),
  createRole,
);

router.patch(
  '/roles/:id',
  authenticate,
  requirePermission('admin.manage'),
  validate(roleParamsSchema, 'params'),
  validate(updateRoleSchema, 'body'),
  updateRole,
);

router.get(
  '/approval-config',
  authenticate,
  requirePermission('admin.manage'),
  getApprovalConfig,
);

router.put(
  '/approval-config',
  authenticate,
  requirePermission('admin.manage'),
  validate(putApprovalConfigSchema, 'body'),
  putApprovalConfig,
);

export default router;
