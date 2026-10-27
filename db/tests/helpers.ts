// Shared fixtures for the database tests.
import { prisma } from '../src/client';

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE tasks, outbox_events, registrations, events, club_organisers, venues, clubs, users RESTART IDENTITY CASCADE',
  );
}

export const inDays = (days: number, hour = 10) => {
  const d = new Date(Date.now() + days * 24 * 3_600_000);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
};

export async function createBase({ students = 6 } = {}) {
  const club = await prisma.club.create({ data: { name: 'Test Club', slug: 'test-club' } });
  const club2 = await prisma.club.create({ data: { name: 'Other Club', slug: 'other-club' } });
  const venue = await prisma.venue.create({ data: { name: 'Lab 1', building: 'Block T', capacity: 100 } });
  const organiser = await prisma.user.create({ data: { name: 'Olivia Organiser', email: 'olivia@test.edu', role: 'ORGANISER' } });
  await prisma.clubOrganiser.create({ data: { clubId: club.id, userId: organiser.id } });
  const people = await prisma.user.createManyAndReturn({
    data: Array.from({ length: students }, (_, i) => ({ name: `Student ${i + 1}`, email: `s${i + 1}@test.edu` })),
  });
  return { club, club2, venue, organiser, students: people };
}

type EventOverrides = Partial<{
  clubId: number;
  title: string;
  capacity: number;
  status: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  startsAt: Date;
  category: 'WORKSHOP' | 'HACKATHON' | 'TALK' | 'COMPETITION' | 'CULTURAL' | 'SPORTS';
  questions: object[];
}>;

export async function createEvent(base: Awaited<ReturnType<typeof createBase>>, o: EventOverrides = {}) {
  const startsAt = o.startsAt ?? inDays(5);
  const status = o.status ?? 'PUBLISHED';
  return prisma.event.create({
    data: {
      clubId: o.clubId ?? base.club.id,
      venueId: base.venue.id,
      createdById: base.organiser.id,
      title: o.title ?? 'Test Event',
      description: 'An event used by the automated tests.',
      category: o.category ?? 'WORKSHOP',
      status,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 2 * 3_600_000),
      capacity: o.capacity ?? 3,
      questions: o.questions ?? [],
      publishedAt: status === 'DRAFT' ? null : new Date(),
    },
  });
}
