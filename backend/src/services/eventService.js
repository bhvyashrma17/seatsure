// [BACKEND M2.10: Services] Business logic for events. Receives plain values (never req/res),
// talks to storage only through injected repositories ([BACKEND M2.11: repository pattern]), and
// throws AppError for rule violations. Dependencies are injected, so unit tests can pass
// in-memory fakes instead of PostgreSQL.
import { AppError } from '../utils/AppError.js';
import {
  assertCapacityChange,
  assertOrganiserOf,
  assertTransition,
  assertValidQuestions,
  assertWithinVenue,
  toSeatSummary,
} from './rules/eventRules.js';
import { OUTBOX, eventMessage, registrationMessage } from '@seatsure/db';

export function createEventService({ events, registrations, catalog, outbox, runInTransaction, afterCommit = () => {}, clock = () => new Date() }) {
  function toCard(e) {
    return { ...e, ...toSeatSummary(e) };
  }

  async function requireEvent(id) {
    const event = await events.findById(id);
    if (!event) throw new AppError(`Event ${id} not found`, 404, 'EVENT_NOT_FOUND');
    return event;
  }

  async function requireVenue(venueId) {
    const venue = await catalog.findVenue(venueId);
    if (!venue) throw new AppError('Choose an existing venue', 422, 'UNKNOWN_VENUE', [{ field: 'venueId', message: 'Unknown venue' }]);
    return venue;
  }

  return {
    /** Public catalogue with filters + cursor pagination ([BACKEND M3.9]). */
    async list(filters) {
      const { items, nextCursor } = await events.listPublished(filters);
      return { items: items.map(toCard), nextCursor };
    },

    /** One event; when a user is known, also their own registration (with waitlist position). */
    async get(id, user) {
      const event = await events.findDetail(id);
      const canSeeDrafts = user && event && user.clubs?.some((c) => c.id === event.clubId);
      if (!event || (event.status === 'DRAFT' && !canSeeDrafts)) {
        throw new AppError(`Event ${id} not found`, 404, 'EVENT_NOT_FOUND');
      }
      let myRegistration = null;
      if (user) {
        const reg = await registrations.findActive(id, user.id);
        if (reg) {
          const positions = reg.status === 'WAITLISTED' ? await registrations.waitlistPositions([reg.id]) : new Map();
          myRegistration = { id: reg.id, status: reg.status, position: positions.get(reg.id) ?? null, answers: reg.answers, createdAt: reg.createdAt };
        }
      }
      const { _count, ...rest } = event;
      return {
        ...rest,
        ...toSeatSummary(event),
        waitlistCount: _count.registrations,
        canManage: Boolean(canSeeDrafts),
        myRegistration,
      };
    },

    /** Organiser dashboard: every event of the clubs the user organises (offset pagination). */
    async listForOrganiser(user, { page, pageSize, status }) {
      const clubIds = user.clubs.map((c) => c.id);
      if (clubIds.length === 0) return { items: [], total: 0 };
      const { items, total } = await events.listForClubs(clubIds, { page, pageSize, status });
      return {
        items: items.map(({ _count, ...e }) => ({ ...toCard(e), waitlistCount: _count.registrations })),
        total,
      };
    },

    async create(user, input) {
      assertOrganiserOf(user, input.clubId);
      const venue = await requireVenue(input.venueId);
      assertWithinVenue(input.capacity, venue.capacity);
      assertValidQuestions(input.questions);
      return events.create({
        clubId: input.clubId,
        venueId: input.venueId,
        createdById: user.id,
        title: input.title,
        description: input.description,
        category: input.category,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        registrationClosesAt: input.registrationClosesAt ?? null,
        capacity: input.capacity,
        questions: input.questions ?? [],
      });
    },

    /**
     * Edits an event. A capacity change runs in a transaction holding the event row lock:
     * shrinking below the confirmed count is refused, and growing promotes waitlisted people
     * into the new seats in the same atomic step ([BACKEND M3.6], [DATABASE M1.14]).
     */
    async update(user, id, changes) {
      const current = await requireEvent(id);
      assertOrganiserOf(user, current.clubId);
      if (current.status === 'CANCELLED') throw new AppError('A cancelled event cannot be edited', 409, 'EVENT_CANCELLED');
      if (changes.questions) assertValidQuestions(changes.questions);
      if (changes.status) assertTransition(current.status, changes.status);
      if (changes.status === 'PUBLISHED' && new Date(changes.startsAt ?? current.startsAt) <= clock()) {
        throw new AppError('Only future events can be published', 409, 'EVENT_IN_PAST');
      }
      const startsAt = changes.startsAt ?? current.startsAt;
      const endsAt = changes.endsAt ?? current.endsAt;
      if (new Date(endsAt) <= new Date(startsAt)) {
        throw new AppError('The event must end after it starts', 422, 'INVALID_TIME_RANGE', [{ field: 'endsAt', message: 'Must be after the start time' }]);
      }
      if (current.status !== 'DRAFT' && changes.questions) {
        throw new AppError('Questions cannot change after an event is published', 409, 'QUESTIONS_LOCKED');
      }

      const venue = await requireVenue(changes.venueId ?? current.venueId);
      const now = clock();
      const result = await runInTransaction(async (tx) => {
        const locked = await events.lockForUpdate(tx, id);
        let promoted = [];
        const data = { ...changes };
        if (changes.status === 'PUBLISHED') data.publishedAt = now;

        const newCapacity = changes.capacity ?? locked.capacity;
        if (changes.capacity !== undefined || changes.venueId !== undefined) {
          assertCapacityChange(locked, newCapacity, venue.capacity);
        }
        const updated = await events.update(id, data, tx);

        if (changes.capacity !== undefined && changes.capacity > locked.capacity && locked.status === 'PUBLISHED') {
          const freeSeats = newCapacity - locked.confirmedCount;
          promoted = await registrations.nextWaitlisted(tx, id, freeSeats);
          if (promoted.length) {
            await registrations.promote(tx, promoted.map((p) => p.id), now);
            await events.changeConfirmedCount(tx, id, promoted.length);
          }
        }

        const ref = { eventId: id, eventTitle: updated.title, clubId: current.clubId, clubName: locked.clubName };
        if (changes.status === 'PUBLISHED') {
          await outbox.add(tx, OUTBOX.EVENT_PUBLISHED, eventMessage(ref, user, now));
        }
        if (changes.capacity !== undefined && changes.capacity !== locked.capacity) {
          await outbox.add(tx, OUTBOX.EVENT_CAPACITY_CHANGED, eventMessage(ref, user, now, { fromCapacity: locked.capacity, toCapacity: changes.capacity, promoted: promoted.length }));
        }
        for (const p of promoted) {
          await outbox.add(tx, OUTBOX.REGISTRATION_PROMOTED, registrationMessage(ref, p, now, { byOrganiser: true }));
        }
        return { event: updated, promoted: promoted.length };
      });
      afterCommit();
      return result;
    },

    async remove(user, id) {
      const event = await requireEvent(id);
      assertOrganiserOf(user, event.clubId);
      if (event.status !== 'DRAFT') {
        throw new AppError('Only draft events can be deleted. Cancel a published event instead.', 409, 'NOT_A_DRAFT');
      }
      await events.remove(id);
    },
  };
}
