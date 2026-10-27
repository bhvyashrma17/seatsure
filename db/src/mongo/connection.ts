// MongoDB connection + collection setup ([DATABASE M3.1] Mongoose; [DATABASE M3.19] validators & TTL).
import mongoose from 'mongoose';
import { activityJsonSchema, notificationJsonSchema } from './jsonSchemas';
import { ActivityLog } from './models/ActivityLog';
import { Notification } from './models/Notification';

// Fail fast instead of silently queueing operations while MongoDB is unreachable, so the API
// can degrade gracefully (PostgreSQL features keep working; the feed reports "unavailable").
mongoose.set('bufferCommands', false);
mongoose.set('strictQuery', true);
// Collections and indexes are created explicitly by ensureCollections() (with their validators),
// not implicitly by Mongoose when a model is first used.
mongoose.set('autoCreate', false);
mongoose.set('autoIndex', false);

export async function connectMongo(uri: string): Promise<void> {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 3_000, // give up quickly when the server is down
    socketTimeoutMS: 10_000,
    maxPoolSize: 10,
  });
  await ensureCollections();
}

export async function disconnectMongo(): Promise<void> {
  await mongoose.disconnect();
}

export type MongoState = 'up' | 'down' | 'connecting';

export function mongoState(): MongoState {
  switch (mongoose.connection.readyState) {
    case mongoose.ConnectionStates.connected:
      return 'up';
    case mongoose.ConnectionStates.connecting:
      return 'connecting';
    default:
      return 'down';
  }
}

/**
 * Creates each collection with its $jsonSchema validator (or updates the validator with collMod
 * when the collection already exists), then builds the indexes declared on the Mongoose schemas
 * (unique idempotency keys, compound feed indexes and TTL indexes).
 */
export async function ensureCollections(): Promise<void> {
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB is not connected');

  const specs = [
    { name: 'notifications', schema: notificationJsonSchema, model: Notification },
    { name: 'activity_logs', schema: activityJsonSchema, model: ActivityLog },
  ] as const;

  const existing = new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
  for (const spec of specs) {
    const validator = { $jsonSchema: spec.schema };
    if (existing.has(spec.name)) {
      await db.command({ collMod: spec.name, validator, validationLevel: 'strict', validationAction: 'error' });
    } else {
      await db.createCollection(spec.name, { validator, validationLevel: 'strict', validationAction: 'error' });
    }
    await spec.model.syncIndexes();
  }
}
