// [BACKEND M3.2: Domain rules & workflows] [BACKEND M3.4-3.6: Concurrency, race conditions, transactions]
//
// [BACKEND M2.1: Event loop] Node runs one piece of JavaScript at a time, but every `await` hands control
// back to the event loop, so another request can run between this request's read and its write.
// The race this service prevents (an "inventory oversell", [BACKEND M3.5]):
//   request A reads "39/40 confirmed"  ->  request B reads "39/40 confirmed"
//   A inserts CONFIRMED (40/40)         ->  B inserts CONFIRMED (41/40)  <- overbooked
// The fix ([BACKEND M3.6]): read-check-write happens inside ONE transaction that first locks the event
// row (SELECT ... FOR UPDATE, [DATABASE M1.14]). B's transaction waits at the lock until A commits, and
// then sees 40/40, so B is waitlisted. A CHECK constraint (confirmed_count <= capacity) backs this
// up inside PostgreSQL itself.
import { OUTBOX, registrationMessage } from '@seatsure/db';
import { AppError } from '../utils/AppError.js';
import { retry } from '../utils/retry.js';
import { logger } from '../utils/logger.js';
import {
  assertCanCancel,
  assertCheckInWindow,
  assertOpenForRegistration,
  assertOrganiserOf,
  hasFreeSeat,
  normaliseAnswers,
} from './rules/eventRules.js';

// Transient failures that are safe to retry because the failed transaction was rolled back.
const isTransient = (err) => err?.kind === 'WRITE_CONFLICT' || err?.kind === 'TIMEOUT';

export function createRegistrationService({ events, registrations, outbox, runInTransaction, afterCommit = () => {}, clock = () => new Date() }) {
  // [BACKEND M3.11: Reliability] A transaction that lost a deadlock/serialisation race or timed out
  // waiting for a pooled connection is re-run with exponential backoff + jitter.
  const transactWithRetry = (work) =>
    retry(() => runInTransaction(work), {
      retries: 3,
      shouldRetry: isTransient,
      onRetry: (err, attempt, delay) => logger.warn('Retrying registration transaction', { attempt, delay, kind: err.kind }),
    });

  async function requireRegistration(id) {
    const reg = await registrations.findById(id);
    if (!reg) throw new AppError(`Registration ${id} not found`, 404, 'REGISTRATION_NOT_FOUND');
    return reg;
  }

  function eventRef(event) {
    return { eventId: event.id, eventTitle: event.title, clubId: event.clubId, clubName: event.clubName ?? event.club?.name ?? '' };
  }

  return {
    /**
     * Workflow: lock event -> check rules -> check duplicate -> validate answers -> take a seat
     * or join the waitlist -> write the outbox message. All of it commits together or not at all.
     */
    async register(user, eventId, rawAnswers) {
      const result = await transactWithRetry(async (tx) => {
        const event = await events.lockForUpdate(tx, eventId);
        if (!event) throw new AppError(`Event ${eventId} not found`, 404, 'EVENT_NOT_FOUND');
        const now = clock();
        assertOpenForRegistration(event, now);

        if (await registrations.findActive(eventId, user.id, tx)) {
          throw new AppError('You are already registered for this event', 409, 'ALREADY_REGISTERED');
        }
        const answers = normaliseAnswers(event.questions, rawAnswers);

        const confirmed = hasFreeSeat(event);
        const registration = await registrations.create(tx, {
          eventId,
          userId: user.id,
          status: confirmed ? 'CONFIRMED' : 'WAITLISTED',
          answers,
        });
        if (confirmed) await events.changeConfirmedCount(tx, eventId, +1);

        const position = confirmed ? null : (await registrations.waitlistPositions([registration.id], tx)).get(registration.id) ?? null;
        await outbox.add(
          tx,
          confirmed ? OUTBOX.REGISTRATION_CONFIRMED : OUTBOX.REGISTRATION_WAITLISTED,
          registrationMessage(eventRef(event), { id: registration.id, userId: user.id, userName: user.name }, now, position ? { position } : {}),
        );

        return {
          registration: { id: registration.id, status: registration.status, createdAt: registration.createdAt, answers },
          outcome: registration.status,
          position,
          seatsLeft: Math.max(0, event.capacity - event.confirmedCount - (confirmed ? 1 : 0)),
        };
      });
      afterCommit();
      return result;
    },

    /**
     * Workflow: cancel, and if a confirmed seat was freed, promote the oldest waitlisted person
     * into it in the SAME transaction, so the seat is never lost or double-assigned.
     */
    async cancel(user, registrationId) {
      const existing = await requireRegistration(registrationId);
      const isOwner = existing.userId === user.id;

      const result = await transactWithRetry(async (tx) => {
        const event = await events.lockForUpdate(tx, existing.eventId);
        if (!isOwner) assertOrganiserOf(user, event.clubId);
        const now = clock();
        assertCanCancel(event, now);

        // Re-read under the lock: a parallel request may have changed it since we looked.
        const reg = await registrations.findById(registrationId, tx);
        if (reg.status === 'CANCELLED') throw new AppError('This registration is already cancelled', 409, 'ALREADY_CANCELLED');

        await registrations.cancel(tx, reg.id, now);
        const ref = eventRef(event);
        await outbox.add(tx, OUTBOX.REGISTRATION_CANCELLED, registrationMessage(ref, { id: reg.id, userId: reg.userId, userName: reg.user.name }, now, { byOrganiser: !isOwner }));

        let promoted = null;
        if (reg.status === 'CONFIRMED') {
          const [next] = await registrations.nextWaitlisted(tx, event.id, 1);
          if (next) {
            await registrations.promote(tx, [next.id], now); // seat passes straight on: count unchanged
            await outbox.add(tx, OUTBOX.REGISTRATION_PROMOTED, registrationMessage(ref, next, now));
            promoted = { registrationId: next.id, userId: next.userId, userName: next.userName };
          } else {
            await events.changeConfirmedCount(tx, event.id, -1);
          }
        }
        return { cancelled: { id: reg.id, previousStatus: reg.status, cancelledAt: now }, promoted };
      });
      afterCommit();
      return result;
    },

    /** Organiser check-in. Idempotent: checking in twice is not an error. */
    async checkIn(user, registrationId) {
      const reg = await requireRegistration(registrationId);
      const event = await events.findDetail(reg.eventId);
      assertOrganiserOf(user, event.clubId);
      if (reg.status !== 'CONFIRMED') throw new AppError('Only confirmed attendees can be checked in', 409, 'NOT_CONFIRMED');
      const now = clock();
      assertCheckInWindow(event, now);

      const outcome = await runInTransaction(async (tx) => {
        const changed = await registrations.markCheckedIn(reg.id, now, tx);
        if (changed) {
          await outbox.add(tx, OUTBOX.REGISTRATION_CHECKED_IN, registrationMessage(eventRef(event), { id: reg.id, userId: reg.userId, userName: reg.user.name }, now, { byOrganiser: true }));
        }
        return changed;
      });
      afterCommit();
      return { id: reg.id, checkedIn: true, alreadyCheckedIn: outcome === 0 };
    },

    /** "My passes" with live waitlist positions. */
    async listMine(user) {
      const rows = await registrations.listForUser(user.id);
      const waitlisted = rows.filter((r) => r.status === 'WAITLISTED').map((r) => r.id);
      const positions = await registrations.waitlistPositions(waitlisted);
      return rows.map((r) => ({
        id: r.id,
        status: r.status,
        position: positions.get(r.id) ?? null,
        answers: r.answers,
        createdAt: r.createdAt,
        promotedAt: r.promotedAt,
        cancelledAt: r.cancelledAt,
        checkedInAt: r.checkedInAt,
        event: { ...r.event, seatsLeft: Math.max(0, r.event.capacity - r.event.confirmedCount) },
      }));
    },

    /** Organiser attendee list (offset pagination + JSONB answer filter). */
    async listForEvent(user, eventId, query) {
      const event = await events.findById(eventId);
      if (!event) throw new AppError(`Event ${eventId} not found`, 404, 'EVENT_NOT_FOUND');
      assertOrganiserOf(user, event.clubId);
      const answers = query.answers ? coerceAnswerFilter(event.questions, query.answers) : undefined;
      const { items, total } = await registrations.listForEvent(eventId, { ...query, answers });
      const now = clock();
      let checkInOpen = true;
      try {
        assertCheckInWindow(event, now);
      } catch {
        checkInOpen = false;
      }
      return {
        items,
        total,
        event: {
          id: event.id,
          title: event.title,
          questions: event.questions,
          capacity: event.capacity,
          confirmedCount: event.confirmedCount,
          startsAt: event.startsAt,
          endsAt: event.endsAt,
          checkInOpen,
        },
      };
    },

    /** Async generator of CSV lines for an organiser export (consumed as a Node stream, [BACKEND M2.2]). */
    async *exportCsv(user, eventId) {
      const event = await events.findById(eventId);
      if (!event) throw new AppError(`Event ${eventId} not found`, 404, 'EVENT_NOT_FOUND');
      assertOrganiserOf(user, event.clubId);
      const questionIds = (event.questions ?? []).map((q) => q.id);
      yield csvLine(['registration_id', 'name', 'email', 'department', 'year', 'status', 'registered_at', 'checked_in_at', ...questionIds]);
      for await (const batch of registrations.iterateForExport(eventId)) {
        for (const r of batch) {
          yield csvLine([
            r.id,
            r.user.name,
            r.user.email,
            r.user.department ?? '',
            r.user.yearOfStudy ?? '',
            r.status,
            r.createdAt.toISOString(),
            r.checkedInAt?.toISOString() ?? '',
            ...questionIds.map((id) => r.answers?.[id] ?? ''),
          ]);
        }
      }
    },
  };
}

/** Converts query-string answer filters ("true", "M") into the JSON types stored for each question. */
function coerceAnswerFilter(questions, filter) {
  const byId = new Map((questions ?? []).map((q) => [q.id, q]));
  const out = {};
  for (const [key, value] of Object.entries(filter)) {
    const q = byId.get(key);
    if (!q) throw new AppError('Unknown question in filter', 400, 'UNKNOWN_QUESTION', [{ field: `answers.${key}`, message: 'This event has no such question' }]);
    out[key] = q.type === 'boolean' ? value === 'true' || value === true : String(value);
  }
  return out;
}

// RFC 4180 quoting, plus a leading quote for values that a spreadsheet would run as a formula.
function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvLine(values) {
  return values.map(csvCell).join(',') + '\n';
}
