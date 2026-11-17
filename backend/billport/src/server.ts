import { createApp } from './app';
import { connectDb } from './config/db';
import { disconnectDb } from './config/db';
import { env } from './config/env';
import {
  startWebhookTicker,
  stopWebhookTicker,
} from './services/webhookEmitter';

async function start(): Promise<void> {
  await connectDb(env.MONGO_URI);
  startWebhookTicker();

  const server = createApp().listen(env.PORT, () => {
    console.log(`[billport] listening on http://localhost:${env.PORT}`);
  });

  let shuttingDown = false;

  const shutdown = (signal: string): void => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`[billport] ${signal} received, shutting down`);
    stopWebhookTicker();
    server.close(() => {
      void disconnectDb().finally(() => {
        process.exit(0);
      });
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error: unknown) => {
  console.error('[billport] failed to start:', error);
  process.exit(1);
});
