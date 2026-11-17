import mongoose, { Schema, Types } from 'mongoose';

export interface UserAttrs {
  email: string;
  passwordHash: string;
  roleId: Types.ObjectId;
  branchId: Types.ObjectId;
  managerId: Types.ObjectId | null;
}

const userSchema = new Schema<UserAttrs>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true, select: false },
    roleId: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    branchId: { type: Schema.Types.ObjectId, ref: 'Branch', required: true },
    managerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { versionKey: false },
);

export const User = mongoose.model<UserAttrs>('User', userSchema);
