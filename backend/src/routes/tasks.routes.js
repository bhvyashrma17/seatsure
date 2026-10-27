// [BACKEND M1.5 + M1.13-1.14: CRUD over REST] /tasks is a collection and /tasks/:id one task:
//   GET /tasks (200) · POST /tasks (201 + Location) · GET /tasks/:id (200) · PATCH /tasks/:id (200) · DELETE /tasks/:id (204)
import express from 'express';
import { validate } from '../middleware/validate.js';
import { createTaskRules, listTasksRules, taskIdRules, updateTaskRules } from '../validators/tasks.validators.js';

export function createTasksRouter({ tasks, auth }) {
  const router = express.Router();
  router.use(auth.requireUser); // tasks are personal, so every route needs a known user
  router.get('/', listTasksRules, validate, tasks.list);
  router.post('/', createTaskRules, validate, tasks.create);
  router.get('/:id', taskIdRules, validate, tasks.get);
  router.patch('/:id', updateTaskRules, validate, tasks.update);
  router.delete('/:id', taskIdRules, validate, tasks.remove);
  return router;
}
