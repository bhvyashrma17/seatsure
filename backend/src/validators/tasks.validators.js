// [BACKEND M2.5: Request validation] [BACKEND M2.6: Sanitisation + mass-assignment protection] for /tasks.
// Only title, notes, dueDate and completed are ever read from the body; the owner comes from X-User-Id.
import { body, query } from 'express-validator';
import { idParam } from './common.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const isEmpty = (v) => v === null || v === '';

const titleRule = (chain) =>
  chain
    .isString()
    .withMessage('Title must be text')
    .bail()
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .bail()
    .isLength({ max: 120 })
    .withMessage('Title must be at most 120 characters');

// null or "" clears the field.
const notesRule = body('notes')
  .optional()
  .custom((v) => isEmpty(v) || typeof v === 'string')
  .withMessage('Notes must be text')
  .bail()
  .customSanitizer((v) => (isEmpty(v) ? null : v.trim() || null))
  .custom((v) => v === null || v.length <= 500)
  .withMessage('Notes must be at most 500 characters');

const dueDateRule = body('dueDate')
  .optional()
  .custom((v) => isEmpty(v) || (typeof v === 'string' && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v))))
  .withMessage('Due date must be a date (YYYY-MM-DD)')
  .bail()
  .customSanitizer((v) => (isEmpty(v) ? null : new Date(`${v}T00:00:00Z`)));

export const taskIdRules = [idParam('id', 'Task id')];

export const listTasksRules = [query('status').optional().isIn(['all', 'open', 'done']).withMessage('status must be all, open or done')];

export const createTaskRules = [titleRule(body('title').exists({ values: 'null' }).withMessage('Title is required').bail()), notesRule, dueDateRule];

export const updateTaskRules = [
  idParam('id', 'Task id'),
  titleRule(body('title').optional()),
  notesRule,
  dueDateRule,
  body('completed').optional().isBoolean({ strict: true }).withMessage('completed must be true or false').bail().toBoolean(),
];
