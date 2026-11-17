import {
  Types,
  type FilterQuery,
  type HydratedDocument,
} from 'mongoose';
import { Role } from '../models/Role';
import { User, type UserAttrs } from '../models/User';

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  return typeof value === 'string' ? new Types.ObjectId(value) : value;
}

export async function findApprovers(
  roleKey: string,
  branchId: Types.ObjectId | string,
  excludeUserId?: Types.ObjectId | string,
): Promise<HydratedDocument<UserAttrs>[]> {
  const role = await Role.findOne({ key: roleKey }).exec();

  if (!role) {
    return [];
  }

  const permission = role.permissions.find(
    (candidate) => candidate.key === 'discount.approve',
  );

  if (!permission || permission.scope === 'own') {
    return [];
  }

  const filter: FilterQuery<UserAttrs> = { roleId: role._id };

  if (permission.scope === 'branch') {
    filter.branchId = toObjectId(branchId);
  }

  if (excludeUserId) {
    filter._id = { $ne: toObjectId(excludeUserId) };
  }

  return User.find(filter).exec();
}
