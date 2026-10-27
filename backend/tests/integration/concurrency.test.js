// [BACKEND M3.4-3.6] The headline guarantee, over real HTTP: simultaneous requests never overbook.
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

describe('concurrent requests', () => {
  it('BE-I21 50 students registering at the same instant for 3 seats: exactly 3 confirmed', async () => {
    const eventId = s.events.open.id; // capacity 3
    const results = await Promise.all(
      s.students.slice(0, 50).map((st) => as(api, st).post(`/api/v1/events/${eventId}/registrations`).send({ answers: { tshirt: 'M' } })),
    );
    expect(results.every((r) => r.status === 201)).toBe(true);
    const confirmed = results.filter((r) => r.body.data.outcome === 'CONFIRMED');
    const positions = results.map((r) => r.body.data.position).filter(Boolean).sort((a, b) => a - b);
    expect(confirmed).toHaveLength(3);
    expect(positions).toEqual(Array.from({ length: 47 }, (_, i) => i + 1)); // 1..47, no gaps, no repeats

    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    expect(event.confirmedCount).toBe(3);
  });

  it('BE-I22 one student double-clicking 10 times gets exactly one registration', async () => {
    const st = s.students[0];
    const results = await Promise.all(Array.from({ length: 10 }, () => as(api, st).post(`/api/v1/events/${s.events.talk.id}/registrations`).send({})));
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409).every((r) => r.body.code === 'ALREADY_REGISTERED')).toBe(true);
    expect(await prisma.registration.count({ where: { eventId: s.events.talk.id, userId: st.id } })).toBe(1);
  });

  it('BE-I23 simultaneous cancellations promote different waitlisted students (no double promotion)', async () => {
    const eventId = s.events.open.id;
    const regs = [];
    for (const st of s.students.slice(0, 8)) regs.push((await as(api, st).post(`/api/v1/events/${eventId}/registrations`).send({ answers: { tshirt: 'S' } })).body.data.registration);
    const cancels = await Promise.all(regs.slice(0, 3).map((r, i) => as(api, s.students[i]).delete(`/api/v1/registrations/${r.id}`)));
    const promotedIds = cancels.map((c) => c.body.data.promoted.registrationId);
    expect(new Set(promotedIds).size).toBe(3);
    expect(promotedIds.sort()).toEqual(regs.slice(3, 6).map((r) => r.id).sort()); // the three oldest waitlisted
    expect((await prisma.event.findUniqueOrThrow({ where: { id: eventId } })).confirmedCount).toBe(3);
  });
});
