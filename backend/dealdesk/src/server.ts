import http from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { createApp } from './app';
import { connectDb } from './config/db';
import { env } from './config/env';
import { logger } from './utils/logger';
import { startPushWorker } from './jobs/pushWorker';
import { startReconciler } from './jobs/reconciler';
import { RealtimeGateway } from './realtime/gateway';
import {
  registerSocketAuth,
  type DealDeskSocketServer,
} from './realtime/socketAuth';

async function start(): Promise<void> {
  await connectDb(env.MONGO_URI);

  const app = createApp();
  const server = http.createServer(app);
  const io: DealDeskSocketServer = new SocketServer(server, {
    cors: { origin: env.CORS_ORIGIN },
  });

  registerSocketAuth(io);
  new RealtimeGateway(io).start();
  startPushWorker();
  startReconciler();

  server.listen(env.PORT, () => {
    logger.info(`listening on http://localhost:${env.PORT}`);
  });
}

start().catch((error: unknown) => {
  console.error('[dealdesk] failed to start:', error);
  process.exit(1);
});
