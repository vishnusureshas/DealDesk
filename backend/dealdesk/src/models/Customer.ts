import mongoose, { Schema } from 'mongoose';
import { integerValidator } from './validators';

export interface CustomerAttrs {
  name: string;
  outstandingBalance: number;
}

const customerSchema = new Schema<CustomerAttrs>(
  {
    name: { type: String, required: true, trim: true },
    outstandingBalance: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      validate: integerValidator,
    },
  },
  { versionKey: false },
);

export const Customer = mongoose.model<CustomerAttrs>(
  'Customer',
  customerSchema,
);
