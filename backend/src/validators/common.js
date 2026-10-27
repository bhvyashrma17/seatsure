// [BACKEND M2.5: Request validation] Reusable express-validator chains.
// [BACKEND M2.6: Validation vs sanitisation] .trim()/.toInt()/.toDate() *sanitise* (normalise the
// value); .isInt()/.isLength()/.isIn() *validate* (reject bad values with a message).
import { param, query } from 'express-validator';

export const idParam = (name = 'id', label = 'id') =>
  param(name).isInt({ min: 1, max: 2_147_483_647 }).withMessage(`${label} must be a positive integer`).bail().toInt();

export const pageRules = (maxPageSize = 100) => [
  query('page').optional().isInt({ min: 1, max: 10_000 }).withMessage('page must be a positive integer').bail().toInt(),
  query('pageSize').optional().isInt({ min: 1, max: maxPageSize }).withMessage(`pageSize must be between 1 and ${maxPageSize}`).bail().toInt(),
];
