// [BACKEND M2.10: Thin controllers] for the tasks resource: extract the validated input, call one service
// method, format the response with the right status code (200, 201 + Location, 204).
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, noContent, ok } from '../utils/respond.js';

export function createTasksController({ taskService }) {
  return {
    list: asyncHandler(async (req, res) => {
      const { items, open, done } = await taskService.list(req.user, req.valid.query.status ?? 'all');
      ok(res, items, { total: items.length, open, done });
    }),

    get: asyncHandler(async (req, res) => {
      ok(res, await taskService.get(req.user, req.valid.params.id));
    }),

    create: asyncHandler(async (req, res) => {
      const task = await taskService.create(req.user, req.valid.body);
      created(res, task, `/api/v1/tasks/${task.id}`);
    }),

    update: asyncHandler(async (req, res) => {
      ok(res, await taskService.update(req.user, req.valid.params.id, req.valid.body));
    }),

    remove: asyncHandler(async (req, res) => {
      await taskService.remove(req.user, req.valid.params.id);
      noContent(res);
    }),
  };
}
