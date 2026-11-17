import { Router } from 'express';
import { z } from 'zod';
import { login, me } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const loginSchema = z
  .object({
    email: z.email(),
    password: z.string().min(1),
  })
  .strict();

const router = Router();

router.post('/login', validate(loginSchema, 'body'), login);
router.get('/me', authenticate, me);

export default router;
