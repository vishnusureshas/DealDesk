import mongoose, { Schema } from 'mongoose';
import { integerValidator } from './validators';

export interface ProductAttrs {
  name: string;
  sku: string;
  price: number;
}

const productSchema = new Schema<ProductAttrs>(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, unique: true, trim: true },
    price: {
      type: Number,
      required: true,
      min: 0,
      validate: integerValidator,
    },
  },
  { versionKey: false },
);

export const Product = mongoose.model<ProductAttrs>('Product', productSchema);
