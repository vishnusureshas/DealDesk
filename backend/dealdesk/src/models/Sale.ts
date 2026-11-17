import mongoose, { Schema, Types } from 'mongoose';
import { integerValidator } from './validators';

export interface SaleAttrs {
  dealId: Types.ObjectId;
  customerId: Types.ObjectId;
  amount: number;
}

const saleSchema = new Schema<SaleAttrs>(
  {
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
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: integerValidator,
    },
  },
  { versionKey: false },
);

export const Sale = mongoose.model<SaleAttrs>('Sale', saleSchema);
