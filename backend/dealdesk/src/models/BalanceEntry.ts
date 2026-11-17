import mongoose, { Schema, Types } from 'mongoose';
import { integerValidator } from './validators';

export const BALANCE_ENTRY_KINDS = ['receivable', 'payment'] as const;
export type BalanceEntryKind = (typeof BALANCE_ENTRY_KINDS)[number];

export interface BalanceEntryAttrs {
  customerId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  kind: BalanceEntryKind;
  amount: number;
  createdAt: Date;
}

const balanceEntrySchema = new Schema<BalanceEntryAttrs>(
  {
    customerId: {
      type: Schema.Types.ObjectId,
      ref: 'Customer',
      required: true,
    },
    invoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    kind: {
      type: String,
      required: true,
      enum: [...BALANCE_ENTRY_KINDS],
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: integerValidator,
    },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

balanceEntrySchema.index({ invoiceId: 1, kind: 1 }, { unique: true });

export const BalanceEntry = mongoose.model<BalanceEntryAttrs>(
  'BalanceEntry',
  balanceEntrySchema,
);
