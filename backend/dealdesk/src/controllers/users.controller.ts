import type { RequestHandler } from 'express';
import {
  createUser as createUserService,
  type CreateUserInput,
} from '../services/auth.service';
import { asyncHandler } from '../utils/asyncHandler';

export const createUser: RequestHandler = asyncHandler(async (req, res) => {
  const user = await createUserService(req.body as CreateUserInput);

  res.status(201).json(user);
});
