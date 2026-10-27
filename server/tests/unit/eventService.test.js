import { describe, expect, it } from 'vitest';
import { createEventService } from '../../src/services/eventService.js';
import { addEvent, createFakeStore, organiser, student } from '../helpers/fakes.js';

function setup() {
  const store = createFakeStore();
  store.state.venues.set(1, { id: 1, name: 'Lab', capacity: 50 });
  const service = createEventService(store);
  const input = {
    clubId: 1,
    venueId: 1,
    title: 'Intro to Git',
    description: 'Learn commits and branches.',
    category: 'WORKSHOP',
    startsAt: new Date(Date.now() + 86_400_000),
    endsAt: new Date(Date.now() + 90_000_000),
    capacity: 30,
    questions: [],
  };
  return { store, service, input };
}

describe('eventService', () => {
  it('BE-U20 only organisers of the club can create its events', async () => {
    const { service, input } = setup();
    await expect(service.create(student(), input)).rejects.toMatchObject({ statusCode: 403, code: 'NOT_CLUB_ORGANISER' });
    await expect(service.create(organiser(2), input)).rejects.toMatchObject({ statusCode: 403 });
    await expect(service.create(organiser(1), input)).resolves.toMatchObject({ status: 'DRAFT', title: 'Intro to Git' });
  });

  it('BE-U21 capacity may not exceed the venue (422 with a field error)', async () => {
    const { service, input } = setup();
    const err = await service.create(organiser(1), { ...input, capacity: 80 }).catch((e) => e);
    expect(err).toMatchObject({ statusCode: 422, code: 'CAPACITY_EXCEEDS_VENUE' });
    expect(err.errors[0].field).toBe('capacity');
  });

  it('BE-U22 raising capacity promotes waitlisted people into the new seats', async () => {
    const { store, service } = setup();
    const event = addEvent(store, { capacity: 1, confirmedCount: 1 });
    for (const userId of [2, 3, 4]) await store.registrations.create(null, { eventId: event.id, userId, status: 'WAITLISTED', answers: {} });
    const result = await service.update(organiser(1), event.id, { capacity: 3 });
    expect(result.promoted).toBe(2);
    expect(store.state.events.get(event.id).confirmedCount).toBe(3);
    expect(store.state.outbox.map((m) => m.type)).toEqual(['event.capacity_changed', 'registration.promoted', 'registration.promoted']);
  });

  it('BE-U23 publishing follows the workflow and stamps publishedAt', async () => {
    const { store, service } = setup();
    const draft = addEvent(store, { status: 'DRAFT' });
    await service.update(organiser(1), draft.id, { status: 'PUBLISHED' });
    expect(store.state.events.get(draft.id)).toMatchObject({ status: 'PUBLISHED' });
    expect(store.state.events.get(draft.id).publishedAt).toBeInstanceOf(Date);
    await expect(service.update(organiser(1), draft.id, { status: 'PUBLISHED' })).resolves.toBeTruthy(); // same state = no-op
    await expect(service.remove(organiser(1), draft.id)).rejects.toMatchObject({ code: 'NOT_A_DRAFT' });
  });
});
