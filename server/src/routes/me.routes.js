import express from 'express';
import { validate } from '../middleware/validate.js';
import { markReadRules } from '../validators/misc.validators.js';

export function createMeRouter({ misc, registrations, auth }) {
  const router = express.Router();
  router.use(auth.requireUser); // every /me route needs a known user
  router.get('/', misc.me);
  router.get('/registrations', registrations.mine);
  router.get('/notifications', misc.notifications);
  router.patch('/notifications', markReadRules, validate, misc.markNotificationsRead);
  return router;
}
