import type { RequestHandler } from 'express';
import {
  login as loginService,
  toAuthUser,
} from '../services/auth.service';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';

export const login: RequestHandler = asyncHandler(async (req, res) => {
  const { email, password } = req.body as {
    email: string;
    password: string;
  };
  const session = await loginService(email, password);

  res.status(200).json(session);
});

export const me: RequestHandler = asyncHandler(async (req, res) => {
  if (!req.user || !req.role) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'Login required');
  }

  res.status(200).json({ user: toAuthUser(req.user, req.role) });
});
