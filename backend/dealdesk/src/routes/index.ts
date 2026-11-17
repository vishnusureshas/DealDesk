import { Router } from 'express';
import adminRoutes from './admin.routes';
import approvalRoutes from './approvals.routes';
import authRoutes from './auth.routes';
import catalogRoutes from './catalog.routes';
import dealRoutes from './deals.routes';
import invoiceRoutes from './invoices.routes';
import notificationRoutes from './notifications.routes';
import threadRoutes from './threads.routes';
import userRoutes from './users.routes';

/**
 * Aggregates every DealDesk router behind its canonical path prefix.
 *
 * The webhook router is intentionally NOT included here: it must be mounted
 * before `express.json()` (it needs the raw body for HMAC verification), so
 * it is wired separately in `app.ts`.
 */
export function createRoutes(): Router {
  const router = Router();

  router.use('/auth', authRoutes);
  router.use('/users', userRoutes);
  router.use(catalogRoutes);
  router.use('/deals', dealRoutes);
  router.use('/approvals', approvalRoutes);
  router.use('/invoices', invoiceRoutes);
  router.use('/threads', threadRoutes);
  router.use('/notifications', notificationRoutes);
  router.use(adminRoutes);

  return router;
}

export default createRoutes;
