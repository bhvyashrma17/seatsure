// End-to-end API behaviour over HTTP: routing, status codes, envelopes, validation, workflows.
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

describe('platform', () => {
  it('BE-I01 health reports both databases and the seat-counter integrity check', async () => {
    const res = await api.get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ postgres: 'up', mongo: 'up', seatCounterMismatches: 0 });
  });

  it('BE-I02 every response carries X-Request-Id; unknown routes get the 404 envelope', async () => {
    const res = await api.get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: 'fail', code: 'ROUTE_NOT_FOUND', requestId: res.headers['x-request-id'] });
  });

  it('BE-I03 the unversioned /api/events still works but is marked deprecated', async () => {
    const res = await api.get('/api/events');
    expect(res.status).toBe(200);
    expect(res.headers.deprecation).toBe('true');
    expect(res.headers.link).toContain('</api/v1/events>; rel="successor-version"');
  });
});

describe('events catalogue', () => {
  it('BE-I04 lists published upcoming events only, with cursor pagination metadata', async () => {
    const page1 = await api.get('/api/v1/events?limit=2');
    expect(page1.status).toBe(200);
    expect(page1.body.data.map((e) => e.title)).toEqual(['Starting Soon', 'Git Bootcamp']);
    expect(page1.body.meta).toMatchObject({ limit: 2, hasMore: true });
    const page2 = await api.get(`/api/v1/events?limit=2&cursor=${page1.body.meta.nextCursor}`);
    expect(page2.body.data.map((e) => e.title)).toEqual(['Jam Night', 'Founder Talk']);
    expect(page2.body.meta.hasMore).toBe(false);
  });

  it('BE-I05 filters by category and validates query parameters', async () => {
    const talks = await api.get('/api/v1/events?category=TALK');
    expect(talks.body.data.map((e) => e.title)).toEqual(['Founder Talk']);
    const bad = await api.get('/api/v1/events?limit=500&category=PARTY');
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e) => e.field).sort()).toEqual(['category', 'limit']);
  });

  it('BE-I06 hides drafts from students but shows them to the club organiser', async () => {
    expect((await as(api, s.students[0]).get(`/api/v1/events/${s.events.draft.id}`)).status).toBe(404);
    const own = await as(api, s.aarav).get(`/api/v1/events/${s.events.draft.id}`);
    expect(own.status).toBe(200);
    expect(own.body.data.canManage).toBe(true);
  });
});

describe('organiser event management', () => {
  const valid = () => ({
    clubId: s.coding.id,
    venueId: s.venue.id,
    title: 'Docker in a Day',
    description: 'Containers, images and compose files from scratch.',
    category: 'WORKSHOP',
    startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
    endsAt: new Date(Date.now() + 5 * 86_400_000 + 3 * 3_600_000).toISOString(),
    capacity: 25,
    questions: [{ id: 'laptop', label: 'Bringing a laptop?', type: 'boolean', required: true }],
  });

  it('BE-I07 students cannot create events (403); organisers get 201 + Location', async () => {
    expect((await as(api, s.students[0]).post('/api/v1/events').send(valid())).status).toBe(403);
    const res = await as(api, s.aarav).post('/api/v1/events').send(valid());
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/events/${res.body.data.id}`);
    expect(res.body.data.status).toBe('DRAFT');
  });

  it('BE-I08 rejects invalid input with a field list and ignores mass-assignment attempts', async () => {
    const bad = await as(api, s.aarav).post('/api/v1/events').send({ ...valid(), title: 'Hi', capacity: 0, endsAt: new Date(Date.now()).toISOString() });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e) => e.field).sort()).toEqual(['capacity', 'endsAt', 'title']);

    const sneaky = await as(api, s.aarav).post('/api/v1/events').send({ ...valid(), status: 'PUBLISHED', confirmedCount: 999, createdById: s.arjun.id });
    expect(sneaky.status).toBe(201);
    expect(sneaky.body.data).toMatchObject({ status: 'DRAFT', confirmedCount: 0, createdById: s.aarav.id });
  });

  it('BE-I09 capacity above the venue is a 422 with a field error', async () => {
    const res = await as(api, s.aarav).post('/api/v1/events').send({ ...valid(), capacity: 100 });
    expect(res.status).toBe(422);
    expect(res.body.errors[0]).toMatchObject({ field: 'capacity' });
  });

  it('BE-I10 publishing follows the workflow; deleting a published event is refused', async () => {
    const publish = await as(api, s.aarav).patch(`/api/v1/events/${s.events.draft.id}`).send({ status: 'PUBLISHED' });
    expect(publish.status).toBe(200);
    expect(publish.body.data.status).toBe('PUBLISHED');
    const back = await as(api, s.aarav).patch(`/api/v1/events/${s.events.draft.id}`).send({ status: 'DRAFT' });
    expect(back.status).toBe(400); // DRAFT is not an allowed target value at all
    const del = await as(api, s.aarav).delete(`/api/v1/events/${s.events.draft.id}`);
    expect(del.body.code).toBe('NOT_A_DRAFT');
  });

  it('BE-I11 an organiser of another club cannot edit the event (403)', async () => {
    const res = await as(api, s.arjun).patch(`/api/v1/events/${s.events.open.id}`).send({ title: 'Hijacked title' });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_CLUB_ORGANISER');
  });
});

describe('registration workflow', () => {
  const register = (user, eventId, answers = { tshirt: 'M' }) => as(api, user).post(`/api/v1/events/${eventId}/registrations`).send({ answers });

  it('BE-I12 requires a known user (401) and a valid X-User-Id (400)', async () => {
    expect((await api.post(`/api/v1/events/${s.events.open.id}/registrations`).send({})).status).toBe(401);
    expect((await api.post(`/api/v1/events/${s.events.open.id}/registrations`).set('X-User-Id', 'abc').send({})).status).toBe(400);
    expect((await api.post(`/api/v1/events/${s.events.open.id}/registrations`).set('X-User-Id', '99999').send({})).body.code).toBe('UNKNOWN_USER');
  });

  it('BE-I13 confirms, then waitlists once full; a client cannot pick its own status', async () => {
    const outcomes = [];
    for (const st of s.students.slice(0, 5)) {
      const res = await as(api, st).post(`/api/v1/events/${s.events.open.id}/registrations`).send({ answers: { tshirt: 'L' }, status: 'CONFIRMED' });
      expect(res.status).toBe(201);
      outcomes.push(`${res.body.data.outcome}${res.body.data.position ? `#${res.body.data.position}` : ''}`);
    }
    expect(outcomes).toEqual(['CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'WAITLISTED#1', 'WAITLISTED#2']);
  });

  it('BE-I14 duplicate registration is a 409; bad answers are a 422 with field paths', async () => {
    await register(s.students[0], s.events.open.id);
    const dup = await register(s.students[0], s.events.open.id);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('ALREADY_REGISTERED');
    const bad = await register(s.students[1], s.events.open.id, { tshirt: 'XXXL', extra: 'x' });
    expect(bad.status).toBe(422);
    expect(bad.body.errors.map((e) => e.field).sort()).toEqual(['answers.extra', 'answers.tshirt']);
  });

  it('BE-I15 cancelling a confirmed seat promotes the first person on the waitlist', async () => {
    const regs = [];
    for (const st of s.students.slice(0, 5)) regs.push((await register(st, s.events.open.id)).body.data.registration);
    const res = await as(api, s.students[0]).delete(`/api/v1/registrations/${regs[0].id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.promoted).toMatchObject({ registrationId: regs[3].id, userId: s.students[3].id });

    const passes = await as(api, s.students[4]).get('/api/v1/me/registrations');
    expect(passes.body.data[0]).toMatchObject({ status: 'WAITLISTED', position: 1 }); // moved up from #2
    const again = await as(api, s.students[0]).delete(`/api/v1/registrations/${regs[0].id}`);
    expect(again.body.code).toBe('ALREADY_CANCELLED');
  });

  it('BE-I16 organiser check-in is idempotent and blocked outside the check-in window', async () => {
    const soonReg = (await as(api, s.students[0]).post(`/api/v1/events/${s.events.soon.id}/registrations`).send({})).body.data.registration;
    const first = await as(api, s.aarav).patch(`/api/v1/registrations/${soonReg.id}`).send({ checkedIn: true });
    expect(first.body.data).toMatchObject({ checkedIn: true, alreadyCheckedIn: false });
    const second = await as(api, s.aarav).patch(`/api/v1/registrations/${soonReg.id}`).send({ checkedIn: true });
    expect(second.body.data.alreadyCheckedIn).toBe(true);

    const laterReg = (await register(s.students[1], s.events.open.id)).body.data.registration;
    const early = await as(api, s.aarav).patch(`/api/v1/registrations/${laterReg.id}`).send({ checkedIn: true });
    expect(early.body.code).toBe('CHECK_IN_NOT_OPEN');
  });

  it('BE-I17 attendee list: offset pagination, JSONB answer filter, organiser-only', async () => {
    const sizes = ['S', 'M', 'M', 'L', 'M'];
    for (let i = 0; i < 5; i++) await register(s.students[i], s.events.open.id, { tshirt: sizes[i] });
    const res = await as(api, s.aarav).get(`/api/v1/events/${s.events.open.id}/registrations?pageSize=2&answers[tshirt]=M`);
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ page: 1, pageSize: 2, total: 3, totalPages: 2 });
    expect(res.body.meta.event.checkInOpen).toBe(false); // event is 3 days away: the UI hides "Check in"
    expect(res.body.data.every((r) => r.answers.tshirt === 'M')).toBe(true);
    expect((await as(api, s.students[0]).get(`/api/v1/events/${s.events.open.id}/registrations`)).status).toBe(403);
  });

  it('BE-I18 streams a CSV export with one line per registration', async () => {
    for (let i = 0; i < 4; i++) await register(s.students[i], s.events.open.id);
    const res = await as(api, s.aarav).get(`/api/v1/events/${s.events.open.id}/registrations/export`).buffer(true).parse((r, cb) => {
      let data = '';
      r.on('data', (c) => (data += c));
      r.on('end', () => cb(null, data));
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.body.trim().split('\n');
    expect(lines[0]).toBe('registration_id,name,email,department,year,status,registered_at,checked_in_at,tshirt');
    expect(lines).toHaveLength(5);
  });

  it('BE-I19 analytics are organiser-only and return window-function results', async () => {
    await register(s.students[0], s.events.open.id);
    expect((await as(api, s.students[0]).get('/api/v1/analytics/overview')).status).toBe(403);
    const res = await as(api, s.aarav).get('/api/v1/analytics/overview');
    expect(res.status).toBe(200);
    expect(res.body.data.fillRates[0]).toMatchObject({ title: 'Git Bootcamp', overallRank: 1 });
    expect(res.body.data.dailySignups).toHaveLength(21);
  });

  it('BE-I20 the seat counter always matches the real confirmed rows after mixed operations', async () => {
    const regs = [];
    for (const st of s.students.slice(0, 6)) regs.push((await register(st, s.events.open.id)).body.data.registration);
    await as(api, s.students[1]).delete(`/api/v1/registrations/${regs[1].id}`);
    await as(api, s.students[4]).delete(`/api/v1/registrations/${regs[4].id}`);
    const event = await prisma.event.findUniqueOrThrow({ where: { id: s.events.open.id } });
    const confirmed = await prisma.registration.count({ where: { eventId: s.events.open.id, status: 'CONFIRMED' } });
    expect(event.confirmedCount).toBe(confirmed);
    expect(confirmed).toBe(3);
  });
});
