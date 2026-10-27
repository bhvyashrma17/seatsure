import { body, query } from 'express-validator';

export const markReadRules = [body('read').isBoolean({ strict: true }).withMessage('read must be true').bail().equals('true').withMessage('Only read: true is supported')];

export const analyticsRules = [
  query('scope').optional().isIn(['mine', 'all']).withMessage('scope must be mine or all'),
  query('days').optional().isInt({ min: 7, max: 90 }).withMessage('days must be between 7 and 90').bail().toInt(),
];
