import mongoose, { Schema, Types } from 'mongoose';

export interface ThreadParticipant {
  userId: Types.ObjectId;
  joinedAt: Date;
  lastReadAt: Date;
}

export interface ThreadAttrs {
  dealId: Types.ObjectId;
  participants: ThreadParticipant[];
}

const threadParticipantSchema = new Schema<ThreadParticipant>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, required: true, default: Date.now },
    lastReadAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false, versionKey: false },
);

const threadSchema = new Schema<ThreadAttrs>(
  {
    dealId: {
      type: Schema.Types.ObjectId,
      ref: 'Deal',
      required: true,
      unique: true,
    },
    participants: {
      type: [threadParticipantSchema],
      required: true,
      default: [],
    },
  },
  { versionKey: false },
);

threadSchema.index({ 'participants.userId': 1 });

export const Thread = mongoose.model<ThreadAttrs>('Thread', threadSchema);
