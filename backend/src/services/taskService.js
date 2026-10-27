// [BACKEND M2.10: Service layer] [BACKEND M3.2: Domain rules] Personal to-do tasks. Plain values in, AppError out.
// [BACKEND M3.3: Trust boundary] A task belongs to one user: another user's task is reported as "not found",
// so its existence is not revealed.
import { AppError } from '../utils/AppError.js';

const EDITABLE = ['title', 'notes', 'dueDate', 'completed'];

export function createTaskService({ tasks, clock = () => new Date() }) {
  async function requireOwn(user, id) {
    const task = await tasks.findForUser(id, user.id);
    if (!task) throw new AppError(`Task ${id} not found`, 404, 'TASK_NOT_FOUND');
    return task;
  }

  return {
    list: (user, filter = 'all') => tasks.listForUser(user.id, filter),

    get: (user, id) => requireOwn(user, id),

    create: (user, input) => tasks.create(user.id, { title: input.title, notes: input.notes ?? null, dueDate: input.dueDate ?? null }),

    /** Edit fields and/or tick a task done; completedAt follows completed (a CHECK constraint enforces the same rule). */
    async update(user, id, changes) {
      const fields = EDITABLE.filter((key) => changes[key] !== undefined);
      if (fields.length === 0) throw new AppError('Nothing to update: send title, notes, dueDate or completed', 400, 'EMPTY_UPDATE');
      const task = await requireOwn(user, id);
      const data = Object.fromEntries(fields.map((key) => [key, changes[key]]));
      if (changes.completed !== undefined && changes.completed !== task.completed) data.completedAt = changes.completed ? clock() : null;
      return tasks.update(id, data);
    },

    async remove(user, id) {
      await requireOwn(user, id);
      await tasks.remove(id);
    },
  };
}
