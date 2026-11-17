import type { HydratedDocument, Types } from 'mongoose';
import {
  Notification,
  type NotificationAttrs,
} from '../models/Notification';

export const NOTIFICATION_TYPES = [
  'approval:requested',
  'approval:decided',
  'invoice:status_changed',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export async function createNotification(
  userId: Types.ObjectId | string,
  type: NotificationType,
  payload: Record<string, unknown>,
): Promise<HydratedDocument<NotificationAttrs>> {
  return Notification.create({
    userId,
    type,
    payload,
    readAt: null,
  });
}
