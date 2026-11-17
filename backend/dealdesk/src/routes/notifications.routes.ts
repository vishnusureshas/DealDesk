import { Router } from 'express';
import { z } from 'zod';
import {
  listNotifications,
  markNotificationRead,
} from '../controllers/notifications.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { objectIdSchema } from '../utils/objectId';

const listNotificationsQuerySchema = z.object({
  limit: z.string().optional(),
  cursor: z.string().optional(),
});

const notificationParamsSchema = z
  .object({
    id: objectIdSchema,
  })
  .strict();

const router = Router();

router.get(
  '/',
  authenticate,
  validate(listNotificationsQuerySchema, 'query'),
  listNotifications,
);

router.patch(
  '/:id/read',
  authenticate,
  validate(notificationParamsSchema, 'params'),
  markNotificationRead,
);

export default router;
