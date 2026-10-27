import { body, query } from 'express-validator';
import { RegistrationStatus } from '@seatsure/db';
import { idParam, pageRules } from './common.js';

const plainObject = (value) => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('answers must be an object');
  if (Object.keys(value).length > 10) throw new Error('Too many answers');
  return true;
};

// POST /events/:id/registrations: only `answers` is accepted. A client cannot choose its own
// status ("CONFIRMED") or event; those come from the URL and the server's seat decision.
export const registerRules = [idParam('id', 'Event id'), body('answers').default({}).custom(plainObject)];

export const registrationIdRules = [idParam('id', 'Registration id')];

export const checkInRules = [
  idParam('id', 'Registration id'),
  body('checkedIn').isBoolean({ strict: true }).withMessage('checkedIn must be true').bail().equals('true').withMessage('Only checkedIn: true is supported'),
];

export const attendeeListRules = [
  idParam('id', 'Event id'),
  ...pageRules(100),
  query('status').optional().isIn(Object.values(RegistrationStatus)).withMessage('Unknown status'),
  query('search').optional().isString().trim().isLength({ max: 60 }).withMessage('Search is limited to 60 characters'),
  query('answers').optional().custom(plainObject),
];
