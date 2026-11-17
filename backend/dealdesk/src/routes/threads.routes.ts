import { Router } from 'express';
import { z } from 'zod';
import {
  listThreadMessages,
  listThreads,
  markThreadRead,
  sendThreadMessage,
} from '../controllers/threads.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/requirePermission';
import { validate } from '../middleware/validate';
import { objectIdSchema } from '../utils/objectId';

const listQuerySchema = z.object({
  limit: z.string().optional(),
  cursor: z.string().optional(),
});

const sendMessageSchema = z
  .object({
    body: z.string().trim().min(1).max(2000),
    clientId: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

const threadParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

const router = Router();

router.get(
  '/',
  authenticate,
  requirePermission('chat.send'),
  validate(listQuerySchema, 'query'),
  listThreads,
);

router.get(
  '/:id/messages',
  authenticate,
  requirePermission('chat.send'),
  validate(listQuerySchema, 'query'),
  listThreadMessages,
);

router.post(
  '/:id/messages',
  authenticate,
  requirePermission('chat.send'),
  validate(threadParamsSchema, 'params'),
  validate(sendMessageSchema, 'body'),
  sendThreadMessage,
);

router.post(
  '/:id/read',
  authenticate,
  requirePermission('chat.send'),
  validate(threadParamsSchema, 'params'),
  markThreadRead,
);

export default router;
