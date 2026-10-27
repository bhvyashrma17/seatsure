// [BACKEND M3.2] Domain rules as pure functions: no HTTP, no database.
import { describe, expect, it } from 'vitest';
import {
  assertCapacityChange,
  assertCheckInWindow,
  assertOpenForRegistration,
  assertTransition,
  assertValidQuestions,
  hasFreeSeat,
  normaliseAnswers,
} from '../../src/services/rules/eventRules.js';

const HOUR = 3_600_000;
const event = (o = {}) => ({ status: 'PUBLISHED', startsAt: new Date(Date.now() + 48 * HOUR), endsAt: new Date(Date.now() + 50 * HOUR), registrationClosesAt: null, capacity: 2, confirmedCount: 0, ...o });
const codeOf = (fn) => {
  try {
    fn();
  } catch (err) {
    return `${err.statusCode} ${err.code}`;
  }
  return 'no error';
};

const questions = [
  { id: 'tshirt', label: 'T-shirt size', type: 'select', required: true, options: ['S', 'M', 'L'] },
  { id: 'laptop', label: 'Laptop?', type: 'boolean', required: true },
  { id: 'team', label: 'Team', type: 'text', required: false },
];

describe('event workflow (state machine)', () => {
  it('BE-U01 allows DRAFT -> PUBLISHED -> CANCELLED and nothing else', () => {
    expect(codeOf(() => assertTransition('DRAFT', 'PUBLISHED'))).toBe('no error');
    expect(codeOf(() => assertTransition('PUBLISHED', 'CANCELLED'))).toBe('no error');
    expect(codeOf(() => assertTransition('DRAFT', 'CANCELLED'))).toBe('409 INVALID_STATUS_TRANSITION');
    expect(codeOf(() => assertTransition('CANCELLED', 'PUBLISHED'))).toBe('409 INVALID_STATUS_TRANSITION');
  });
});

describe('registration window', () => {
  it('BE-U02 rejects drafts and closed registrations', () => {
    const now = new Date();
    expect(codeOf(() => assertOpenForRegistration(event({ status: 'DRAFT' }), now))).toBe('409 REGISTRATION_NOT_OPEN');
    expect(codeOf(() => assertOpenForRegistration(event({ registrationClosesAt: new Date(Date.now() - 1000) }), now))).toBe('409 REGISTRATION_CLOSED');
    expect(codeOf(() => assertOpenForRegistration(event(), now))).toBe('no error');
  });

  it('BE-U03 opens check-in 2 hours before the start and closes it 2 hours after the end', () => {
    const e = event({ startsAt: new Date(Date.now() + 3 * HOUR), endsAt: new Date(Date.now() + 5 * HOUR) });
    expect(codeOf(() => assertCheckInWindow(e, new Date()))).toBe('409 CHECK_IN_NOT_OPEN');
    expect(codeOf(() => assertCheckInWindow(e, new Date(Date.now() + 1.5 * HOUR)))).toBe('no error');
    expect(codeOf(() => assertCheckInWindow(e, new Date(Date.now() + 8 * HOUR)))).toBe('409 CHECK_IN_CLOSED');
  });
});

describe('seats and capacity', () => {
  it('BE-U04 decides seat vs waitlist from confirmed count and capacity', () => {
    expect(hasFreeSeat(event({ capacity: 2, confirmedCount: 1 }))).toBe(true);
    expect(hasFreeSeat(event({ capacity: 2, confirmedCount: 2 }))).toBe(false);
  });

  it('BE-U05 refuses to shrink capacity below confirmed attendees or beyond the venue', () => {
    expect(codeOf(() => assertCapacityChange(event({ confirmedCount: 30 }), 20, 100))).toBe('409 CAPACITY_BELOW_CONFIRMED');
    expect(codeOf(() => assertCapacityChange(event({ confirmedCount: 10 }), 150, 100))).toBe('422 CAPACITY_EXCEEDS_VENUE');
    expect(codeOf(() => assertCapacityChange(event({ confirmedCount: 10 }), 40, 100))).toBe('no error');
  });
});

describe('answers to custom questions (stored as JSONB)', () => {
  it('BE-U06 cleans valid answers and coerces "true"/"false"', () => {
    expect(normaliseAnswers(questions, { tshirt: 'M', laptop: 'true', team: '  Byte Busters ' })).toEqual({ tshirt: 'M', laptop: true, team: 'Byte Busters' });
  });

  it('BE-U07 reports every problem at once with field paths', () => {
    let error;
    try {
      normaliseAnswers(questions, { tshirt: 'XXL', hacker: 'yes' });
    } catch (err) {
      error = err;
    }
    expect(error.statusCode).toBe(422);
    expect(error.errors.map((e) => e.field).sort()).toEqual(['answers.hacker', 'answers.laptop', 'answers.tshirt']);
  });

  it('BE-U08 validates an organiser\'s question list (unique ids, options only for choices)', () => {
    expect(codeOf(() => assertValidQuestions([{ id: 'a', type: 'text' }, { id: 'a', type: 'text' }]))).toBe('422 INVALID_QUESTIONS');
    expect(codeOf(() => assertValidQuestions([{ id: 'size', type: 'select', options: ['M'] }]))).toBe('422 INVALID_QUESTIONS');
    expect(codeOf(() => assertValidQuestions([{ id: 'size', type: 'select', options: ['M', 'L'] }]))).toBe('no error');
  });
});
