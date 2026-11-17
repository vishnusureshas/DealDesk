import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import mongoose from 'mongoose';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { User } from './models/User';
import { asyncHandler } from './utils/asyncHandler';
import { createRoutes } from './routes';
import webhookRoutes from './routes/webhooks.routes';

// Mirrors the demo accounts created by backend/seed/seed.ts.
const SEEDED_DEMO_EMAILS = [
  'managerA@dealdesk.test',
  'managerB@dealdesk.test',
  'execA@dealdesk.test',
  'execB@dealdesk.test',
  'finance@dealdesk.test',
  'admin@dealdesk.test',
];

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGIN }));
  app.use(morgan('dev'));
  app.use('/webhooks', webhookRoutes);
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'dealdesk',
      commit:
        process.env.RENDER_GIT_COMMIT ||
        process.env.GIT_SHA ||
        process.env.COMMIT_SHA ||
        null,
    });
  });

  // Read-only diagnostic: the seeded demo accounts must exist in the database
  // this process is connected to, or every login returns 401.
  app.get(
    '/health/seed',
    asyncHandler(async (_req, res) => {
      const demoEmails = SEEDED_DEMO_EMAILS;
      const [demoUsers, totalUsers] = await Promise.all([
        User.countDocuments({ email: { $in: demoEmails } }),
        User.countDocuments({}),
      ]);
      const seeded = demoUsers === demoEmails.length;

      res.status(200).json({
        status: seeded ? 'ok' : 'not-seeded',
        service: 'dealdesk',
        database: mongoose.connection.name,
        seed: {
          expectedDemoUsers: demoEmails.length,
          foundDemoUsers: demoUsers,
          totalUsers,
        },
        ...(seeded
          ? {}
          : {
              hint: 'Run `npm run seed` from backend/ with the MONGO_URI this service uses.',
            }),
      });
    }),
  );

  app.use(createRoutes());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
