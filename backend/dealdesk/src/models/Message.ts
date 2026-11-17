import mongoose, { Schema, Types } from 'mongoose';

export interface MessageAttrs {
  threadId: Types.ObjectId;
  senderId: Types.ObjectId;
  body: string;
  clientId?: string;
  createdAt: Date;
}

const messageSchema = new Schema<MessageAttrs>(
  {
    threadId: { type: Schema.Types.ObjectId, ref: 'Thread', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true },
    clientId: { type: String },
    createdAt: { type: Date, required: true, default: Date.now },
  },
  { versionKey: false },
);

messageSchema.index({ threadId: 1, createdAt: 1 });

export const Message = mongoose.model<MessageAttrs>('Message', messageSchema);
