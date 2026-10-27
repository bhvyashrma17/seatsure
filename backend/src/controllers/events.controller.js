// [BACKEND M2.10: Thin controllers] Each handler only EXTRACTS validated input, CALLS one service
// method and FORMATS the HTTP response. No business rules and no database access live here.
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, noContent, ok } from '../utils/respond.js';

export function createEventsController({ eventService, registrationService, feedService, config }) {
  return {
    list: asyncHandler(async (req, res) => {
      const filters = req.valid.query;
      const limit = filters.limit ?? config.pagination.defaultLimit;
      const { items, nextCursor } = await eventService.list({ ...filters, limit });
      // [BACKEND M3.8: Pagination metadata] Clients follow nextCursor; null means "last page".
      ok(res, items, { limit, nextCursor, hasMore: nextCursor !== null });
    }),

    get: asyncHandler(async (req, res) => {
      ok(res, await eventService.get(req.valid.params.id, req.user));
    }),

    listMine: asyncHandler(async (req, res) => {
      const { page = 1, pageSize = 10, status } = req.valid.query;
      const { items, total } = await eventService.listForOrganiser(req.user, { page, pageSize, status });
      ok(res, items, { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) });
    }),

    create: asyncHandler(async (req, res) => {
      const event = await eventService.create(req.user, req.valid.body);
      created(res, event, `/api/v1/events/${event.id}`);
    }),

    update: asyncHandler(async (req, res) => {
      const result = await eventService.update(req.user, req.valid.params.id, req.valid.body);
      ok(res, result.event, { promotedFromWaitlist: result.promoted });
    }),

    remove: asyncHandler(async (req, res) => {
      await eventService.remove(req.user, req.valid.params.id);
      noContent(res);
    }),

    register: asyncHandler(async (req, res) => {
      const result = await registrationService.register(req.user, req.valid.params.id, req.valid.body.answers);
      created(res, result, `/api/v1/registrations/${result.registration.id}`);
    }),

    attendees: asyncHandler(async (req, res) => {
      const { page = 1, pageSize = config.pagination.defaultPageSize, status, search, answers } = req.valid.query;
      const result = await registrationService.listForEvent(req.user, req.valid.params.id, { page, pageSize, status, search, answers });
      ok(res, result.items, { page, pageSize, total: result.total, totalPages: Math.max(1, Math.ceil(result.total / pageSize)), event: result.event });
    }),

    activity: asyncHandler(async (req, res) => {
      const { items, degraded } = await feedService.eventActivity(req.valid.params.id);
      ok(res, items, { degraded });
    }),
  };
}
