// Integrity constraints enforced by PostgreSQL itself ([DATABASE M1.6], [DATABASE M1.9], [DATABASE M1.10]).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/client';
import { DbError, toDbError } from '../src/errors';
import { createBase, createEvent, resetDb } from './helpers';

async function dbErrorOf(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (err) {
    return toDbError(err);
  }
  throw new Error('Expected the database to reject this write');
}

let base: Awaited<ReturnType<typeof createBase>>;

beforeEach(async () => {
  await resetDb();
  base = await createBase();
});
afterAll(() => prisma.$disconnect());

describe('CHECK constraints', () => {
  it('DB-C01 rejects a venue with zero capacity', async () => {
    const err = await dbErrorOf(prisma.venue.create({ data: { name: 'Broom cupboard', building: 'X', capacity: 0 } }));
    expect(err?.kind).toBe('CHECK_VIOLATION');
    expect(err?.constraint).toBe('venues_capacity_positive_chk');
  });

  it('DB-C02 rejects an event that ends before it starts', async () => {
    const event = await createEvent(base);
    const err = await dbErrorOf(prisma.event.update({ where: { id: event.id }, data: { endsAt: new Date(event.startsAt.getTime() - 60_000) } }));
    expect(err?.kind).toBe('CHECK_VIOLATION');
    expect(err?.constraint).toBe('events_time_order_chk');
  });

  it('DB-C03 makes overbooking impossible: confirmed_count can never exceed capacity', async () => {
    const event = await createEvent(base, { capacity: 3 });
    // Even a raw UPDATE that bypasses every service rule is stopped by the database.
    const err = await dbErrorOf(prisma.$executeRaw`UPDATE events SET confirmed_count = capacity + 1 WHERE id = ${event.id}`);
    expect(err?.kind).toBe('CHECK_VIOLATION');
    expect(err?.constraint).toBe('events_confirmed_within_capacity_chk');
  });

  it('DB-C04 requires event questions to be a JSON array', async () => {
    const event = await createEvent(base);
    const err = await dbErrorOf(prisma.event.update({ where: { id: event.id }, data: { questions: { not: 'an array' } } }));
    expect(err?.kind).toBe('CHECK_VIOLATION');
    expect(err?.constraint).toBe('events_questions_is_array_chk');
  });

  it('DB-C05 keeps cancelled_at consistent with the CANCELLED status', async () => {
    const event = await createEvent(base);
    const err = await dbErrorOf(
      prisma.registration.create({ data: { eventId: event.id, userId: base.students[0]!.id, status: 'CANCELLED', answers: {} } }),
    );
    expect(err?.constraint).toBe('registrations_cancelled_at_chk');
  });

  it('DB-C06 only allows checking in confirmed attendees', async () => {
    const event = await createEvent(base);
    const err = await dbErrorOf(
      prisma.registration.create({ data: { eventId: event.id, userId: base.students[0]!.id, status: 'WAITLISTED', checkedInAt: new Date(), answers: {} } }),
    );
    expect(err?.constraint).toBe('registrations_checkin_requires_confirmed_chk');
  });
});

describe('UNIQUE and FOREIGN KEY constraints', () => {
  it('DB-C07 allows only one active registration per student per event (partial unique index)', async () => {
    const event = await createEvent(base);
    const userId = base.students[0]!.id;
    await prisma.registration.create({ data: { eventId: event.id, userId, status: 'CONFIRMED', answers: {} } });
    const err = await dbErrorOf(prisma.registration.create({ data: { eventId: event.id, userId, status: 'WAITLISTED', answers: {} } }));
    expect(err?.kind).toBe('UNIQUE_VIOLATION');
    expect(err?.prismaCode).toBe('P2002');
    expect(err?.constraint).toBe('registrations_one_active_per_user_key');
  });

  it('DB-C08 lets a student register again after cancelling (cancelled rows are outside the partial index)', async () => {
    const event = await createEvent(base);
    const userId = base.students[0]!.id;
    await prisma.registration.create({ data: { eventId: event.id, userId, status: 'CANCELLED', cancelledAt: new Date(), answers: {} } });
    await expect(prisma.registration.create({ data: { eventId: event.id, userId, status: 'CONFIRMED', answers: {} } })).resolves.toBeTruthy();
    expect(await prisma.registration.count({ where: { eventId: event.id, userId } })).toBe(2);
  });

  it('DB-C09 rejects a registration for an event that does not exist (foreign key)', async () => {
    const err = await dbErrorOf(prisma.registration.create({ data: { eventId: 99_999, userId: base.students[0]!.id, status: 'CONFIRMED', answers: {} } }));
    expect(err?.kind).toBe('FOREIGN_KEY_VIOLATION');
    expect(err?.prismaCode).toBe('P2003');
  });

  it('DB-C10 rejects a duplicate email', async () => {
    const err = await dbErrorOf(prisma.user.create({ data: { name: 'Copy', email: base.students[0]!.email } }));
    expect(err?.kind).toBe('UNIQUE_VIOLATION');
    expect(err?.constraint).toBe('users_email_key');
  });

  it('DB-C11 refuses to delete a club that still has events (ON DELETE RESTRICT)', async () => {
    await createEvent(base);
    const err = await dbErrorOf(prisma.club.delete({ where: { id: base.club.id } }));
    expect(err?.kind).toBe('FOREIGN_KEY_VIOLATION');
  });

  it('DB-C12 removes registrations with their event (ON DELETE CASCADE)', async () => {
    const event = await createEvent(base);
    await prisma.registration.create({ data: { eventId: event.id, userId: base.students[0]!.id, status: 'CONFIRMED', answers: {} } });
    await prisma.event.delete({ where: { id: event.id } });
    expect(await prisma.registration.count()).toBe(0);
  });
});

describe('error classification', () => {
  it('DB-C13 classifies a pool acquire timeout as a retryable-in-spirit TIMEOUT (mapped to HTTP 503)', () => {
    const err = toDbError(new Error('timeout exceeded when trying to connect'));
    expect(err).toBeInstanceOf(DbError);
    expect(err?.kind).toBe('TIMEOUT');
    expect(toDbError(new Error('some unrelated bug'))).toBeNull();
  });
});

describe('tasks', () => {
  it('DB-C14 rejects a task whose title is only spaces', async () => {
    const err = await dbErrorOf(prisma.task.create({ data: { userId: base.students[0]!.id, title: '   ' } }));
    expect(err?.kind).toBe('CHECK_VIOLATION');
    expect(err?.constraint).toBe('tasks_title_not_blank_chk');
  });

  it('DB-C15 keeps completed_at in step with completed', async () => {
    const err = await dbErrorOf(prisma.task.create({ data: { userId: base.students[0]!.id, title: 'Done without a date', completed: true } }));
    expect(err?.kind).toBe('CHECK_VIOLATION');
    expect(err?.constraint).toBe('tasks_completed_at_chk');
  });

  it("DB-C16 deleting a user also deletes that user's tasks (ON DELETE CASCADE)", async () => {
    const user = base.students[0]!;
    await prisma.task.createMany({ data: [{ userId: user.id, title: 'One' }, { userId: user.id, title: 'Two' }] });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.task.count({ where: { userId: user.id } })).toBe(0);
  });
});
