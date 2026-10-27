// Task data access for the personal to-do list ([DATABASE M2.8: Prisma Client CRUD], repository
// pattern [BACKEND M2.11]). Every read is scoped to one user, so a task never leaks to another user.
import type { Prisma } from '../../generated/prisma/client';
import { prisma } from '../client';
import type { Tx } from '../transaction';

export type TaskFilter = 'all' | 'open' | 'done';

const taskSelect = {
  id: true,
  title: true,
  notes: true,
  dueDate: true,
  completed: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TaskSelect;

/** One user's tasks: open ones first, then by due date (no date last), then oldest first. */
export async function listForUser(userId: number, filter: TaskFilter = 'all', client: Tx = prisma) {
  const where: Prisma.TaskWhereInput = { userId, ...(filter === 'open' ? { completed: false } : filter === 'done' ? { completed: true } : {}) };
  const [items, open, done] = await Promise.all([
    client.task.findMany({
      where,
      select: taskSelect,
      orderBy: [{ completed: 'asc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }, { id: 'asc' }],
    }),
    client.task.count({ where: { userId, completed: false } }),
    client.task.count({ where: { userId, completed: true } }),
  ]);
  return { items, open, done };
}

/** The task with this id if it belongs to this user; another user's task looks exactly like a missing one. */
export async function findForUser(id: number, userId: number, client: Tx = prisma) {
  return client.task.findFirst({ where: { id, userId }, select: taskSelect });
}

export async function create(userId: number, data: { title: string; notes?: string | null; dueDate?: Date | null }, client: Tx = prisma) {
  return client.task.create({ data: { userId, ...data }, select: taskSelect });
}

export async function update(id: number, data: Prisma.TaskUpdateInput, client: Tx = prisma) {
  return client.task.update({ where: { id }, data, select: taskSelect });
}

export async function remove(id: number, client: Tx = prisma) {
  await client.task.delete({ where: { id } });
}
