import mongoose, { Schema } from 'mongoose';

export interface ApprovalConfigAttrs {
  minPct: number;
  maxPct: number;
  chain: string[];
}

const approvalConfigSchema = new Schema<ApprovalConfigAttrs>(
  {
    minPct: { type: Number, required: true, min: 0, max: 100 },
    maxPct: { type: Number, required: true, min: 0, max: 100 },
    chain: {
      type: [{ type: String, trim: true }],
      required: true,
      default: [],
    },
  },
  { versionKey: false },
);

export const ApprovalConfig = mongoose.model<ApprovalConfigAttrs>(
  'ApprovalConfig',
  approvalConfigSchema,
);
