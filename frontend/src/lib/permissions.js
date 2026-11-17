export const SCOPE_LABEL = {
  own: 'Own records',
  branch: 'Branch',
  all: 'All records',
};

export function permissionFor(user, key) {
  const permissions = user?.role?.permissions ?? [];
  return permissions.find((permission) => permission.key === key) ?? null;
}

export function hasPermission(user, key, scope) {
  const match = permissionFor(user, key);

  if (!match) return false;
  if (!scope) return true;
  return match.scope === scope;
}

export function canAny(user, keys = []) {
  return keys.some((key) => hasPermission(user, key));
}
