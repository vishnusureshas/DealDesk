import mongoose, { Schema } from 'mongoose';
import {
  PERMISSION_KEYS,
  SCOPES,
  type PermissionKey,
  type Scope,
} from '../constants/permissions';

export { SCOPES, type Scope };

export interface RolePermission {
  key: PermissionKey;
  scope: Scope;
}

export interface RoleAttrs {
  key: string;
  name?: string;
  permissions: RolePermission[];
}

const rolePermissionSchema = new Schema<RolePermission>(
  {
    key: { type: String, required: true, enum: [...PERMISSION_KEYS] },
    scope: { type: String, required: true, enum: [...SCOPES] },
  },
  { _id: false, versionKey: false },
);

const roleSchema = new Schema<RoleAttrs>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    name: { type: String, trim: true },
    permissions: {
      type: [rolePermissionSchema],
      required: true,
      default: [],
    },
  },
  { versionKey: false },
);

export const Role = mongoose.model<RoleAttrs>('Role', roleSchema);
