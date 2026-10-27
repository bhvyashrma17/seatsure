import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/respond.js';

export function createMiscController({ users, catalog, feedService, analyticsService, healthService }) {
  return {
    health: asyncHandler(async (req, res) => {
      const report = await healthService.check();
      // 200 while PostgreSQL (the source of truth) is up, even if MongoDB is degraded.
      res.status(report.postgres === 'up' ? 200 : 503).json({ status: report.postgres === 'up' ? 'success' : 'error', data: report });
    }),

    demoUsers: asyncHandler(async (req, res) => {
      ok(res, await users.listDemoUsers());
    }),

    me: asyncHandler(async (req, res) => {
      ok(res, req.user);
    }),

    clubs: asyncHandler(async (req, res) => {
      ok(res, await catalog.listClubs());
    }),

    venues: asyncHandler(async (req, res) => {
      ok(res, await catalog.listVenues());
    }),

    notifications: asyncHandler(async (req, res) => {
      const { items, unread, degraded } = await feedService.notifications(req.user);
      ok(res, items, { unread, degraded });
    }),

    markNotificationsRead: asyncHandler(async (req, res) => {
      const { updated, degraded } = await feedService.markAllRead(req.user);
      ok(res, { updated }, { degraded });
    }),

    analyticsOverview: asyncHandler(async (req, res) => {
      ok(res, await analyticsService.overview(req.user, req.valid.query));
    }),

    analyticsActivity: asyncHandler(async (req, res) => {
      ok(res, await analyticsService.activity(req.user, req.valid.query));
    }),
  };
}
