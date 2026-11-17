import mongoose, { Schema } from 'mongoose';
import { integerValidator } from './validators';

export const BILLING_INVOICE_STAGES = [
  'QUEUED',
  'SENT',
  'VIEWED',
  'PAID',
  'FAILED',
] as const;
export type BillingInvoiceStage =
  (typeof BILLING_INVOICE_STAGES)[number];

export interface BillingScheduledEvent {
  eventId: string;
  status: BillingInvoiceStage;
  sequence: number;
  occurredAt: Date;
  deliverAt: Date;
  deliveredAt: Date | null;
  duplicateDeliverAt: Date | null;
  retried: boolean;
}

export interface BillingInvoiceAttrs {
  externalId: string;
  idempotencyKey: string;
  reference: string;
  customer: Record<string, unknown>;
  amount: number;
  currency: string;
  lineItems: unknown[];
  issuedAt: Date;
  logicalStage: BillingInvoiceStage;
  scheduledEvents: BillingScheduledEvent[];
  paused: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const billingScheduledEventSchema = new Schema<BillingScheduledEvent>(
  {
    eventId: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: [...BILLING_INVOICE_STAGES],
    },
    sequence: {
      type: Number,
      required: true,
      min: 0,
      validate: integerValidator,
    },
    occurredAt: { type: Date, required: true },
    deliverAt: { type: Date, required: true },
    deliveredAt: { type: Date, default: null },
    duplicateDeliverAt: { type: Date, default: null },
    retried: { type: Boolean, required: true, default: false },
  },
  { _id: false, versionKey: false },
);

const billingInvoiceSchema = new Schema<BillingInvoiceAttrs>(
  {
    externalId: { type: String, required: true, unique: true },
    idempotencyKey: { type: String, required: true, unique: true },
    reference: { type: String, required: true },
    customer: { type: Schema.Types.Mixed, required: true },
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: integerValidator,
    },
    currency: { type: String, required: true },
    lineItems: { type: [Schema.Types.Mixed], required: true, default: [] },
    issuedAt: { type: Date, required: true },
    logicalStage: {
      type: String,
      required: true,
      enum: [...BILLING_INVOICE_STAGES],
      default: 'QUEUED',
    },
    scheduledEvents: {
      type: [billingScheduledEventSchema],
      required: true,
      default: [],
    },
    paused: { type: Boolean, required: true, default: false },
  },
  { timestamps: true, versionKey: false },
);

export const BillingInvoice = mongoose.model<BillingInvoiceAttrs>(
  'BillingInvoice',
  billingInvoiceSchema,
);
