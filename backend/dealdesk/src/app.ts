import path from 'node:path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import adminRoutes from './routes/admin.routes';
import approvalRoutes from './routes/approvals.routes';
import authRoutes from './routes/auth.routes';
import catalogRoutes from './routes/catalog.routes';
import dealRoutes from './routes/deals.routes';
import invoiceRoutes from './routes/invoices.routes';
import notificationRoutes from './routes/notifications.routes';
import threadRoutes from './routes/threads.routes';
import userRoutes from './routes/users.routes';
import webhookRoutes from './routes/webhooks.routes';

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
    res.status(200).json({ status: 'ok', service: 'dealdesk' });
  });

  app.use('/auth', authRoutes);
  app.use('/users', userRoutes);
  app.use(catalogRoutes);
  app.use('/deals', dealRoutes);
  app.use('/approvals', approvalRoutes);
  app.use('/invoices', invoiceRoutes);
  app.use('/threads', threadRoutes);
  app.use('/notifications', notificationRoutes);
  app.use(adminRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
