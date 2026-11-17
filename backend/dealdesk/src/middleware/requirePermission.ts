import type { RequestHandler } from 'express';
import type { PermissionKey } from '../constants/permissions';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export function requirePermission(key: PermissionKey): RequestHandler {
  return asyncHandler(async (req, _res, next) => {
    if (!req.user || !req.role) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
    }

    const permission = req.role.permissions.find(
      (candidate) => candidate.key === key,
    );

    if (!permission) {
      throw new ApiError(
        403,
        'FORBIDDEN',
        `Missing permission: ${key}`,
      );
    }

    req.scope = permission.scope;
    next();
  });
}
