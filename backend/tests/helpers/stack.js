// Boots the real application (real repositories, PostgreSQL test database, in-memory MongoDB)
// without calling listen(): Supertest drives the Express app directly.
import { mongo, prisma } from '@seatsure/db';
import http from 'node:http';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../../src/app.js';
import { config } from '../../src/config/index.js';
import { createContainer } from '../../src/container.js';

export async function startStack() {
  const mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri('seatsure_it');
  await mongo.connectMongo(uri);
  const container = createContainer({ config, mongoUri: uri });
  // One real HTTP server on an ephemeral port, shared by every request in the file.
  const server = http.createServer(createApp(container));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    app: server,
    container,
    async stop() {
      await new Promise((resolve) => server.close(resolve));
      await container.dispatcher.stop();
      await mongo.disconnectMongo().catch(() => {});
      await mongoServer.stop();
      await prisma.$disconnect();
    },
  };
}

export async function resetDb() {
  await prisma.$executeRawUnsafe('TRUNCATE tasks, outbox_events, registrations, events, club_organisers, venues, clubs, users RESTART IDENTITY CASCADE');
  if (mongo.mongoState() === 'up') await Promise.all([mongo.Notification.deleteMany({}), mongo.ActivityLog.deleteMany({})]);
}

const HOUR = 3_600_000;

/** Two clubs, one venue, one organiser per club, 60 students and a handful of events. */
export async function seedScenario() {
  const [coding, music] = await prisma.club.createManyAndReturn({
    data: [
      { name: 'Coding Club', slug: 'coding' },
      { name: 'Music Club', slug: 'music' },
    ],
  });
  const venue = await prisma.venue.create({ data: { name: 'Lab 204', building: 'Tech Park', capacity: 40 } });
  const [aarav, arjun] = await prisma.user.createManyAndReturn({
    data: [
      { name: 'Aarav Mehta', email: 'aarav@clubs.test', role: 'ORGANISER' },
      { name: 'Arjun Reddy', email: 'arjun@clubs.test', role: 'ORGANISER' },
    ],
  });
  await prisma.clubOrganiser.createMany({ data: [{ clubId: coding.id, userId: aarav.id }, { clubId: music.id, userId: arjun.id }] });
  const students = await prisma.user.createManyAndReturn({
    data: Array.from({ length: 60 }, (_, i) => ({ name: `Student ${i + 1}`, email: `student${i + 1}@test.edu` })),
  });

  const mk = (o) =>
    prisma.event.create({
      data: {
        clubId: coding.id,
        venueId: venue.id,
        createdById: aarav.id,
        description: 'Integration test event description.',
        category: 'WORKSHOP',
        status: 'PUBLISHED',
        publishedAt: new Date(),
        startsAt: new Date(Date.now() + 72 * HOUR),
        endsAt: new Date(Date.now() + 75 * HOUR),
        capacity: 3,
        ...o,
      },
    });

  const open = await mk({
    title: 'Git Bootcamp',
    questions: [{ id: 'tshirt', label: 'T-shirt size', type: 'select', required: true, options: ['S', 'M', 'L'] }],
  });
  const talk = await mk({ title: 'Founder Talk', category: 'TALK', capacity: 30, startsAt: new Date(Date.now() + 96 * HOUR), endsAt: new Date(Date.now() + 98 * HOUR) });
  const draft = await mk({ title: 'Secret Draft', status: 'DRAFT', publishedAt: null });
  const soon = await mk({ title: 'Starting Soon', startsAt: new Date(Date.now() + HOUR), endsAt: new Date(Date.now() + 3 * HOUR), capacity: 10 });
  const musicEvent = await mk({ title: 'Jam Night', clubId: music.id, createdById: arjun.id, category: 'CULTURAL' });

  return { coding, music, venue, aarav, arjun, students, events: { open, talk, draft, soon, musicEvent } };
}

/** Supertest helper: request as a given user. */
export const as = (agent, user) => ({
  get: (url) => agent.get(url).set('X-User-Id', String(user.id)),
  post: (url) => agent.post(url).set('X-User-Id', String(user.id)),
  patch: (url) => agent.patch(url).set('X-User-Id', String(user.id)),
  delete: (url) => agent.delete(url).set('X-User-Id', String(user.id)),
});
