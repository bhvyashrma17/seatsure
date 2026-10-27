// [BACKEND M3.2 + M3.6] Registration workflows tested with in-memory repositories ([BACKEND M2.11]).
import { describe, expect, it, vi } from 'vitest';
import { createRegistrationService } from '../../src/services/registrationService.js';
import { addEvent, createFakeStore, organiser, student } from '../helpers/fakes.js';

function setup(eventOverrides) {
  const store = createFakeStore();
  const event = addEvent(store, eventOverrides);
  const afterCommit = vi.fn();
  const service = createRegistrationService({ ...store, afterCommit });
  return { store, event, service, afterCommit };
}

describe('register()', () => {
  it('BE-U09 confirms while seats remain, then waitlists with positions 1, 2', async () => {
    const { event, service, store } = setup({ capacity: 2 });
    const outcomes = [];
    for (const id of [1, 2, 3, 4]) outcomes.push(await service.register(student(id), event.id, {}));
    expect(outcomes.map((o) => [o.outcome, o.position])).toEqual([
      ['CONFIRMED', null],
      ['CONFIRMED', null],
      ['WAITLISTED', 1],
      ['WAITLISTED', 2],
    ]);
    expect(store.state.events.get(event.id).confirmedCount).toBe(2);
  });

  it('BE-U10 writes exactly one outbox message per registration and asks for delivery after commit', async () => {
    const { event, service, store, afterCommit } = setup({ capacity: 1 });
    await service.register(student(1), event.id, {});
    await service.register(student(2), event.id, {});
    expect(store.state.outbox.map((m) => m.type)).toEqual(['registration.confirmed', 'registration.waitlisted']);
    expect(store.state.outbox[1].payload).toMatchObject({ position: 1, eventTitle: 'Test Workshop', clubName: 'Coding Club' });
    expect(afterCommit).toHaveBeenCalledTimes(2);
  });

  it('BE-U11 rejects a second registration by the same student (409)', async () => {
    const { event, service } = setup();
    await service.register(student(1), event.id, {});
    await expect(service.register(student(1), event.id, {})).rejects.toMatchObject({ statusCode: 409, code: 'ALREADY_REGISTERED' });
  });

  it('BE-U12 validates answers against the event\'s own questions (422)', async () => {
    const { event, service } = setup({ questions: [{ id: 'level', label: 'Level', type: 'select', required: true, options: ['Beginner', 'Advanced'] }] });
    await expect(service.register(student(1), event.id, {})).rejects.toMatchObject({ statusCode: 422, code: 'INVALID_ANSWERS' });
    await expect(service.register(student(1), event.id, { level: 'Advanced' })).resolves.toMatchObject({ outcome: 'CONFIRMED' });
  });

  it('BE-U13 retries a transaction that lost a write conflict, then succeeds', async () => {
    const { event, store } = setup();
    let calls = 0;
    const flaky = async (work) => {
      calls++;
      if (calls === 1) throw Object.assign(new Error('deadlock'), { kind: 'WRITE_CONFLICT' });
      return store.runInTransaction(work);
    };
    const service = createRegistrationService({ ...store, runInTransaction: flaky });
    await expect(service.register(student(1), event.id, {})).resolves.toMatchObject({ outcome: 'CONFIRMED' });
    expect(calls).toBe(2);
  });

  it('BE-U14 does not retry business-rule failures', async () => {
    const { event, store } = setup({ status: 'DRAFT' });
    const run = vi.fn(store.runInTransaction);
    const service = createRegistrationService({ ...store, runInTransaction: run });
    await expect(service.register(student(1), event.id, {})).rejects.toMatchObject({ code: 'REGISTRATION_NOT_OPEN' });
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('cancel()', () => {
  it('BE-U15 hands a freed seat to the oldest waitlisted student in the same transaction', async () => {
    const { event, service, store } = setup({ capacity: 1 });
    const first = await service.register(student(1), event.id, {});
    await service.register(student(2), event.id, {});
    await service.register(student(3), event.id, {});

    const result = await service.cancel(student(1), first.registration.id);
    expect(result.promoted).toMatchObject({ userId: 2 });
    expect(store.state.events.get(event.id).confirmedCount).toBe(1); // one out, one in
    expect(store.state.outbox.slice(-2).map((m) => m.type)).toEqual(['registration.cancelled', 'registration.promoted']);
  });

  it('BE-U16 frees the seat when nobody is waiting', async () => {
    const { event, service, store } = setup({ capacity: 2 });
    const r = await service.register(student(1), event.id, {});
    const result = await service.cancel(student(1), r.registration.id);
    expect(result.promoted).toBeNull();
    expect(store.state.events.get(event.id).confirmedCount).toBe(0);
  });

  it('BE-U17 only the owner or a club organiser may cancel; never twice', async () => {
    const { event, service } = setup();
    const r = await service.register(student(1), event.id, {});
    await expect(service.cancel(student(99), r.registration.id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.cancel(organiser(1), r.registration.id)).resolves.toBeTruthy();
    await expect(service.cancel(student(1), r.registration.id)).rejects.toMatchObject({ code: 'ALREADY_CANCELLED' });
  });

  it('BE-U18 refuses to cancel once the event has started', async () => {
    const { event, service, store } = setup();
    const r = await service.register(student(1), event.id, {});
    store.state.events.get(event.id).startsAt = new Date(Date.now() - 60_000);
    await expect(service.cancel(student(1), r.registration.id)).rejects.toMatchObject({ code: 'EVENT_STARTED' });
  });
});

describe('checkIn()', () => {
  it('BE-U19 is idempotent and organiser-only', async () => {
    const soon = new Date(Date.now() + 30 * 60_000);
    const { event, service } = setup({ startsAt: soon, endsAt: new Date(soon.getTime() + 7_200_000) });
    const r = await service.register(student(1), event.id, {});
    await expect(service.checkIn(student(1), r.registration.id)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.checkIn(organiser(1), r.registration.id)).resolves.toMatchObject({ alreadyCheckedIn: false });
    await expect(service.checkIn(organiser(1), r.registration.id)).resolves.toMatchObject({ alreadyCheckedIn: true });
  });
});
