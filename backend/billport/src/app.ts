import cors from 'cors';
import express from 'express';
import morgan from 'morgan';
import {
  errorHandler,
  notFoundHandler,
} from './middleware/errorHandler';
import billingRoutes from './routes/billing.routes';
import debugRoutes from './routes/debug.routes';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(cors());
  app.use(morgan('dev'));

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'billport',
      commit:
        process.env.RENDER_GIT_COMMIT ||
        process.env.GIT_SHA ||
        process.env.COMMIT_SHA ||
        null,
    });
  });

  app.use('/billing', billingRoutes);
  app.use(express.json());
  app.use('/debug', debugRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
