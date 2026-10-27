// Development-only switches used in the live demo to show graceful degradation ([BACKEND M3.11]).
// Never mounted when NODE_ENV=production.
import express from 'express';
import { requireRole } from '../middleware/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';

export function createDevRouter({ auth, mongoControl }) {
  const router = express.Router();
  router.use(auth.requireUser, requireRole('ORGANISER'));
  router.post('/mongo/outage', asyncHandler(async (req, res) => ok(res, { mongo: await mongoControl.disconnect() })));
  router.post('/mongo/restore', asyncHandler(async (req, res) => ok(res, { mongo: await mongoControl.reconnect() })));
  return router;
}
