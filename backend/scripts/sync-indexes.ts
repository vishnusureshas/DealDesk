import mongoose from 'mongoose';
import * as billportModels from '../billport/src/models';
import * as dealdeskModels from '../dealdesk/src/models';

interface SyncableModel {
  modelName: string;
  syncIndexes: () => Promise<unknown>;
}

function isSyncableModel(value: unknown): value is SyncableModel {
  if (
    (typeof value !== 'object' && typeof value !== 'function') ||
    value === null
  ) {
    return false;
  }

  const candidate = value as {
    modelName?: unknown;
    syncIndexes?: unknown;
  };

  return (
    typeof candidate.modelName === 'string' &&
    typeof candidate.syncIndexes === 'function'
  );
}

async function syncDatabase(
  uri: string,
  label: string,
  models: SyncableModel[],
): Promise<void> {
  await mongoose.connect(uri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 10000,
  });

  try {
    for (const model of models) {
      await model.syncIndexes();
      console.log(`[sync-indexes] ${label}.${model.modelName}: ok`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

async function main(): Promise<void> {
  const dealdeskUri = process.env.DEALDESK_MONGO_URI;
  const billportUri = process.env.BILLPORT_MONGO_URI;

  if (!dealdeskUri || !billportUri) {
    throw new Error(
      'Set DEALDESK_MONGO_URI and BILLPORT_MONGO_URI before running sync:indexes',
    );
  }

  const dealdesk = Object.values(dealdeskModels).filter(isSyncableModel);
  const billport = Object.values(billportModels).filter(isSyncableModel);

  await syncDatabase(dealdeskUri, 'dealdesk', dealdesk);
  await syncDatabase(billportUri, 'billport', billport);

  console.log('[sync-indexes] All indexes are in sync.');
}

main().catch((error: unknown) => {
  console.error('[sync-indexes] Failed:', error);
  process.exit(1);
});
