// Query correctness: pagination, filters, window functions, CTEs, N+1, JSONB filtering
// ([DATABASE M1.9], [DATABASE M1.12], [DATABASE M1.13], [DATABASE M2.10], [DATABASE M2.11], [DATABASE M2.19]).
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createPrismaClient, prisma } from '../src/client';
import * as analyticsRepository from '../src/repositories/analyticsRepository';
import * as eventRepository from '../src/repositories/eventRepository';
import * as registrationRepository from '../src/repositories/registrationRepository';
import { createBase, createEvent, inDays, resetDb } from './helpers';

let base: Awaited<ReturnType<typeof createBase>>;

beforeEach(async () => {
  await resetDb();
  base = await createBase({ students: 12 });
});
afterAll(() => prisma.$disconnect());

async function register(eventId: number, userIndex: number, status: 'CONFIRMED' | 'WAITLISTED' | 'CANCELLED', extra: object = {}) {
  return prisma.registration.create({
    data: {
      eventId,
      userId: base.students[userIndex]!.id,
      status,
      answers: {},
      ...(status === 'CANCELLED' ? { cancelledAt: new Date() } : {}),
      ...extra,
    },
  });
}

describe('cursor pagination, filtering and sorting', () => {
  it('DB-Q01 walks every upcoming published event exactly once, in start order', async () => {
    for (let i = 1; i <= 7; i++) await createEvent(base, { title: `E${i}`, startsAt: inDays(i) });
    await createEvent(base, { title: 'Draft', status: 'DRAFT', startsAt: inDays(2) });
    await createEvent(base, { title: 'Past', startsAt: inDays(-3) });

    const seen: string[] = [];
    let cursor: number | undefined;
    let pages = 0;
    do {
      const page = await eventRepository.listPublished({ limit: 3, cursor });
      seen.push(...page.items.map((e) => e.title));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor);

    expect(seen).toEqual(['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7']);
    expect(pages).toBe(3); // 3 + 3 + 1
  });

  it('DB-Q02 filters by category, club, availability and title search', async () => {
    const full = await createEvent(base, { title: 'Hackathon Full', category: 'HACKATHON', capacity: 1 });
    await prisma.event.update({ where: { id: full.id }, data: { confirmedCount: 1 } });
    await createEvent(base, { title: 'Open Talk', category: 'TALK', capacity: 10 });
    await createEvent(base, { title: 'Other club talk', category: 'TALK', clubId: base.club2.id });

    const titles = async (q: Parameters<typeof eventRepository.listPublished>[0]) => (await eventRepository.listPublished(q)).items.map((e) => e.title).sort();
    expect(await titles({ category: 'HACKATHON' })).toEqual(['Hackathon Full']);
    expect(await titles({ availability: 'full' })).toEqual(['Hackathon Full']);
    expect(await titles({ availability: 'open' })).toEqual(['Open Talk', 'Other club talk']);
    expect(await titles({ clubId: base.club2.id })).toEqual(['Other club talk']);
    expect(await titles({ q: 'TALK' })).toEqual(['Open Talk', 'Other club talk']); // case-insensitive
  });

  it('DB-Q03 sorts by popularity with a unique tiebreaker', async () => {
    const a = await createEvent(base, { title: 'A', capacity: 10 });
    const b = await createEvent(base, { title: 'B', capacity: 10 });
    await prisma.event.update({ where: { id: b.id }, data: { confirmedCount: 5 } });
    await prisma.event.update({ where: { id: a.id }, data: { confirmedCount: 2 } });
    const page = await eventRepository.listPublished({ sort: 'popular' });
    expect(page.items.map((e) => e.title)).toEqual(['B', 'A']);
  });
});

describe('window functions and CTEs', () => {
  it('DB-Q04 numbers the waitlist with ROW_NUMBER() and renumbers after someone leaves', async () => {
    const event = await createEvent(base, { capacity: 1 });
    await register(event.id, 0, 'CONFIRMED');
    const w1 = await register(event.id, 1, 'WAITLISTED', { createdAt: new Date(Date.now() - 3000) });
    const w2 = await register(event.id, 2, 'WAITLISTED', { createdAt: new Date(Date.now() - 2000) });
    const w3 = await register(event.id, 3, 'WAITLISTED', { createdAt: new Date(Date.now() - 1000) });

    let positions = await registrationRepository.waitlistPositions([w1.id, w2.id, w3.id]);
    expect([positions.get(w1.id), positions.get(w2.id), positions.get(w3.id)]).toEqual([1, 2, 3]);

    await prisma.registration.update({ where: { id: w1.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    positions = await registrationRepository.waitlistPositions([w2.id, w3.id]);
    expect([positions.get(w2.id), positions.get(w3.id)]).toEqual([1, 2]);
  });

  it('DB-Q05 ranks events by fill rate overall and within each club', async () => {
    const e1 = await createEvent(base, { title: 'Full', capacity: 4 });
    const e2 = await createEvent(base, { title: 'Half', capacity: 4 });
    const e3 = await createEvent(base, { title: 'Other club', capacity: 4, clubId: base.club2.id });
    await prisma.event.update({ where: { id: e1.id }, data: { confirmedCount: 4 } });
    await prisma.event.update({ where: { id: e2.id }, data: { confirmedCount: 2 } });
    await prisma.event.update({ where: { id: e3.id }, data: { confirmedCount: 3 } });

    const rows = await analyticsRepository.fillRateRanking();
    const byTitle = Object.fromEntries(rows.map((r) => [r.title, r]));
    expect(byTitle.Full).toMatchObject({ fillRate: 100, overallRank: 1, rankInClub: 1, vsClubAverage: 25 });
    expect(byTitle['Other club']).toMatchObject({ fillRate: 75, overallRank: 2, rankInClub: 1, vsClubAverage: 0 });
    expect(byTitle.Half).toMatchObject({ fillRate: 50, overallRank: 3, rankInClub: 2, vsClubAverage: -25 });

    const scoped = await analyticsRepository.fillRateRanking({ clubIds: [base.club2.id] });
    expect(scoped.map((r) => r.title)).toEqual(['Other club']);
  });

  it('DB-Q06 builds a gap-free daily series with a running total (generate_series + SUM() OVER)', async () => {
    const event = await createEvent(base, { capacity: 10 });
    const day = 24 * 3_600_000;
    await register(event.id, 0, 'CONFIRMED', { createdAt: new Date(Date.now() - 3 * day) });
    await register(event.id, 1, 'CONFIRMED', { createdAt: new Date(Date.now() - 3 * day) });
    await register(event.id, 2, 'CONFIRMED', { createdAt: new Date(Date.now() - 1 * day) });

    const rows = await analyticsRepository.dailySignups({ days: 7 });
    expect(rows).toHaveLength(7); // one row per day even with zero sign-ups
    expect(rows.map((r) => r.signups).reduce((a, b) => a + b, 0)).toBe(3);
    expect(rows.at(-1)!.cumulative).toBe(3);
    // the running total never decreases
    rows.slice(1).forEach((r, i) => expect(r.cumulative).toBeGreaterThanOrEqual(rows[i]!.cumulative));
  });

  it('DB-Q07 ranks clubs with DENSE_RANK and computes attendance only for past events', async () => {
    const past = await createEvent(base, { title: 'Past', capacity: 4, startsAt: inDays(-2) });
    await register(past.id, 0, 'CONFIRMED', { checkedInAt: new Date() });
    await register(past.id, 1, 'CONFIRMED');
    await prisma.event.update({ where: { id: past.id }, data: { confirmedCount: 2 } });
    const other = await createEvent(base, { title: 'Busy', capacity: 2, clubId: base.club2.id });
    await prisma.event.update({ where: { id: other.id }, data: { confirmedCount: 2 } });

    const rows = await analyticsRepository.clubLeaderboard();
    expect(rows.map((r) => [r.clubName, r.fillRate, r.attendanceRate, r.rank])).toEqual([
      ['Other Club', 100, null, 1],
      ['Test Club', 50, 50, 2],
    ]);
  });
});

describe('relation loading and JSONB filtering', () => {
  it('DB-Q08 loads passes with event, club and venue in a constant number of queries (no N+1)', async () => {
    const counted = createPrismaClient({ logQueries: true });
    let queries = 0;
    counted.$on('query' as never, () => queries++);

    const countFor = async (n: number) => {
      await resetDb();
      base = await createBase({ students: 2 });
      for (let i = 0; i < n; i++) {
        const e = await createEvent(base, { title: `E${i}` });
        await register(e.id, 0, 'CONFIRMED');
      }
      queries = 0;
      const rows = await registrationRepository.listForUser(base.students[0]!.id, counted);
      expect(rows).toHaveLength(n);
      expect(rows[0]!.event.club.name).toBeTruthy();
      return queries;
    };

    const forTwo = await countFor(2);
    const forTen = await countFor(10);
    expect(forTwo).toBeGreaterThan(0); // the counter really saw SQL statements
    expect(forTwo).toBeLessThanOrEqual(4); // registrations + event + club + venue at most
    expect(forTen).toBe(forTwo); // query count does not grow with the number of rows
    await counted.$disconnect();
  });

  it('DB-Q09 filters attendees by JSONB answers and returns the total with COUNT(*) OVER ()', async () => {
    const event = await createEvent(base, { capacity: 10 });
    const sizes = ['M', 'L', 'M', 'S', 'M'];
    for (let i = 0; i < sizes.length; i++) await register(event.id, i, 'CONFIRMED', { answers: { tshirt: sizes[i], laptop: i % 2 === 0 } });

    const medium = await registrationRepository.listForEvent(event.id, { page: 1, pageSize: 2, answers: { tshirt: 'M' } });
    expect(medium.total).toBe(3);
    expect(medium.items).toHaveLength(2); // page size respected
    expect(medium.items.every((r) => r.answers.tshirt === 'M')).toBe(true);

    const page2 = await registrationRepository.listForEvent(event.id, { page: 2, pageSize: 2, answers: { tshirt: 'M' } });
    expect(page2.items).toHaveLength(1);

    const combo = await registrationRepository.listForEvent(event.id, { page: 1, pageSize: 10, answers: { tshirt: 'M', laptop: true } });
    expect(combo.total).toBe(3); // indexes 0, 2, 4 have laptop=true and tshirt=M
  });

  it('DB-Q11 timestamps written through Prisma are stored as the exact instant (UTC session)', async () => {
    const event = await createEvent(base, { startsAt: new Date('2027-01-01T00:00:00.000Z') });
    const [row] = await prisma.$queryRaw<{ utc: string }[]>`
      SELECT to_char(starts_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS utc FROM events WHERE id = ${event.id}`;
    expect(row!.utc).toBe('2027-01-01 00:00'); // not shifted by the machine's IST offset
    // and SQL that compares with now() agrees with JavaScript about past vs future
    const [cmp] = await prisma.$queryRaw<{ future: boolean }[]>`SELECT starts_at > now() AS future FROM events WHERE id = ${event.id}`;
    expect(cmp!.future).toBe(true);
  });

  it('DB-Q10 the integrity probe detects a seat counter that drifted from the real rows', async () => {
    const event = await createEvent(base, { capacity: 5 });
    await register(event.id, 0, 'CONFIRMED');
    expect(await registrationRepository.countMismatches()).toEqual([{ eventId: event.id, stored: 0, actual: 1 }]);
    await prisma.event.update({ where: { id: event.id }, data: { confirmedCount: 1 } });
    expect(await registrationRepository.countMismatches()).toEqual([]);
  });
});
