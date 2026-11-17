import mongoose, {
  Schema,
  Types,
  type CallbackWithoutResultAndOptionalError,
} from 'mongoose';
import { integerValidator } from './validators';

export const APPROVAL_ACTIONS = [
  'requested',
  'approve',
  'reject',
  'auto_approved',
  'skipped',
] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

export interface ApprovalHistoryAttrs {
  requestId: Types.ObjectId;
  dealId: Types.ObjectId;
  step: number;
  approverRole: string | null;
  approverId: Types.ObjectId | null;
  action: ApprovalAction;
  remarks: string | null;
  timestamp: Date;
}

const APPEND_ONLY_ERROR = 'ApprovalHistory is append-only';

const approvalHistorySchema = new Schema<ApprovalHistoryAttrs>(
  {
    requestId: {
      type: Schema.Types.ObjectId,
      ref: 'DiscountRequest',
      required: true,
    },
    dealId: { type: Schema.Types.ObjectId, ref: 'Deal', required: true },
    step: {
      type: Number,
      required: true,
      min: 0,
      validate: integerValidator,
    },
    approverRole: { type: String, default: null },
    approverId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    action: {
      type: String,
      required: true,
      enum: [...APPROVAL_ACTIONS],
    },
    remarks: { type: String, default: null },
    timestamp: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

approvalHistorySchema.index({ requestId: 1, timestamp: 1 });

const blockMutation = (next: CallbackWithoutResultAndOptionalError): void => {
  next(new Error(APPEND_ONLY_ERROR));
};

approvalHistorySchema.pre('updateOne', blockMutation);
approvalHistorySchema.pre('updateMany', blockMutation);
approvalHistorySchema.pre('findOneAndUpdate', blockMutation);
approvalHistorySchema.pre('findOneAndReplace', blockMutation);
approvalHistorySchema.pre('replaceOne', blockMutation);
approvalHistorySchema.pre('deleteOne', blockMutation);
approvalHistorySchema.pre('deleteMany', blockMutation);
approvalHistorySchema.pre('findOneAndDelete', blockMutation);

approvalHistorySchema.pre('save', function (next) {
  if (!this.isNew) {
    next(new Error(APPEND_ONLY_ERROR));
    return;
  }

  next();
});

export const ApprovalHistory = mongoose.model<ApprovalHistoryAttrs>(
  'ApprovalHistory',
  approvalHistorySchema,
);
