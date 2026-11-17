import mongoose, { Schema, Types } from 'mongoose';
import { integerValidator } from './validators';

export const DEAL_STATUSES = ['open', 'pending_approval', 'won'] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export interface DealItem {
  productId: Types.ObjectId;
  qty: number;
  price: number;
}

export interface DealAttrs {
  title: string;
  customerId: Types.ObjectId;
  ownerId: Types.ObjectId;
  branchId: Types.ObjectId;
  items: DealItem[];
  subtotal: number;
  discountPct: number;
  total: number;
  status: DealStatus;
  rejectionReason: string | null;
  convertedAt: Date | null;
}

const dealItemSchema = new Schema<DealItem>(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    qty: {
      type: Number,
      required: true,
      min: 1,
      validate: integerValidator,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
      validate: integerValidator,
    },
  },
  { _id: false, versionKey: false },
);

const dealSchema = new Schema<DealAttrs>(
  {
    title: { type: String, required: true, trim: true },
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    items: { type: [dealItemSchema], required: true, default: [] },
    subtotal: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: integerValidator,
    },
    discountPct: { type: Number, required: true, default: 0, min: 0, max: 100 },
    total: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: integerValidator,
    },
    status: {
      type: String,
      required: true,
      enum: [...DEAL_STATUSES],
      default: 'open',
    },
    rejectionReason: { type: String, default: null },
    convertedAt: { type: Date, default: null },
  },
  { versionKey: false },
);

dealSchema.index({ ownerId: 1 });
dealSchema.index({ branchId: 1 });
dealSchema.index({ status: 1 });

export const Deal = mongoose.model<DealAttrs>('Deal', dealSchema);
