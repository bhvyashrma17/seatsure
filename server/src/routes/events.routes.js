// [BACKEND M1.5: REST resource design] Nouns, not verbs: /events is a collection, /events/:id one
// resource, /events/:id/registrations a sub-resource; the HTTP method says what to do with it.
// [BACKEND M1.11 + M2.3: Express Router modules] One router per resource. Each route reads like a
// table of contents: URL + method -> middleware chain -> controller.
import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { attendeeListRules, registerRules } from '../validators/registrations.validators.js';
import { createEventRules, eventIdRules, listEventsRules, organiserEventsRules, updateEventRules } from '../validators/events.validators.js';

export function createEventsRouter({ events, registrations, auth }) {
  const router = express.Router();
  const organiser = [auth.requireUser, requireRole('ORGANISER')];

  router.get('/', listEventsRules, validate, events.list); // public catalogue
  router.get('/mine', ...organiser, organiserEventsRules, validate, events.listMine); // organiser dashboard
  router.post('/', ...organiser, createEventRules, validate, events.create);
  router.get('/:id', auth.optionalUser, eventIdRules, validate, events.get);
  router.patch('/:id', ...organiser, updateEventRules, validate, events.update);
  router.delete('/:id', ...organiser, eventIdRules, validate, events.remove);

  // Sub-resources of an event.
  router.post('/:id/registrations', auth.requireUser, registerRules, validate, events.register);
  router.get('/:id/registrations', ...organiser, attendeeListRules, validate, events.attendees);
  router.get('/:id/registrations/export', ...organiser, eventIdRules, validate, registrations.exportCsv);
  router.get('/:id/activity', eventIdRules, validate, events.activity);
  return router;
}
