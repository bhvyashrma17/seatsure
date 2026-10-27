// CRUD over REST for personal tasks, end to end over HTTP and PostgreSQL
// ([BACKEND M1.5, M1.13-1.15: REST + status codes], [BACKEND M2.5-2.6: validation], [BACKEND M3.3: trust boundary]).
import { prisma } from '@seatsure/db';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { as, resetDb, seedScenario, startStack } from '../helpers/stack.js';

let stack;
let s;
let api;

beforeAll(async () => {
  stack = await startStack();
  api = request(stack.app);
});
afterAll(() => stack.stop());
beforeEach(async () => {
  await resetDb();
  s = await seedScenario();
});

describe('tasks', () => {
  it('BE-I27 creates a task: 201, Location header, stored as open', async () => {
    const res = await as(api, s.students[0]).post('/api/v1/tasks').send({ title: 'Buy notebook' });
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/v1/tasks/${res.body.data.id}`);
    expect(res.body.data).toMatchObject({ title: 'Buy notebook', completed: false, completedAt: null });
    expect(await prisma.task.count()).toBe(1);
  });

  it('BE-I28 rejects an empty title with 400 and a field error; nothing is stored', async () => {
    const res = await as(api, s.students[0]).post('/api/v1/tasks').send({ title: '' });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', errors: [{ field: 'title', message: 'Title is required' }] });
    expect(await prisma.task.count()).toBe(0);
  });

  it("BE-I29 lists only the caller's tasks, open ones first, with counts", async () => {
    const me = as(api, s.students[0]);
    await me.post('/api/v1/tasks').send({ title: 'Open task' });
    const done = await me.post('/api/v1/tasks').send({ title: 'Done task' });
    await me.patch(`/api/v1/tasks/${done.body.data.id}`).send({ completed: true });
    await as(api, s.students[1]).post('/api/v1/tasks').send({ title: "Someone else's task" });

    const res = await me.get('/api/v1/tasks');
    expect(res.status).toBe(200);
    expect(res.body.data.map((t) => t.title)).toEqual(['Open task', 'Done task']);
    expect(res.body.meta).toMatchObject({ total: 2, open: 1, done: 1 });
  });

  it('BE-I30 updates a task: edits the title, ticks it done (completedAt set) and reopens it', async () => {
    const me = as(api, s.students[0]);
    const { body } = await me.post('/api/v1/tasks').send({ title: 'Draft title', dueDate: '2026-11-03' });
    expect(body.data.dueDate).toBe('2026-11-03T00:00:00.000Z');

    const edited = await me.patch(`/api/v1/tasks/${body.data.id}`).send({ title: 'Final title', completed: true });
    expect(edited.status).toBe(200);
    expect(edited.body.data.title).toBe('Final title');
    expect(edited.body.data.completedAt).not.toBeNull();

    const reopened = await me.patch(`/api/v1/tasks/${body.data.id}`).send({ completed: false });
    expect(reopened.body.data).toMatchObject({ completed: false, completedAt: null });
  });

  it('BE-I31 deletes a task (204); deleting it again, or a missing id, is 404 TASK_NOT_FOUND', async () => {
    const me = as(api, s.students[0]);
    const { body } = await me.post('/api/v1/tasks').send({ title: 'Temporary' });
    expect((await me.delete(`/api/v1/tasks/${body.data.id}`)).status).toBe(204);

    const again = await me.delete(`/api/v1/tasks/${body.data.id}`);
    expect(again.status).toBe(404);
    expect(again.body.code).toBe('TASK_NOT_FOUND');
    expect((await me.delete('/api/v1/tasks/99')).status).toBe(404);
  });

  it("BE-I32 another user's task is invisible (404) and a smuggled userId is ignored", async () => {
    const { body } = await as(api, s.students[0]).post('/api/v1/tasks').send({ title: 'Private', userId: s.students[1].id });
    const stored = await prisma.task.findUniqueOrThrow({ where: { id: body.data.id } });
    expect(stored.userId).toBe(s.students[0].id);

    const intruder = as(api, s.students[1]);
    expect((await intruder.get(`/api/v1/tasks/${body.data.id}`)).status).toBe(404);
    expect((await intruder.patch(`/api/v1/tasks/${body.data.id}`).send({ completed: true })).status).toBe(404);
    expect((await intruder.delete(`/api/v1/tasks/${body.data.id}`)).status).toBe(404);
  });

  it('BE-I33 rejects an empty update (400), an invalid date (400) and a request without a user (401)', async () => {
    const me = as(api, s.students[0]);
    const { body } = await me.post('/api/v1/tasks').send({ title: 'Task' });

    const empty = await me.patch(`/api/v1/tasks/${body.data.id}`).send({});
    expect(empty.status).toBe(400);
    expect(empty.body.code).toBe('EMPTY_UPDATE');

    const badDate = await me.post('/api/v1/tasks').send({ title: 'X', dueDate: 'next friday' });
    expect(badDate.status).toBe(400);
    expect(badDate.body.errors.map((e) => e.field)).toEqual(['dueDate']);

    expect((await api.get('/api/v1/tasks')).status).toBe(401);
  });
});
