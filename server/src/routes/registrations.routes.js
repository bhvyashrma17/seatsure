import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { checkInRules, registrationIdRules } from '../validators/registrations.validators.js';

export function createRegistrationsRouter({ registrations, auth }) {
  const router = express.Router();
  // DELETE = cancel. 200 with a body (not 204) because the client needs to know who got promoted.
  router.delete('/:id', auth.requireUser, registrationIdRules, validate, registrations.cancel);
  // PATCH { checkedIn: true }: the only field an organiser may change on a registration.
  router.patch('/:id', auth.requireUser, requireRole('ORGANISER'), checkInRules, validate, registrations.checkIn);
  return router;
}
