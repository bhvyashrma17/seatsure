// [BACKEND M3.11 + M3.12] [DATABASE M3.19] Outbox delivery to MongoDB and graceful degradation when it is down.
import { prisma } from '@seatsure/db';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { as, resetDb, seedScenario, startStack } from '../helpers/stack.js';

let stack;
let s;
let api;

beforeAll(async () => {
  stack = await startStack();
  api = request(stack.app);
});
afterAll(() => stack.stop());
beforeEach(async () => {
  await resetDb();
  s = await seedScenario();
});

const pending = () => prisma.outboxEvent.count({ where: { publishedAt: null } });

describe('outbox to MongoDB', () => {
  it('BE-I24 a registration reaches the student\'s notifications and the event feed via the outbox', async () => {
    await as(api, s.students[0]).post(`/api/v1/events/${s.events.talk.id}/registrations`).send({});
    await stack.container.dispatcher.drain();
    expect(await pending()).toBe(0);

    const notes = await as(api, s.students[0]).get('/api/v1/me/notifications');
    expect(notes.body.meta).toMatchObject({ unread: 1, degraded: false });
    expect(notes.body.data[0]).toMatchObject({ type: 'REGISTRATION_CONFIRMED', data: { eventId: s.events.talk.id } });

    const feed = await api.get(`/api/v1/events/${s.events.talk.id}/activity`);
    expect(feed.body.data[0]).toMatchObject({ action: 'REGISTERED', actor: { name: 'Student 1' } });
  });

  it('BE-I25 MongoDB outage: registrations still work, reads degrade, and nothing is lost on recovery', async () => {
    await stack.container.mongoControl.disconnect();

    const reg = await as(api, s.students[1]).post(`/api/v1/events/${s.events.talk.id}/registrations`).send({});
    expect(reg.status).toBe(201); // core flow unaffected (PostgreSQL only)

    const notes = await as(api, s.students[1]).get('/api/v1/me/notifications');
    expect(notes.status).toBe(200);
    expect(notes.body.meta.degraded).toBe(true);
    const activity = await as(api, s.aarav).get('/api/v1/analytics/activity');
    expect(activity.body.data.degraded).toBe(true);
    const health = await api.get('/api/v1/health');
    expect(health.body.data).toMatchObject({ postgres: 'up', mongo: 'down' });

    await stack.container.dispatcher.drain();
    expect(await pending()).toBeGreaterThan(0); // waiting safely in PostgreSQL

    await stack.container.mongoControl.reconnect();
    await prisma.outboxEvent.updateMany({ data: { availableAt: new Date() } }); // skip the backoff wait
    await stack.container.dispatcher.drain();
    expect(await pending()).toBe(0);
    const after = await as(api, s.students[1]).get('/api/v1/me/notifications');
    expect(after.body.data.map((n) => n.type)).toContain('REGISTRATION_CONFIRMED');
  });

  it('BE-I26 a waitlist promotion notifies the promoted student', async () => {
    const regs = [];
    for (const st of s.students.slice(0, 4)) regs.push((await as(api, st).post(`/api/v1/events/${s.events.open.id}/registrations`).send({ answers: { tshirt: 'M' } })).body.data.registration);
    await as(api, s.students[0]).delete(`/api/v1/registrations/${regs[0].id}`);
    await stack.container.dispatcher.drain();
    const notes = await as(api, s.students[3]).get('/api/v1/me/notifications');
    expect(notes.body.data.map((n) => n.type)).toEqual(['PROMOTED_FROM_WAITLIST', 'REGISTRATION_WAITLISTED']);
  });
});
