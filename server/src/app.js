// Builds the Express application. No database connections or listen() here, so tests can create
// an app with any dependencies and drive it with Supertest.
// [BACKEND M3.1: Backend data flow] request -> middleware pipeline -> router -> validator -> controller
// -> service -> repository (@seatsure/db) -> PostgreSQL, and the response travels back the same way.
import cors from 'cors';
import express from 'express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createEventsController } from './controllers/events.controller.js';
import { createMiscController } from './controllers/misc.controller.js';
import { createRegistrationsController } from './controllers/registrations.controller.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { requestId } from './middleware/requestId.js';
import { requestTimer } from './middleware/requestTimer.js';
import { createApiRouter } from './routes/index.js';
import { ok } from './utils/respond.js';

export function createApp(container) {
  const { config } = container;
  const app = express();
  app.disable('x-powered-by'); // don't advertise the framework
  app.set('query parser', 'extended'); // allow ?answers[tshirt]=M style filters (Express 5 defaults to "simple")

  const controllers = {
    events: createEventsController(container),
    registrations: createRegistrationsController(container),
    misc: createMiscController(container),
  };
  const auth = createAuthMiddleware({ users: container.users });

  // [BACKEND M2.4: Ordered middleware pipeline]
  app.use(requestId); // 1. tag the request (must be first so every later log line has the id)
  app.use(requestTimer); // 2. time + log it
  app.use(
    // 3. [FULLSTACK M2.1: CORS] only the React dev/prod origins may call the API from a browser
    cors({
      origin: config.corsOrigins,
      exposedHeaders: ['X-Request-Id', 'X-Response-Time', 'Deprecation', 'Sunset', 'Link', 'Location'],
    }),
  );
  app.use(express.json({ limit: config.bodyLimit })); // 4. parse JSON, reject bodies over 10 kb (413)

  // Production: serve the built React app. Any GET outside /api returns index.html, so React Router can
  // handle deep links such as /events/12; API paths still reach the routers and the JSON 404 handler.
  if (config.clientDist && existsSync(path.join(config.clientDist, 'index.html'))) {
    app.use(express.static(config.clientDist, { index: false, maxAge: '1h' }));
    app.get(/^\/(?!api(?:\/|$)).*/, (req, res) => res.sendFile(path.join(config.clientDist, 'index.html')));
  }
  app.get('/', (req, res) => ok(res, { name: 'SeatSure API', version: 'v1', health: '/api/v1/health' }));
  app.use('/api', createApiRouter({ controllers, auth, config, mongoControl: container.mongoControl })); // 5. routes

  app.use(notFound); // 6. nothing matched -> 404
  app.use(errorHandler); // 7. LAST: every error becomes one consistent envelope
  return app;
}
