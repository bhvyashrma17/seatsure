// Transactions, rollback, row locking and isolation levels
// ([DATABASE M1.11], [DATABASE M1.14], [DATABASE M2.15], [BACKEND M3.5-3.6]).
import pg from 'pg';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/client';
import { toDbError } from '../src/errors';
import * as eventRepository from '../src/repositories/eventRepository';
import * as registrationRepository from '../src/repositories/registrationRepository';
import { withTransaction } from '../src/transaction';
import { createBase, createEvent, resetDb } from './helpers';

let base: Awaited<ReturnType<typeof createBase>>;

beforeEach(async () => {
  await resetDb();
  base = await createBase({ students: 20 });
});
afterAll(() => prisma.$disconnect());

/** The WRONG way: read, think, then write, with no lock. Two requests can both see a free seat. */
async function registerNaive(eventId: number, userId: number) {
  await withTransaction(async (tx) => {
    const confirmed = await tx.registration.count({ where: { eventId, status: 'CONFIRMED' } });
    const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
    await tx.$executeRaw`SELECT pg_sleep(0.02)`; // the gap where another request slips in
    await tx.registration.create({ data: { eventId, userId, status: confirmed < event.capacity ? 'CONFIRMED' : 'WAITLISTED', answers: {} } });
  });
}

/** SeatSure's way: lock the event row first, so the read-check-write runs one request at a time. */
async function registerLocked(eventId: number, userId: number) {
  await withTransaction(async (tx) => {
    const event = await eventRepository.lockForUpdate(tx, eventId);
    const hasSeat = event!.confirmedCount < event!.capacity;
    await tx.$executeRaw`SELECT pg_sleep(0.02)`; // same artificial gap, but now nobody can slip in
    await registrationRepository.create(tx, { eventId, userId, status: hasSeat ? 'CONFIRMED' : 'WAITLISTED', answers: {} });
    if (hasSeat) await eventRepository.changeConfirmedCount(tx, eventId, 1);
  });
}

describe('atomicity and rollback', () => {
  it('DB-T01 rolls back every write when a later step fails', async () => {
    const event = await createEvent(base, { capacity: 5 });
    await expect(
      withTransaction(async (tx) => {
        await registrationRepository.create(tx, { eventId: event.id, userId: base.students[0]!.id, status: 'CONFIRMED', answers: {} });
        await eventRepository.changeConfirmedCount(tx, event.id, 1);
        throw new Error('payment provider exploded'); // anything after the writes
      }),
    ).rejects.toThrow('payment provider exploded');

    expect(await prisma.registration.count()).toBe(0);
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).confirmedCount).toBe(0);
  });

  it('DB-T02 rolls back when the database itself refuses a step (CHECK violation mid-transaction)', async () => {
    const event = await createEvent(base, { capacity: 1 });
    const err = await withTransaction(async (tx) => {
      await registrationRepository.create(tx, { eventId: event.id, userId: base.students[0]!.id, status: 'CONFIRMED', answers: {} });
      await eventRepository.changeConfirmedCount(tx, event.id, 2); // 2 > capacity 1
    }).catch((e) => e);
    expect(toDbError(err)?.kind).toBe('CHECK_VIOLATION');
    expect(await prisma.registration.count()).toBe(0);
  });

  it('DB-T03 nested write creates a club and its organiser link together or not at all', async () => {
    await expect(
      prisma.club.create({
        data: {
          name: 'Chess Club',
          slug: 'chess',
          organisers: { create: [{ userId: base.organiser.id }, { userId: 999_999 }] }, // second link is invalid
        },
      }),
    ).rejects.toBeTruthy();
    expect(await prisma.club.count({ where: { slug: 'chess' } })).toBe(0);
  });
});

describe('race conditions under concurrency', () => {
  it('DB-T04 reproduces the oversell race when there is no lock', async () => {
    const event = await createEvent(base, { capacity: 3 });
    await Promise.all(base.students.slice(0, 12).map((s) => registerNaive(event.id, s.id)));
    const confirmed = await prisma.registration.count({ where: { eventId: event.id, status: 'CONFIRMED' } });
    expect(confirmed).toBeGreaterThan(3); // overbooked: this is the bug the design prevents
  });

  it('DB-T05 never oversells with SELECT ... FOR UPDATE (same concurrency, same delay)', async () => {
    const event = await createEvent(base, { capacity: 3 });
    await Promise.all(base.students.slice(0, 12).map((s) => registerLocked(event.id, s.id)));
    const confirmed = await prisma.registration.count({ where: { eventId: event.id, status: 'CONFIRMED' } });
    const waitlisted = await prisma.registration.count({ where: { eventId: event.id, status: 'WAITLISTED' } });
    const stored = (await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).confirmedCount;
    expect({ confirmed, waitlisted, stored }).toEqual({ confirmed: 3, waitlisted: 9, stored: 3 });
    expect(await registrationRepository.countMismatches()).toEqual([]);
  });
});

describe('MVCC and isolation levels (two real connections)', () => {
  const url = process.env.DATABASE_URL!;
  let a: pg.Client;
  let b: pg.Client;

  beforeEach(async () => {
    a = new pg.Client({ connectionString: url });
    b = new pg.Client({ connectionString: url });
    await Promise.all([a.connect(), b.connect()]);
  });

  afterAll(async () => {
    await Promise.allSettled([a?.end(), b?.end()]);
  });

  it('DB-T06 READ COMMITTED: a second read inside one transaction sees a value committed meanwhile', async () => {
    const event = await createEvent(base, { capacity: 10 });
    await a.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    const first = (await a.query('SELECT capacity FROM events WHERE id = $1', [event.id])).rows[0].capacity;
    await b.query('UPDATE events SET capacity = 25 WHERE id = $1', [event.id]); // autocommits
    const second = (await a.query('SELECT capacity FROM events WHERE id = $1', [event.id])).rows[0].capacity;
    await a.query('COMMIT');
    expect([first, second]).toEqual([10, 25]); // non-repeatable read
  });

  it('DB-T07 REPEATABLE READ: the snapshot stays stable, and a conflicting write fails with 40001', async () => {
    const event = await createEvent(base, { capacity: 10 });
    await a.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const first = (await a.query('SELECT capacity FROM events WHERE id = $1', [event.id])).rows[0].capacity;
    await b.query('UPDATE events SET capacity = 25 WHERE id = $1', [event.id]);
    const second = (await a.query('SELECT capacity FROM events WHERE id = $1', [event.id])).rows[0].capacity;
    expect([first, second]).toEqual([10, 10]); // MVCC: A keeps reading its snapshot

    const conflict = await a.query('UPDATE events SET capacity = capacity + 1 WHERE id = $1', [event.id]).catch((e) => e);
    await a.query('ROLLBACK');
    expect(conflict.code).toBe('40001'); // could not serialize access due to concurrent update
    expect(toDbError(conflict)?.retryable).toBe(true); // the API retries these with backoff
  });

  it('DB-T08 FOR UPDATE makes a second writer wait until the first commits', async () => {
    const event = await createEvent(base, { capacity: 10 });
    await a.query('BEGIN');
    await a.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [event.id]);

    const started = Date.now();
    const waiting = (async () => {
      await b.query('BEGIN');
      await b.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [event.id]); // blocks here
      const waitedMs = Date.now() - started;
      await b.query('COMMIT');
      return waitedMs;
    })();

    await new Promise((r) => setTimeout(r, 300));
    await a.query('COMMIT');
    expect(await waiting).toBeGreaterThanOrEqual(250);
  });
});
