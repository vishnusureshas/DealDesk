import mongoose, { Schema } from 'mongoose';

export interface BranchAttrs {
  name: string;
}

const branchSchema = new Schema<BranchAttrs>(
  {
    name: { type: String, required: true, unique: true, trim: true },
  },
  { versionKey: false },
);

export const Branch = mongoose.model<BranchAttrs>('Branch', branchSchema);
