// [DATABASE M1.14] [BACKEND M3.5-3.6] Race-condition experiment for the reports.
// For growing numbers of simultaneous registrations on a 3-seat event, compare:
//   naive  - read the confirmed count, think for 20 ms, then insert (no lock)
//   locked - SELECT ... FOR UPDATE on the event row first (SeatSure's approach)
// Runs against DATABASE_URL_TEST (it wipes that database) and writes
// docs/test-results/race-experiment.txt.
// Usage: npm run experiment:race -w @seatsure/db
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../src/env';

loadEnv();
if (!process.env.DATABASE_URL_TEST) throw new Error('DATABASE_URL_TEST is not set');
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST; // never touch development data

const { prisma } = await import('../src/client');
const { withTransaction } = await import('../src/transaction');
const eventRepository = await import('../src/repositories/eventRepository');
const registrationRepository = await import('../src/repositories/registrationRepository');

const CAPACITY = 3;
const LEVELS = [2, 5, 10, 20, 40];

async function reset() {
  await prisma.$executeRawUnsafe('TRUNCATE outbox_events, registrations, events, club_organisers, venues, clubs, users RESTART IDENTITY CASCADE');
  const club = await prisma.club.create({ data: { name: 'Race Club', slug: 'race-club' } });
  const venue = await prisma.venue.create({ data: { name: 'Race Hall', building: 'R', capacity: 100 } });
  const organiser = await prisma.user.create({ data: { name: 'Race Organiser', email: 'race@example.edu', role: 'ORGANISER' } });
  const users = await prisma.user.createManyAndReturn({
    data: Array.from({ length: Math.max(...LEVELS) }, (_, i) => ({ name: `Racer ${i + 1}`, email: `racer${i + 1}@example.edu` })),
  });
  return { club, venue, organiser, users };
}

async function newEvent(base: Awaited<ReturnType<typeof reset>>) {
  const startsAt = new Date(Date.now() + 86_400_000);
  return prisma.event.create({
    data: {
      clubId: base.club.id, venueId: base.venue.id, createdById: base.organiser.id, title: 'Race', description: 'Race experiment event',
      category: 'WORKSHOP', status: 'PUBLISHED', publishedAt: new Date(), startsAt, endsAt: new Date(startsAt.getTime() + 3_600_000), capacity: CAPACITY,
    },
  });
}

async function naive(eventId: number, userId: number) {
  await withTransaction(async (tx) => {
    const confirmed = await tx.registration.count({ where: { eventId, status: 'CONFIRMED' } });
    const event = await tx.event.findUniqueOrThrow({ where: { id: eventId } });
    await tx.$executeRaw`SELECT pg_sleep(0.02)`;
    await tx.registration.create({ data: { eventId, userId, status: confirmed < event.capacity ? 'CONFIRMED' : 'WAITLISTED', answers: {} } });
  });
}

async function locked(eventId: number, userId: number) {
  await withTransaction(async (tx) => {
    const event = await eventRepository.lockForUpdate(tx, eventId);
    const hasSeat = event!.confirmedCount < event!.capacity;
    await tx.$executeRaw`SELECT pg_sleep(0.02)`;
    await registrationRepository.create(tx, { eventId, userId, status: hasSeat ? 'CONFIRMED' : 'WAITLISTED', answers: {} });
    if (hasSeat) await eventRepository.changeConfirmedCount(tx, eventId, 1);
  });
}

const base = await reset();
const rows: { requests: number; naive: number; locked: number; lockedMs: number; naiveMs: number }[] = [];
for (const n of LEVELS) {
  const results: Record<string, number> = {};
  for (const [label, fn] of [['naive', naive], ['locked', locked]] as const) {
    const event = await newEvent(base);
    const t0 = performance.now();
    await Promise.all(base.users.slice(0, n).map((u) => fn(event.id, u.id)));
    results[`${label}Ms`] = Math.round(performance.now() - t0);
    results[label] = await prisma.registration.count({ where: { eventId: event.id, status: 'CONFIRMED' } });
  }
  rows.push({ requests: n, naive: results.naive!, locked: results.locked!, naiveMs: results.naiveMs!, lockedMs: results.lockedMs! });
}
await prisma.$executeRawUnsafe('TRUNCATE outbox_events, registrations, events, club_organisers, venues, clubs, users RESTART IDENTITY CASCADE');
await prisma.$disconnect();

const lines = [
  `Race-condition experiment - ${new Date().toISOString()}`,
  `Event capacity: ${CAPACITY} seats. Each transaction pauses 20 ms between reading and writing. Pool size: ${process.env.DB_POOL_MAX ?? 10}.`,
  '',
  'simultaneous requests | confirmed (no lock) | confirmed (FOR UPDATE) | time no lock (ms) | time FOR UPDATE (ms)',
  ...rows.map((r) => `${String(r.requests).padStart(21)} | ${String(r.naive).padStart(19)} | ${String(r.locked).padStart(22)} | ${String(r.naiveMs).padStart(17)} | ${String(r.lockedMs).padStart(20)}`),
];
console.log(lines.join('\n'));
const out = fileURLToPath(new URL('../../docs/test-results/', import.meta.url));
mkdirSync(out, { recursive: true });
writeFileSync(`${out}race-experiment.txt`, lines.join('\n') + '\n');
writeFileSync(`${out}race-experiment.json`, JSON.stringify({ capacity: CAPACITY, rows }, null, 2));
