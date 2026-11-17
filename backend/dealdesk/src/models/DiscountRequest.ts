import mongoose, { Schema, Types } from 'mongoose';
import { integerValidator } from './validators';

export const DISCOUNT_REQUEST_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'auto_approved',
] as const;
export type DiscountRequestStatus =
  (typeof DISCOUNT_REQUEST_STATUSES)[number];

export const CHAIN_OUTCOMES = ['skipped'] as const;
export type ChainOutcome = (typeof CHAIN_OUTCOMES)[number];

export interface DiscountChainStep {
  step: number;
  roleKey: string;
  outcome?: ChainOutcome;
}

export interface DiscountRequestAttrs {
  dealId: Types.ObjectId;
  branchId: Types.ObjectId;
  requestedBy: Types.ObjectId;
  pct: number;
  chain: DiscountChainStep[];
  currentStep: number;
  currentRole: string | null;
  status: DiscountRequestStatus;
  rejectionReason?: string | null;
}

const discountChainStepSchema = new Schema<DiscountChainStep>(
  {
    step: {
      type: Number,
      required: true,
      min: 1,
      validate: integerValidator,
    },
    roleKey: { type: String, required: true, trim: true },
    outcome: { type: String, enum: [...CHAIN_OUTCOMES] },
  },
  { _id: false, versionKey: false },
);

const discountRequestSchema = new Schema<DiscountRequestAttrs>(
  {
    dealId: { type: Schema.Types.ObjectId, ref: 'Deal', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    pct: { type: Number, required: true, min: 0, max: 100 },
    chain: {
      type: [discountChainStepSchema],
      required: true,
      default: [],
    },
    currentStep: {
      type: Number,
      required: true,
      default: 1,
      min: 0,
      validate: integerValidator,
    },
    currentRole: { type: String, default: null },
    status: {
      type: String,
      required: true,
      enum: [...DISCOUNT_REQUEST_STATUSES],
      default: 'pending',
    },
    rejectionReason: { type: String, default: null },
  },
  { versionKey: false },
);

discountRequestSchema.index(
  { dealId: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
);
discountRequestSchema.index({ currentRole: 1, branchId: 1, status: 1 });

export const DiscountRequest = mongoose.model<DiscountRequestAttrs>(
  'DiscountRequest',
  discountRequestSchema,
);
