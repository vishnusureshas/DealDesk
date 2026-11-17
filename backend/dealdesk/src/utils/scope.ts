import type { FilterQuery, HydratedDocument, Types } from 'mongoose';
import type { PermissionKey } from '../constants/permissions';
import { Deal, type DealAttrs } from '../models/Deal';
import type { RoleAttrs, Scope } from '../models/Role';
import { ApiError } from './ApiError';
import { isObjectIdString } from './objectId';

export interface ScopeUser {
  _id: Types.ObjectId | string;
  branchId: Types.ObjectId | string;
}

export interface RoleWithPermissions {
  permissions: RoleAttrs['permissions'];
}

function scopedFilter<T>(
  user: ScopeUser,
  scope: Scope,
  ownField: 'ownerId' | 'requestedBy',
): FilterQuery<T> {
  switch (scope) {
    case 'own':
      return { [ownField]: user._id } as FilterQuery<T>;
    case 'branch':
      return { branchId: user.branchId } as FilterQuery<T>;
    case 'all':
      return {} as FilterQuery<T>;
  }
}

export function scopeFilter<T>(
  user: ScopeUser,
  scope: Scope,
): FilterQuery<T> {
  return scopedFilter<T>(user, scope, 'ownerId');
}

export function dealScopeFilter<T>(
  user: ScopeUser,
  scope: Scope,
): FilterQuery<T> {
  return scopedFilter<T>(user, scope, 'ownerId');
}

export function invoiceScopeFilter<T>(
  user: ScopeUser,
  scope: Scope,
): FilterQuery<T> {
  return scopedFilter<T>(user, scope, 'ownerId');
}

export function discountRequestScopeFilter<T>(
  user: ScopeUser,
  scope: Scope,
): FilterQuery<T> {
  return scopedFilter<T>(user, scope, 'requestedBy');
}

export function getScope(
  role: RoleWithPermissions,
  permissionKey: PermissionKey,
): Scope | null {
  return (
    role.permissions.find((permission) => permission.key === permissionKey)
      ?.scope ?? null
  );
}

export async function assertDealVisible(
  dealId: Types.ObjectId | string,
  user: ScopeUser,
  role: RoleWithPermissions,
): Promise<HydratedDocument<DealAttrs>> {
  const dealIdString =
    typeof dealId === 'string' ? dealId : dealId.toString();

  if (!isObjectIdString(dealIdString)) {
    throw new ApiError(404, 'NOT_FOUND', 'Deal not found');
  }

  const scope = getScope(role, 'deal.view');

  if (!scope) {
    throw new ApiError(403, 'FORBIDDEN', 'Missing permission: deal.view');
  }

  const deal = await Deal.findOne({
    _id: dealIdString,
    ...dealScopeFilter<DealAttrs>(user, scope),
  }).exec();

  if (!deal) {
    throw new ApiError(404, 'NOT_FOUND', 'Deal not found');
  }

  return deal;
}
