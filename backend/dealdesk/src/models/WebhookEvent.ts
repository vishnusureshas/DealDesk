import mongoose, { Schema, Types } from 'mongoose';
import { integerValidator } from './validators';

export const WEBHOOK_EVENT_STATUSES = [
  'QUEUED',
  'SENT',
  'VIEWED',
  'PAID',
  'FAILED',
] as const;
export type WebhookEventStatus = (typeof WEBHOOK_EVENT_STATUSES)[number];

export const WEBHOOK_EVENT_OUTCOMES = [
  'received',
  'applied',
  'stale_ignored',
  'orphaned',
] as const;
export type WebhookEventOutcome = (typeof WEBHOOK_EVENT_OUTCOMES)[number];

export interface WebhookEventAttrs {
  eventId: string;
  externalId: string;
  invoiceId: Types.ObjectId | null;
  status: WebhookEventStatus;
  sequence: number;
  occurredAt: Date;
  receivedAt: Date;
  outcome: WebhookEventOutcome;
}

const webhookEventSchema = new Schema<WebhookEventAttrs>(
  {
    eventId: { type: String, required: true, unique: true },
    externalId: { type: String, required: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', default: null },
    status: {
      type: String,
      required: true,
      enum: [...WEBHOOK_EVENT_STATUSES],
    },
    sequence: {
      type: Number,
      required: true,
      min: 0,
      validate: integerValidator,
    },
    occurredAt: { type: Date, required: true },
    receivedAt: { type: Date, required: true, default: Date.now },
    outcome: {
      type: String,
      required: true,
      enum: [...WEBHOOK_EVENT_OUTCOMES],
      default: 'received',
    },
  },
  { versionKey: false },
);

webhookEventSchema.index({ externalId: 1, outcome: 1 });

export const WebhookEvent = mongoose.model<WebhookEventAttrs>(
  'WebhookEvent',
  webhookEventSchema,
);
