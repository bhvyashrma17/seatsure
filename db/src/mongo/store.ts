// Read/write operations on the MongoDB side (used by the API's event subscribers and routes).
import { ActivityLog, type ActivityLogDoc } from './models/ActivityLog';
import { Notification, type NotificationDoc } from './models/Notification';

const DUPLICATE_KEY = 11000;

function isDuplicateKey(err: unknown) {
  return (err as { code?: number })?.code === DUPLICATE_KEY;
}

/**
 * Idempotent insert: validators and hooks run (Model.create), and a duplicate outboxId means this
 * message was already delivered before a crash/retry, which counts as success.
 */
async function insertOnce<T>(create: () => Promise<T>): Promise<'inserted' | 'duplicate'> {
  try {
    await create();
    return 'inserted';
  } catch (err) {
    if (isDuplicateKey(err)) return 'duplicate';
    throw err;
  }
}

export type NewNotification = Pick<NotificationDoc, 'outboxId' | 'userId' | 'type' | 'title' | 'message'> & {
  data?: Record<string, unknown>;
  expiresAt?: Date;
};

export function recordNotification(doc: NewNotification) {
  return insertOnce(() => Notification.create(doc));
}

export type NewActivity = Pick<ActivityLogDoc, 'outboxId' | 'action' | 'event'> & {
  actor?: { id: number; name: string };
  meta?: Record<string, unknown>;
  at?: Date;
};

export function recordActivity(doc: NewActivity) {
  return insertOnce(() => ActivityLog.create(doc));
}

export async function listNotifications(userId: number, limit = 20) {
  const [items, unread] = await Promise.all([
    Notification.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean(),
    Notification.countDocuments({ userId, readAt: null }),
  ]);
  return { items, unread };
}

export async function markAllNotificationsRead(userId: number) {
  const res = await Notification.updateMany({ userId, readAt: null }, { $set: { readAt: new Date() } });
  return res.modifiedCount;
}

/** One event's feed, newest first; served by the { 'event.id': 1, at: -1 } index. */
export async function eventFeed(eventId: number, limit = 15) {
  return ActivityLog.find({ 'event.id': eventId }).sort({ at: -1 }).limit(limit).lean();
}
