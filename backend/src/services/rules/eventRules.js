// [BACKEND M3.2: Domain rules] Pure functions that encode SeatSure's business rules. They take plain
// values, return or throw AppError, and know nothing about HTTP or the database, so every rule
// can be unit-tested in isolation ([BACKEND M2.10: services never touch req/res]).
import { AppError } from '../../utils/AppError.js';

const HOUR = 3_600_000;

// [BACKEND M3.2: Workflow] The event lifecycle as a small state machine.
export const STATUS_TRANSITIONS = Object.freeze({
  DRAFT: ['PUBLISHED'],
  PUBLISHED: ['CANCELLED'],
  CANCELLED: [],
});

export function assertTransition(from, to) {
  if (from === to) return;
  if (!STATUS_TRANSITIONS[from]?.includes(to)) {
    throw new AppError(`An event cannot go from ${from} to ${to}`, 409, 'INVALID_STATUS_TRANSITION');
  }
}

/** Only organisers of the event's club may manage it. */
export function assertOrganiserOf(user, clubId) {
  if (!user?.clubs?.some((c) => c.id === clubId)) {
    throw new AppError('Only organisers of this club can manage its events', 403, 'NOT_CLUB_ORGANISER');
  }
}

export function assertOpenForRegistration(event, now) {
  if (event.status !== 'PUBLISHED') {
    throw new AppError('Registrations are not open for this event', 409, 'REGISTRATION_NOT_OPEN');
  }
  const closesAt = event.registrationClosesAt ?? event.startsAt;
  if (now >= new Date(closesAt)) {
    throw new AppError('Registration for this event has closed', 409, 'REGISTRATION_CLOSED');
  }
}

export function assertCanCancel(event, now) {
  if (now >= new Date(event.startsAt)) {
    throw new AppError('This event has already started, so the registration can no longer be cancelled', 409, 'EVENT_STARTED');
  }
}

/** Check-in is allowed from 2 hours before the start until 2 hours after the end. */
export function assertCheckInWindow(event, now) {
  const opens = new Date(event.startsAt).getTime() - 2 * HOUR;
  const closes = new Date(event.endsAt).getTime() + 2 * HOUR;
  if (now.getTime() < opens) throw new AppError('Check-in opens 2 hours before the event starts', 409, 'CHECK_IN_NOT_OPEN');
  if (now.getTime() > closes) throw new AppError('Check-in for this event has closed', 409, 'CHECK_IN_CLOSED');
}

/** The seat decision. Callers must hold the event row lock, or two requests could both see a free seat. */
export function hasFreeSeat(event) {
  return event.confirmedCount < event.capacity;
}

export function assertCapacityChange(event, newCapacity, venueCapacity) {
  if (newCapacity < event.confirmedCount) {
    throw new AppError(
      `Capacity cannot go below the ${event.confirmedCount} people already confirmed`,
      409,
      'CAPACITY_BELOW_CONFIRMED',
    );
  }
  assertWithinVenue(newCapacity, venueCapacity);
}

export function assertWithinVenue(capacity, venueCapacity) {
  if (capacity > venueCapacity) {
    throw new AppError(`Capacity cannot exceed the venue's ${venueCapacity} seats`, 422, 'CAPACITY_EXCEEDS_VENUE', [
      { field: 'capacity', message: `The venue holds at most ${venueCapacity} people` },
    ]);
  }
}

/**
 * Checks a student's answers against the event's own question list (stored as JSONB) and returns
 * a cleaned copy. Unknown keys are rejected rather than silently stored ([BACKEND M2.6: allowlist]).
 */
export function normaliseAnswers(questions, answers = {}) {
  const errors = [];
  const clean = {};
  const byId = new Map((questions ?? []).map((q) => [q.id, q]));

  for (const key of Object.keys(answers)) {
    if (!byId.has(key)) errors.push({ field: `answers.${key}`, message: 'This event has no such question' });
  }

  for (const q of questions ?? []) {
    const raw = answers[q.id];
    const missing = raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '');
    if (missing) {
      if (q.required) errors.push({ field: `answers.${q.id}`, message: `"${q.label}" is required` });
      continue;
    }
    if (q.type === 'boolean') {
      if (raw === true || raw === 'true') clean[q.id] = true;
      else if (raw === false || raw === 'false') clean[q.id] = false;
      else errors.push({ field: `answers.${q.id}`, message: 'Answer yes or no' });
    } else if (q.type === 'select') {
      if (typeof raw === 'string' && q.options?.includes(raw)) clean[q.id] = raw;
      else errors.push({ field: `answers.${q.id}`, message: `Choose one of: ${(q.options ?? []).join(', ')}` });
    } else {
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (!text || text.length > 200) errors.push({ field: `answers.${q.id}`, message: 'Answer with 1-200 characters' });
      else clean[q.id] = text;
    }
  }

  if (errors.length) throw new AppError('Some answers are invalid', 422, 'INVALID_ANSWERS', errors);
  return clean;
}

/** Validates the shape of an organiser's question list (ids unique, options only for selects). */
export function assertValidQuestions(questions = []) {
  const errors = [];
  const seen = new Set();
  questions.forEach((q, i) => {
    if (seen.has(q.id)) errors.push({ field: `questions[${i}].id`, message: 'Question ids must be unique' });
    seen.add(q.id);
    if (q.type === 'select' && (!Array.isArray(q.options) || q.options.length < 2)) {
      errors.push({ field: `questions[${i}].options`, message: 'A choice question needs at least 2 options' });
    }
    if (q.type !== 'select' && q.options?.length) {
      errors.push({ field: `questions[${i}].options`, message: 'Only choice questions can have options' });
    }
  });
  if (errors.length) throw new AppError('Some questions are invalid', 422, 'INVALID_QUESTIONS', errors);
}

export function toSeatSummary(event) {
  const seatsLeft = Math.max(0, event.capacity - event.confirmedCount);
  return { seatsLeft, isFull: seatsLeft === 0 };
}
