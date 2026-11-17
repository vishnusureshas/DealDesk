import mongoose from 'mongoose';
import { env } from './env';

mongoose.set('strictQuery', true);

mongoose.connection.on('error', (error) => {
  console.error('[dealdesk] MongoDB connection error:', error);
});

mongoose.connection.on('disconnected', () => {
  console.warn('[dealdesk] MongoDB disconnected');
});

export async function connectDb(
  uri: string = env.MONGO_URI,
): Promise<typeof mongoose> {
  const connection = await mongoose.connect(uri, {
    autoIndex: env.NODE_ENV !== 'production',
    serverSelectionTimeoutMS: 5000,
  });

  const { host, name } = connection.connection;
  console.log(`[dealdesk] MongoDB connected: ${host}/${name}`);

  return connection;
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
