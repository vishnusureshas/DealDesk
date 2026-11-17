import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65535).default(5000),
    MONGO_URI: z
      .string()
      .min(1)
      .default('mongodb://localhost:27017/billport'),
    DEALDESK_WEBHOOK_URL: z
      .url()
      .default('http://localhost:4000/webhooks/billport'),
    BILLPORT_SHARED_SECRET: z
      .string()
      .min(1, 'BILLPORT_SHARED_SECRET is required'),
    FAIL_RATE: z.coerce.number().min(0).max(1).default(0.15),
    SLOW_RATE: z.coerce.number().min(0).max(1).default(0.1),
    DUP_RATE: z.coerce.number().min(0).max(1).default(0.2),
    BAD_SIG_RATE: z.coerce.number().min(0).max(1).default(0.1),
    EVENT_MIN_DELAY_SECONDS: z.coerce.number().int().nonnegative().default(5),
    EVENT_MAX_DELAY_SECONDS: z.coerce.number().int().nonnegative().default(30),
  })
  .refine(
    (data) => data.EVENT_MAX_DELAY_SECONDS >= data.EVENT_MIN_DELAY_SECONDS,
    {
      message:
        'EVENT_MAX_DELAY_SECONDS must be greater than or equal to EVENT_MIN_DELAY_SECONDS',
      path: ['EVENT_MAX_DELAY_SECONDS'],
    },
  );

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.map(String).join('.') || 'env'}: ${issue.message}`)
    .join('\n');

  console.error(`[billport] Invalid environment configuration:\n${details}`);
  process.exit(1);
}

export const env = Object.freeze(parsed.data);
export type Env = typeof env;
