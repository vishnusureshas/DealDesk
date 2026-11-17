import {
  PERMISSION_DEFINITIONS,
  type PermissionKey,
  type Scope,
} from '../constants/permissions';
import { Role, type RolePermission } from '../models/Role';
import { ApiError } from '../utils/ApiError';

export interface RolePermissionInput {
  key: PermissionKey;
  scope: Scope;
}

export interface CreateRoleInput {
  key: string;
  name?: string;
  permissions: RolePermissionInput[];
}

export interface UpdateRoleInput {
  key?: string;
  name?: string;
  permissions?: RolePermissionInput[];
}

export function normalizePermissions(
  input: RolePermissionInput[],
): RolePermission[] {
  const seen = new Set<PermissionKey>();

  return input.map((permission) => {
    if (seen.has(permission.key)) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `Duplicate permission key: ${permission.key}`,
      );
    }

    seen.add(permission.key);

    const definition = PERMISSION_DEFINITIONS[permission.key];
    const allowedScopes: readonly Scope[] = definition.allowedScopes;
    const forcedAll =
      allowedScopes.length === 1 && allowedScopes[0] === 'all';

    if (!forcedAll && !allowedScopes.includes(permission.scope)) {
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `Scope ${permission.scope} is not allowed for ${permission.key}`,
      );
    }

    return {
      key: permission.key,
      scope: forcedAll ? 'all' : permission.scope,
    };
  });
}

export async function listRoles() {
  return Role.find().sort({ key: 1 }).exec();
}

export async function createRole(input: CreateRoleInput) {
  return Role.create({
    key: input.key,
    name: input.name,
    permissions: normalizePermissions(input.permissions),
  });
}

export async function updateRole(
  id: string,
  input: UpdateRoleInput,
) {
  const role = await Role.findById(id).exec();

  if (!role) {
    throw new ApiError(404, 'NOT_FOUND', 'Role not found');
  }

  if (input.key !== undefined) {
    role.key = input.key;
  }

  if (input.name !== undefined) {
    role.name = input.name;
  }

  if (input.permissions !== undefined) {
    role.permissions = normalizePermissions(input.permissions);
  }

  await role.save();
  return role;
}
