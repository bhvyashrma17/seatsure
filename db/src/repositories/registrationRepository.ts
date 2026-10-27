// Registration data access (repository pattern, [BACKEND M2.11]).
import { Prisma } from '../../generated/prisma/client';
import type { RegistrationStatus } from '../../generated/prisma/enums';
import { prisma } from '../client';
import type { Tx } from '../transaction';

export async function create(
  tx: Tx,
  data: { eventId: number; userId: number; status: RegistrationStatus; answers: Prisma.InputJsonValue },
) {
  return tx.registration.create({ data });
}

export async function findById(id: number, client: Tx = prisma) {
  return client.registration.findUnique({ where: { id }, include: { user: { select: { name: true } } } });
}

/** The student's current (non-cancelled) registration for an event, if any. */
export async function findActive(eventId: number, userId: number, client: Tx = prisma) {
  return client.registration.findFirst({ where: { eventId, userId, status: { not: 'CANCELLED' } } });
}

/** Oldest waitlisted registrations first (first come, first served). Uses (event_id, status, created_at). */
export async function nextWaitlisted(tx: Tx, eventId: number, count: number) {
  if (count <= 0) return [];
  const rows = await tx.registration.findMany({
    where: { eventId, status: 'WAITLISTED' },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: count,
    select: { id: true, userId: true, user: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, userId: r.userId, userName: r.user.name }));
}

export async function promote(tx: Tx, ids: number[], at: Date) {
  if (ids.length === 0) return 0;
  const { count } = await tx.registration.updateMany({
    where: { id: { in: ids }, status: 'WAITLISTED' },
    data: { status: 'CONFIRMED', promotedAt: at },
  });
  return count;
}

export async function cancel(tx: Tx, id: number, at: Date) {
  return tx.registration.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: at } });
}

/** Idempotent check-in: only a confirmed, not-yet-checked-in row changes. Returns rows updated. */
export async function markCheckedIn(id: number, at: Date, client: Tx = prisma) {
  const { count } = await client.registration.updateMany({
    where: { id, status: 'CONFIRMED', checkedInAt: null },
    data: { checkedInAt: at },
  });
  return count;
}

/**
 * [DATABASE M2.10: Relation queries without N+1] "My passes": every registration with its event,
 * club and venue. Prisma resolves the nested include with one query per relation level,
 * not one query per row, however many registrations the student has.
 */
export async function listForUser(userId: number, client: Tx = prisma) {
  return client.registration.findMany({
    where: { userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: {
      event: {
        select: {
          id: true,
          title: true,
          category: true,
          status: true,
          startsAt: true,
          endsAt: true,
          capacity: true,
          confirmedCount: true,
          club: { select: { id: true, name: true } },
          venue: { select: { id: true, name: true, building: true } },
        },
      },
    },
  });
}

/**
 * [DATABASE M1.12: Window function] Live waitlist position of each given registration:
 * ROW_NUMBER() numbers the waitlist of every event in arrival order without collapsing rows.
 */
export async function waitlistPositions(registrationIds: number[], client: Tx = prisma): Promise<Map<number, number>> {
  if (registrationIds.length === 0) return new Map();
  const rows = await client.$queryRaw<{ id: number; position: bigint }[]>`
    WITH waitlist AS (
      SELECT r.id,
             ROW_NUMBER() OVER (PARTITION BY r.event_id ORDER BY r.created_at, r.id) AS position
      FROM registrations r
      WHERE r.status = 'WAITLISTED'
        AND r.event_id IN (SELECT event_id FROM registrations WHERE id IN (${Prisma.join(registrationIds)}))
    )
    SELECT id, position FROM waitlist WHERE id IN (${Prisma.join(registrationIds)})`;
  return new Map(rows.map((r) => [r.id, Number(r.position)]));
}

export type AttendeeQuery = {
  page: number;
  pageSize: number;
  status?: RegistrationStatus;
  /** JSONB containment filter on answers, e.g. { tshirt: 'M' }. */
  answers?: Record<string, string | boolean>;
  search?: string;
};

export type AttendeeRow = {
  id: number;
  status: RegistrationStatus;
  answers: Record<string, unknown>;
  createdAt: Date;
  promotedAt: Date | null;
  checkedInAt: Date | null;
  userId: number;
  name: string;
  email: string;
  department: string | null;
  waitlistPosition: number | null;
};

/**
 * Organiser attendee list with offset pagination ([DATABASE M2.19: $queryRaw] for what the builder can't express):
 *  - `answers @> $filter::jsonb` is JSONB containment, served by the GIN index ([DATABASE M1.9]);
 *  - COUNT(*) OVER () returns the total row count with the page, so one round trip gives both;
 *  - ROW_NUMBER() OVER (...) adds each waitlisted person's position ([DATABASE M1.12]).
 */
export async function listForEvent(eventId: number, q: AttendeeQuery, client: Tx = prisma) {
  const answersFilter = JSON.stringify(q.answers ?? {});
  const statusFilter = q.status ? Prisma.sql`AND p.status = ${q.status}::"RegistrationStatus"` : Prisma.empty;
  const searchFilter = q.search
    ? Prisma.sql`AND (u.name ILIKE ${'%' + q.search + '%'} OR u.email ILIKE ${'%' + q.search + '%'})`
    : Prisma.empty;
  const offset = (q.page - 1) * q.pageSize;

  const rows = await client.$queryRaw<(Omit<AttendeeRow, 'waitlistPosition'> & { waitlistPosition: bigint | null; total: bigint })[]>`
    WITH positioned AS (
      SELECT r.*,
             CASE WHEN r.status = 'WAITLISTED'
                  THEN ROW_NUMBER() OVER (PARTITION BY r.status ORDER BY r.created_at, r.id)
             END AS waitlist_position
      FROM registrations r
      WHERE r.event_id = ${eventId}
    )
    SELECT p.id,
           p.status::text       AS status,
           p.answers,
           p.created_at         AS "createdAt",
           p.promoted_at        AS "promotedAt",
           p.checked_in_at      AS "checkedInAt",
           u.id                 AS "userId",
           u.name,
           u.email,
           u.department,
           p.waitlist_position  AS "waitlistPosition",
           COUNT(*) OVER ()     AS total
    FROM positioned p
    JOIN users u ON u.id = p.user_id
    WHERE p.answers @> ${answersFilter}::jsonb
      ${statusFilter}
      ${searchFilter}
    ORDER BY CASE p.status WHEN 'CONFIRMED' THEN 0 WHEN 'WAITLISTED' THEN 1 ELSE 2 END,
             p.created_at, p.id
    LIMIT ${q.pageSize} OFFSET ${offset}`;

  const total = rows.length ? Number(rows[0]!.total) : await countForEvent(eventId, q, client);
  const items: AttendeeRow[] = rows.map(({ total: _t, waitlistPosition, ...row }) => ({
    ...row,
    waitlistPosition: waitlistPosition === null ? null : Number(waitlistPosition),
  }));
  return { items, total };
}

// Only needed when the requested page is past the end (no rows came back to carry COUNT(*) OVER()).
async function countForEvent(eventId: number, q: AttendeeQuery, client: Tx) {
  const rows = await client.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*) AS total
    FROM registrations r JOIN users u ON u.id = r.user_id
    WHERE r.event_id = ${eventId}
      AND r.answers @> ${JSON.stringify(q.answers ?? {})}::jsonb
      ${q.status ? Prisma.sql`AND r.status = ${q.status}::"RegistrationStatus"` : Prisma.empty}
      ${q.search ? Prisma.sql`AND (u.name ILIKE ${'%' + q.search + '%'} OR u.email ILIKE ${'%' + q.search + '%'})` : Prisma.empty}`;
  return Number(rows[0]?.total ?? 0);
}

/**
 * Streams every registration of an event in fixed-size batches using cursor pagination, so a
 * CSV export of 10,000 rows never holds them all in memory at once (feeds the Node stream in the API).
 */
export async function* iterateForExport(eventId: number, batchSize = 500, client: Tx = prisma) {
  let cursor: number | undefined;
  for (;;) {
    const batch = await client.registration.findMany({
      where: { eventId },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { user: { select: { name: true, email: true, department: true, yearOfStudy: true } } },
    });
    if (batch.length === 0) return;
    yield batch;
    if (batch.length < batchSize) return;
    cursor = batch[batch.length - 1]!.id;
  }
}

/** Integrity probe used by tests and /health: confirmed_count must equal the real confirmed rows. */
export async function countMismatches(client: Tx = prisma) {
  const rows = await client.$queryRaw<{ id: number; confirmed_count: number; actual: bigint }[]>`
    SELECT e.id, e.confirmed_count, COUNT(r.id) FILTER (WHERE r.status = 'CONFIRMED') AS actual
    FROM events e LEFT JOIN registrations r ON r.event_id = e.id
    GROUP BY e.id
    HAVING e.confirmed_count <> COUNT(r.id) FILTER (WHERE r.status = 'CONFIRMED')`;
  return rows.map((r) => ({ eventId: r.id, stored: r.confirmed_count, actual: Number(r.actual) }));
}
