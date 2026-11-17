import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65535).default(4000),
    MONGO_URI: z
      .string()
      .min(1)
      .default('mongodb://localhost:27017/dealdesk'),
    JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
    JWT_EXPIRES_IN: z.string().min(1).default('8h'),
    BILLPORT_URL: z.url().default('http://localhost:5000'),
    BILLPORT_SHARED_SECRET: z
      .string()
      .min(1, 'BILLPORT_SHARED_SECRET is required'),
    PUSH_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
    PUSH_BASE_DELAY_MS: z.coerce.number().int().positive().default(2000),
    PUSH_MAX_DELAY_MS: z.coerce.number().int().positive().default(60000),
    PUSH_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
    WORKER_POLL_MS: z.coerce.number().int().positive().default(2000),
    RECON_STALE_MINUTES: z.coerce.number().int().positive().default(1),
    RECON_INTERVAL_SECONDS: z.coerce.number().int().positive().default(15),
    CORS_ORIGIN: z.string().min(1).default('*'),
  })
  .refine((data) => data.PUSH_MAX_DELAY_MS >= data.PUSH_BASE_DELAY_MS, {
    message: 'PUSH_MAX_DELAY_MS must be greater than or equal to PUSH_BASE_DELAY_MS',
    path: ['PUSH_MAX_DELAY_MS'],
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.map(String).join('.') || 'env'}: ${issue.message}`)
    .join('\n');

  console.error(`[dealdesk] Invalid environment configuration:\n${details}`);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
export type Env = typeof env;
