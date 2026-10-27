// Event data access. Services call these functions by name and never see SQL or Prisma
// details, so the storage could be swapped (repository pattern, [BACKEND M2.11]).
// [DATABASE M2.8: Prisma Client CRUD] create / findMany / findUnique / update / delete with typed results.
import { Prisma } from '../../generated/prisma/client';
import type { EventCategory, EventStatus } from '../../generated/prisma/enums';
import { prisma } from '../client';
import type { Tx } from '../transaction';

export type EventSort = 'soonest' | 'latest' | 'popular';

export type EventListQuery = {
  q?: string;
  clubId?: number;
  category?: EventCategory;
  from?: Date;
  to?: Date;
  availability?: 'open' | 'full';
  sort?: EventSort;
  /** id of the last event on the previous page (opaque to the client). */
  cursor?: number;
  limit?: number;
};

// [DATABASE M2.10] [FULLSTACK M3.3: select/include] Only the columns a catalogue card needs, plus the related
// club and venue fetched in the same round trip (no N+1 when rendering a page of cards).
const cardSelect = {
  id: true,
  title: true,
  category: true,
  status: true,
  startsAt: true,
  endsAt: true,
  capacity: true,
  confirmedCount: true,
  club: { select: { id: true, name: true, slug: true } },
  venue: { select: { id: true, name: true, building: true } },
} satisfies Prisma.EventSelect;

// Every ordering ends with the unique id so the order is total; cursor pagination needs that.
const ORDER_BY: Record<EventSort, Prisma.EventOrderByWithRelationInput[]> = {
  soonest: [{ startsAt: 'asc' }, { id: 'asc' }],
  latest: [{ startsAt: 'desc' }, { id: 'desc' }],
  popular: [{ confirmedCount: 'desc' }, { id: 'asc' }],
};

/**
 * [DATABASE M2.11: Filtering, sorting & cursor-based pagination]
 * Fetches `limit + 1` rows: the extra row only tells us whether another page exists.
 */
export async function listPublished(query: EventListQuery, client: Tx = prisma) {
  const limit = query.limit ?? 12;
  const where: Prisma.EventWhereInput = {
    status: 'PUBLISHED',
    startsAt: { gte: query.from ?? new Date(), ...(query.to ? { lte: query.to } : {}) },
    ...(query.clubId ? { clubId: query.clubId } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.q ? { title: { contains: query.q, mode: 'insensitive' as const } } : {}),
    // Column-to-column comparison through a field reference (confirmed_count < capacity).
    ...(query.availability === 'open' ? { confirmedCount: { lt: prisma.event.fields.capacity } } : {}),
    ...(query.availability === 'full' ? { confirmedCount: { gte: prisma.event.fields.capacity } } : {}),
  };

  const rows = await client.event.findMany({
    where,
    select: cardSelect,
    orderBy: ORDER_BY[query.sort ?? 'soonest'],
    take: limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

export async function findDetail(id: number, client: Tx = prisma) {
  return client.event.findUnique({
    where: { id },
    include: {
      club: { select: { id: true, name: true, slug: true } },
      venue: true,
      // Filtered relation count: how many people are currently on the waitlist.
      _count: { select: { registrations: { where: { status: 'WAITLISTED' } } } },
    },
  });
}

export async function findById(id: number, client: Tx = prisma) {
  return client.event.findUnique({ where: { id } });
}

/** Organiser dashboard: a club's events (all statuses) with offset pagination. */
export async function listForClubs(
  clubIds: number[],
  { page, pageSize, status }: { page: number; pageSize: number; status?: EventStatus },
  client: Tx = prisma,
) {
  const where: Prisma.EventWhereInput = { clubId: { in: clubIds }, ...(status ? { status } : {}) };
  const [total, items] = await Promise.all([
    client.event.count({ where }),
    client.event.findMany({
      where,
      select: { ...cardSelect, publishedAt: true, _count: { select: { registrations: { where: { status: 'WAITLISTED' } } } } },
      orderBy: [{ startsAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return { items, total };
}

export type LockedEvent = {
  id: number;
  clubId: number;
  clubName: string;
  title: string;
  status: EventStatus;
  startsAt: Date;
  registrationClosesAt: Date | null;
  capacity: number;
  confirmedCount: number;
  questions: unknown;
};

/**
 * [DATABASE M1.14: Row-level locking] SELECT ... FOR UPDATE inside the caller's transaction.
 * A second transaction that tries to lock the same event waits here until the first one
 * commits, so "check free seats, then take one" can never interleave between two requests.
 * Prisma's query builder has no FOR UPDATE, hence the parameterised $queryRaw ([DATABASE M2.19]).
 */
export async function lockForUpdate(tx: Tx, id: number): Promise<LockedEvent | null> {
  const rows = await tx.$queryRaw<LockedEvent[]>`
    SELECT e.id,
           e.club_id                AS "clubId",
           c.name                   AS "clubName",
           e.title,
           e.status::text           AS status,
           e.starts_at              AS "startsAt",
           e.registration_closes_at AS "registrationClosesAt",
           e.capacity,
           e.confirmed_count        AS "confirmedCount",
           e.questions
    FROM events e
    JOIN clubs c ON c.id = e.club_id
    WHERE e.id = ${id}
    FOR UPDATE OF e`;
  return rows[0] ?? null;
}

export async function changeConfirmedCount(tx: Tx, id: number, delta: number) {
  return tx.event.update({ where: { id }, data: { confirmedCount: { increment: delta } }, select: { id: true, confirmedCount: true, capacity: true } });
}

export type EventWrite = {
  clubId: number;
  venueId: number;
  createdById: number;
  title: string;
  description: string;
  category: EventCategory;
  startsAt: Date;
  endsAt: Date;
  registrationClosesAt?: Date | null;
  capacity: number;
  questions: Prisma.InputJsonValue;
};

export async function create(data: EventWrite, client: Tx = prisma) {
  return client.event.create({ data });
}

export async function update(id: number, data: Partial<Omit<EventWrite, 'clubId' | 'createdById'>> & { status?: EventStatus; publishedAt?: Date | null }, client: Tx = prisma) {
  return client.event.update({ where: { id }, data });
}

export async function remove(id: number, client: Tx = prisma) {
  return client.event.delete({ where: { id } });
}
