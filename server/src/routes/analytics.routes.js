import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { analyticsRules } from '../validators/misc.validators.js';

export function createAnalyticsRouter({ misc, auth }) {
  const router = express.Router();
  router.use(auth.requireUser, requireRole('ORGANISER'));
  router.get('/overview', analyticsRules, validate, misc.analyticsOverview);
  router.get('/activity', analyticsRules, validate, misc.analyticsActivity);
  return router;
}
