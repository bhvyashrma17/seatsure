import { body, query } from 'express-validator';
import { EventCategory, EventStatus } from '@seatsure/db';
import { idParam, pageRules } from './common.js';

const CATEGORIES = Object.values(EventCategory);
const QUESTION_TYPES = ['text', 'select', 'boolean'];

const isFuture = (value) => {
  if (new Date(value) <= new Date()) throw new Error('Must be in the future');
  return true;
};

export const eventIdRules = [idParam('id', 'Event id')];

// GET /events: every filter is optional and whitelisted; unknown query params are ignored.
export const listEventsRules = [
  query('q').optional().isString().trim().isLength({ max: 60 }).withMessage('Search text is limited to 60 characters'),
  query('clubId').optional().isInt({ min: 1 }).withMessage('clubId must be a positive integer').bail().toInt(),
  query('category').optional().isIn(CATEGORIES).withMessage(`category must be one of ${CATEGORIES.join(', ')}`),
  query('from').optional().isISO8601().withMessage('from must be an ISO date').bail().toDate(),
  query('to').optional().isISO8601().withMessage('to must be an ISO date').bail().toDate(),
  query('availability').optional().isIn(['open', 'full']).withMessage('availability must be open or full'),
  query('sort').optional().isIn(['soonest', 'latest', 'popular']).withMessage('sort must be soonest, latest or popular'),
  query('cursor').optional().isInt({ min: 1 }).withMessage('cursor is invalid').bail().toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit must be between 1 and 50').bail().toInt(),
];

export const organiserEventsRules = [
  ...pageRules(50),
  query('status').optional().isIn(Object.values(EventStatus)).withMessage('Unknown status'),
];

const questionRules = (optional) => [
  (optional ? body('questions').optional() : body('questions').default([]))
    .isArray({ max: 5 })
    .withMessage('Add at most 5 questions'),
  body('questions.*.id')
    .isString()
    .trim()
    .matches(/^[a-z][a-z0-9_]{1,23}$/)
    .withMessage('Question ids use 2-24 lowercase letters, digits or _'),
  body('questions.*.label').isString().trim().isLength({ min: 3, max: 100 }).withMessage('Question text must be 3-100 characters'),
  body('questions.*.type').isIn(QUESTION_TYPES).withMessage(`Question type must be one of ${QUESTION_TYPES.join(', ')}`),
  body('questions.*.required').isBoolean({ strict: true }).withMessage('required must be true or false'),
  body('questions.*.options').optional().isArray({ min: 2, max: 8 }).withMessage('Give 2-8 options'),
  body('questions.*.options.*').isString().trim().isLength({ min: 1, max: 40 }).withMessage('Options must be 1-40 characters'),
];

export const createEventRules = [
  body('clubId').isInt({ min: 1 }).withMessage('Choose a club').bail().toInt(),
  body('venueId').isInt({ min: 1 }).withMessage('Choose a venue').bail().toInt(),
  body('title').isString().trim().isLength({ min: 5, max: 120 }).withMessage('Title must be 5-120 characters'),
  body('description').isString().trim().isLength({ min: 20, max: 2000 }).withMessage('Description must be 20-2000 characters'),
  body('category').isIn(CATEGORIES).withMessage(`Category must be one of ${CATEGORIES.join(', ')}`),
  body('startsAt').isISO8601().withMessage('Start must be a date and time').bail().custom(isFuture).withMessage('The event must start in the future').toDate(),
  body('endsAt')
    .isISO8601()
    .withMessage('End must be a date and time')
    .bail()
    .custom((end, { req }) => new Date(end) > new Date(req.body.startsAt))
    .withMessage('The event must end after it starts')
    .toDate(),
  body('registrationClosesAt')
    .optional({ values: 'null' })
    .isISO8601()
    .withMessage('Registration close must be a date and time')
    .bail()
    .custom((closes, { req }) => new Date(closes) <= new Date(req.body.startsAt))
    .withMessage('Registration must close before the event starts')
    .toDate(),
  body('capacity').isInt({ min: 1, max: 2000 }).withMessage('Capacity must be between 1 and 2000').bail().toInt(),
  ...questionRules(false),
];

// PATCH: same rules, all optional. `status` is the only way to move through the workflow.
export const updateEventRules = [
  ...eventIdRules,
  body('venueId').optional().isInt({ min: 1 }).withMessage('Choose a venue').bail().toInt(),
  body('title').optional().isString().trim().isLength({ min: 5, max: 120 }).withMessage('Title must be 5-120 characters'),
  body('description').optional().isString().trim().isLength({ min: 20, max: 2000 }).withMessage('Description must be 20-2000 characters'),
  body('category').optional().isIn(CATEGORIES).withMessage('Unknown category'),
  body('startsAt').optional().isISO8601().withMessage('Start must be a date and time').bail().custom(isFuture).withMessage('The event must start in the future').toDate(),
  body('endsAt').optional().isISO8601().withMessage('End must be a date and time').bail().toDate(),
  body('registrationClosesAt').optional({ values: 'null' }).isISO8601().withMessage('Registration close must be a date and time').bail().toDate(),
  body('capacity').optional().isInt({ min: 1, max: 2000 }).withMessage('Capacity must be between 1 and 2000').bail().toInt(),
  body('status').optional().isIn(['PUBLISHED', 'CANCELLED']).withMessage('status can only be set to PUBLISHED or CANCELLED'),
  ...questionRules(true),
];
