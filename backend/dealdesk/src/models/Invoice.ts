import mongoose, { Schema, Types } from 'mongoose';
import { integerValidator } from './validators';

export const INVOICE_STATUSES = [
  'pending',
  'sent',
  'viewed',
  'paid',
  'failed',
  'cancelled',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_PUSH_STATES = [
  'queued',
  'in_flight',
  'succeeded',
  'failed',
] as const;
export type InvoicePushState = (typeof INVOICE_PUSH_STATES)[number];

export interface InvoiceAttrs {
  saleId: Types.ObjectId;
  dealId: Types.ObjectId;
  customerId: Types.ObjectId;
  ownerId: Types.ObjectId;
  branchId: Types.ObjectId;
  amount: number;
  status: InvoiceStatus;
  externalId: string | null;
  idempotencyKey: string;
  lastSequence: number;
  lastSyncedAt: Date | null;
  pushState: InvoicePushState;
  pushAttempts: number;
  nextAttemptAt: Date | null;
  lockedUntil: Date | null;
  lastError: string | null;
}

const invoiceSchema = new Schema<InvoiceAttrs>(
  {
    saleId: { type: Schema.Types.ObjectId, ref: 'Sale', required: true },
    dealId: {
      type: Schema.Types.ObjectId,
      ref: 'Deal',
      required: true,
      unique: true,
    },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: integerValidator,
    },
    status: {
      type: String,
      required: true,
      enum: [...INVOICE_STATUSES],
      default: 'pending',
    },
    externalId: { type: String, default: null },
    idempotencyKey: { type: String, required: true, unique: true },
    lastSequence: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: integerValidator,
    },
    lastSyncedAt: { type: Date, default: null },
    pushState: {
      type: String,
      required: true,
      enum: [...INVOICE_PUSH_STATES],
      default: 'queued',
    },
    pushAttempts: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: integerValidator,
    },
    nextAttemptAt: { type: Date, default: null },
    lockedUntil: { type: Date, default: null },
    lastError: { type: String, default: null },
  },
  { versionKey: false },
);

invoiceSchema.index(
  { externalId: 1 },
  {
    unique: true,
    partialFilterExpression: { externalId: { $type: 'string' } },
  },
);
invoiceSchema.index({ pushState: 1, nextAttemptAt: 1 });
invoiceSchema.index({ status: 1, lastSyncedAt: 1 });

export const Invoice = mongoose.model<InvoiceAttrs>('Invoice', invoiceSchema);
