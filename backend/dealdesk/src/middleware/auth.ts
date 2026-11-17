import type { RequestHandler } from 'express';
import { loadSessionFromToken } from '../services/auth.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

function getBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const [scheme, token, ...rest] = header.split(' ');

  if (
    scheme?.toLowerCase() !== 'bearer' ||
    !token ||
    rest.length > 0
  ) {
    return null;
  }

  return token;
}

export const authenticate: RequestHandler = asyncHandler(
  async (req, _res, next) => {
    const token = getBearerToken(req.get('authorization'));

    if (!token) {
      throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
    }

    const { user, role } = await loadSessionFromToken(token);

    req.user = user;
    req.role = role;
    next();
  },
);
