// [BACKEND M3.10: API versioning] Everything lives under /api/v1. A breaking change would ship as
// /api/v2 while v1 keeps working. The old unversioned /api/events route stays as a deprecated
// alias that tells clients where to go next.
import express from 'express';
import { deprecated } from '../middleware/deprecation.js';
import { validate } from '../middleware/validate.js';
import { listEventsRules } from '../validators/events.validators.js';
import { createAnalyticsRouter } from './analytics.routes.js';
import { createDevRouter } from './dev.routes.js';
import { createEventsRouter } from './events.routes.js';
import { createMeRouter } from './me.routes.js';
import { createRegistrationsRouter } from './registrations.routes.js';

export function createApiRouter({ controllers, auth, config, mongoControl }) {
  const v1 = express.Router();
  v1.get('/health', controllers.misc.health);
  v1.get('/users', controllers.misc.demoUsers);
  v1.get('/clubs', controllers.misc.clubs);
  v1.get('/venues', controllers.misc.venues);
  v1.use('/events', createEventsRouter({ events: controllers.events, registrations: controllers.registrations, auth }));
  v1.use('/registrations', createRegistrationsRouter({ registrations: controllers.registrations, auth }));
  v1.use('/me', createMeRouter({ misc: controllers.misc, registrations: controllers.registrations, auth }));
  v1.use('/analytics', createAnalyticsRouter({ misc: controllers.misc, auth }));
  if (config.enableDevRoutes) v1.use('/dev', createDevRouter({ auth, mongoControl }));

  const api = express.Router();
  api.use('/v1', v1);
  api.get(
    '/events',
    deprecated({ successor: '/api/v1/events', sunset: 'Tue, 30 Jun 2027 00:00:00 GMT' }),
    listEventsRules,
    validate,
    controllers.events.list,
  );
  return api;
}
