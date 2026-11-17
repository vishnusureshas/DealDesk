import mongoose, { Schema, Types } from 'mongoose';

export interface NotificationAttrs {
  userId: Types.ObjectId;
  type: string;
  payload: Record<string, unknown>;
  readAt: Date | null;
  createdAt: Date;
}

const notificationSchema = new Schema<NotificationAttrs>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
      default: () => ({}),
    },
    readAt: { type: Date, default: null },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

notificationSchema.index({ userId: 1, createdAt: 1 });

export const Notification = mongoose.model<NotificationAttrs>(
  'Notification',
  notificationSchema,
);
