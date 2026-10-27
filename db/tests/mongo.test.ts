// MongoDB layer: Mongoose validators + hooks, $jsonSchema, TTL, idempotency, aggregation, explain()
// ([DATABASE M3.3], [DATABASE M3.4], [DATABASE M3.7], [DATABASE M3.12], [DATABASE M3.16], [DATABASE M3.19], [DATABASE M3.20]).
// Runs against an npm-distributed in-memory MongoDB whose TTL monitor wakes every second.
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { activitySummary, promotionReach } from '../src/mongo/aggregations';
import { connectMongo, disconnectMongo } from '../src/mongo/connection';
import { ActivityLog } from '../src/mongo/models/ActivityLog';
import { Notification } from '../src/mongo/models/Notification';
import { eventFeed, recordActivity, recordNotification } from '../src/mongo/store';

let server: MongoMemoryServer;

beforeAll(async () => {
  server = await MongoMemoryServer.create({ instance: { args: ['--setParameter', 'ttlMonitorSleepSecs=1'] } });
  await connectMongo(server.getUri('seatsure_test'));
});

afterAll(async () => {
  await disconnectMongo();
  await server.stop();
});

beforeEach(async () => {
  await Promise.all([Notification.deleteMany({}), ActivityLog.deleteMany({})]);
});

const note = (over: Record<string, unknown> = {}) => ({
  outboxId: `o-${Math.random()}`,
  userId: 7,
  type: 'REGISTRATION_CONFIRMED' as const,
  title: 'You are in!',
  message: 'Seat confirmed.',
  ...over,
});

const activity = (over: Record<string, unknown> = {}) => ({
  outboxId: `a-${Math.random()}`,
  action: 'REGISTERED' as const,
  actor: { id: 7, name: 'Priya' },
  event: { id: 1, title: 'LLM Workshop', clubId: 2, clubName: 'AI Club' },
  at: new Date(),
  ...over,
});

describe('Mongoose schema: validators and middleware hooks', () => {
  it('DB-M01 rejects documents that break the schema (enum, required, min)', async () => {
    const err = await Notification.create(note({ type: 'SPAM', title: '', userId: 0 })).catch((e) => e);
    expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
    expect(Object.keys(err.errors).sort()).toEqual(['title', 'type', 'userId']);
  });

  it('DB-M02 a pre-validate hook gives every notification an expiry 30 days out', async () => {
    const doc = await Notification.create(note());
    const days = (doc.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
    expect(days).toBeLessThanOrEqual(30);
  });
});

describe('database-level rules', () => {
  it('DB-M03 $jsonSchema rejects a bad document even when Mongoose is bypassed', async () => {
    const raw = mongoose.connection.db!.collection('notifications');
    const err = await raw
      .insertOne({ outboxId: 'x', userId: 1, type: 'NOT_A_TYPE', title: 't', message: 'm', expiresAt: new Date(), createdAt: new Date() })
      .catch((e) => e);
    expect(err.code).toBe(121); // DocumentValidationFailure
  });

  it('DB-M04 the TTL index deletes expired notifications automatically', async () => {
    const indexes = await Notification.collection.indexes();
    expect(indexes.find((i) => i.key.expiresAt === 1)?.expireAfterSeconds).toBe(0);

    await Notification.create(note({ outboxId: 'expired', expiresAt: new Date(Date.now() - 1000) }));
    await Notification.create(note({ outboxId: 'fresh' }));
    for (let i = 0; i < 30 && (await Notification.countDocuments({ outboxId: 'expired' })) > 0; i++) {
      await new Promise((r) => setTimeout(r, 250));
    }
    expect(await Notification.countDocuments({ outboxId: 'expired' })).toBe(0);
    expect(await Notification.countDocuments({ outboxId: 'fresh' })).toBe(1);
  });

  it('DB-M05 delivery is idempotent: the same outbox message never creates two notifications', async () => {
    const doc = note({ outboxId: 'outbox-42' });
    expect(await recordNotification(doc)).toBe('inserted');
    expect(await recordNotification(doc)).toBe('duplicate'); // a retried delivery
    expect(await Notification.countDocuments({ outboxId: 'outbox-42' })).toBe(1);
  });
});

describe('aggregation pipelines', () => {
  beforeEach(async () => {
    const llm = { id: 1, title: 'LLM Workshop', clubId: 2, clubName: 'AI Club' };
    const jam = { id: 2, title: 'Music Jam', clubId: 7, clubName: 'Music Club' };
    await ActivityLog.insertMany([
      activity({ event: llm }),
      activity({ event: llm }),
      activity({ event: llm, action: 'WAITLISTED' }),
      activity({ event: llm, action: 'CANCELLED' }),
      activity({ event: llm, action: 'PROMOTED' }),
      activity({ event: llm, action: 'PROMOTED' }),
      activity({ event: jam }),
      activity({ event: jam, at: new Date(Date.now() - 40 * 86_400_000) }), // outside the window
    ]);
    await Notification.insertMany([
      note({ type: 'PROMOTED_FROM_WAITLIST', data: { eventId: 1 }, readAt: new Date(), expiresAt: new Date(Date.now() + 1e9), createdAt: new Date() }),
      note({ type: 'PROMOTED_FROM_WAITLIST', data: { eventId: 1 }, expiresAt: new Date(Date.now() + 1e9), createdAt: new Date() }),
    ]);
  });

  it('DB-M06 $match + $facet returns totals, per-action counts and top events in one query', async () => {
    const summary = await activitySummary({ since: new Date(Date.now() - 14 * 86_400_000) });
    expect(summary.totals).toEqual({ activities: 7, uniqueEvents: 2 });
    expect(summary.byAction).toEqual([
      { action: 'REGISTERED', count: 3 },
      { action: 'PROMOTED', count: 2 },
      { action: 'CANCELLED', count: 1 },
      { action: 'WAITLISTED', count: 1 },
    ]);
    expect(summary.topEvents[0]).toMatchObject({ eventId: 1, activity: 6, cancellations: 1 });
    expect(summary.byDay.reduce((n, d) => n + d.count, 0)).toBe(7);
  });

  it('DB-M07 scoping by club happens in the first $match stage', async () => {
    const summary = await activitySummary({ since: new Date(Date.now() - 14 * 86_400_000), clubIds: [7] });
    expect(summary.totals).toEqual({ activities: 1, uniqueEvents: 1 });
  });

  it('DB-M08 $lookup joins promotions to their notifications and counts unread ones', async () => {
    const rows = await promotionReach();
    expect(rows).toEqual([{ eventId: 1, title: 'LLM Workshop', promotions: 2, notified: 2, unread: 1 }]);
  });
});

describe('index design proven with explain()', () => {
  it('DB-M09 the event feed query uses the compound index instead of scanning the collection', async () => {
    await ActivityLog.insertMany(
      Array.from({ length: 300 }, (_, i) => activity({ event: { id: i % 30, title: `E${i % 30}`, clubId: 1, clubName: 'C' }, at: new Date(Date.now() - i * 1000) })),
    );
    const plan = await ActivityLog.find({ 'event.id': 5 }).sort({ at: -1 }).limit(15).explain('executionStats');
    const stats = (plan as any).executionStats;
    expect(JSON.stringify((plan as any).queryPlanner.winningPlan)).toContain('IXSCAN');
    expect(JSON.stringify((plan as any).queryPlanner.winningPlan)).toContain('event.id_1_at_-1');
    expect(stats.totalDocsExamined).toBe(stats.nReturned); // no wasted document reads
    expect((await eventFeed(5)).length).toBe(10);
  });

  it('DB-M10 an activity keeps an embedded snapshot of the event as it was', async () => {
    await recordActivity(activity({ outboxId: 'snap', event: { id: 9, title: 'Old title', clubId: 1, clubName: 'C' } }));
    const [doc] = await eventFeed(9);
    expect(doc!.event).toEqual({ id: 9, title: 'Old title', clubId: 1, clubName: 'C' }); // no join needed to render
  });
});
