// [BACKEND M2.4-2.7] Middleware behaviour checked on a tiny Express app (no database).
import { DbError } from '@seatsure/db';
import express from 'express';
import { body } from 'express-validator';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { notFound } from '../../src/middleware/notFound.js';
import { requestId } from '../../src/middleware/requestId.js';
import { requestTimer } from '../../src/middleware/requestTimer.js';
import { validate } from '../../src/middleware/validate.js';
import { AppError } from '../../src/utils/AppError.js';
import { asyncHandler } from '../../src/utils/asyncHandler.js';

function appWith(route) {
  const app = express();
  app.use(requestId, requestTimer, express.json({ limit: '1kb' }));
  route(app);
  app.use(notFound, errorHandler);
  return app;
}

describe('pipeline middleware', () => {
  it('BE-U24 tags every response with X-Request-Id and X-Response-Time', async () => {
    const res = await request(appWith((app) => app.get('/ping', (req, res) => res.json({ id: req.id })))).get('/ping');
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.id).toBe(res.headers['x-request-id']);
    expect(res.headers['x-response-time']).toMatch(/ms$/);
  });

  it('BE-U25 reuses a well-formed incoming request id but replaces a suspicious one', async () => {
    const app = appWith((a) => a.get('/ping', (req, res) => res.json({})));
    expect((await request(app).get('/ping').set('X-Request-Id', 'trace-12345678')).headers['x-request-id']).toBe('trace-12345678');
    expect((await request(app).get('/ping').set('X-Request-Id', '<script>')).headers['x-request-id']).not.toBe('<script>');
  });

  it('BE-U26 validate() returns 400 listing every invalid field, and drops unknown fields', async () => {
    const app = appWith((a) =>
      a.post('/things', body('title').isLength({ min: 3 }).withMessage('too short'), body('qty').isInt().withMessage('not a number').toInt(), validate, (req, res) =>
        res.json(req.valid.body),
      ),
    );
    const bad = await request(app).post('/things').send({ title: 'x', qty: 'many' });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ status: 'fail', code: 'VALIDATION_ERROR' });
    expect(bad.body.errors.map((e) => e.field)).toEqual(['title', 'qty']);

    const good = await request(app).post('/things').send({ title: 'Lamp', qty: '2', isAdmin: true });
    expect(good.body).toEqual({ title: 'Lamp', qty: 2 }); // isAdmin never reaches the handler
  });
});

describe('central error handler', () => {
  const thrower = (err) => appWith((a) => a.get('/boom', asyncHandler(async () => { throw err; })));

  it('BE-U27 turns AppError into the standard envelope with its status', async () => {
    const res = await request(thrower(new AppError('Event 9 not found', 404, 'EVENT_NOT_FOUND'))).get('/boom');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ status: 'fail', code: 'EVENT_NOT_FOUND', message: 'Event 9 not found', requestId: res.headers['x-request-id'] });
  });

  it('BE-U28 maps database errors: unique -> 409, missing -> 404, busy -> 503', async () => {
    const unique = new DbError('UNIQUE_VIOLATION', 'dup', { constraint: 'registrations_one_active_per_user_key', prismaCode: 'P2002' });
    expect((await request(thrower(unique)).get('/boom')).body).toMatchObject({ code: 'ALREADY_REGISTERED' });
    expect((await request(thrower(new DbError('NOT_FOUND', 'x', { prismaCode: 'P2025' }))).get('/boom')).status).toBe(404);
    expect((await request(thrower(new DbError('UNAVAILABLE', 'x'))).get('/boom')).status).toBe(503);
  });

  it('BE-U29 hides programmer errors behind a generic 500 (no stack, no SQL)', async () => {
    const res = await request(thrower(new TypeError("Cannot read properties of undefined (reading 'id')"))).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Something went wrong. Please try again later.');
    expect(JSON.stringify(res.body)).not.toMatch(/undefined|stack|TypeError/);
  });

  it('BE-U30 handles malformed JSON (400), oversized bodies (413) and unknown routes (404)', async () => {
    const app = appWith((a) => a.post('/echo', (req, res) => res.json(req.body)));
    expect((await request(app).post('/echo').set('Content-Type', 'application/json').send('{bad')).body.code).toBe('MALFORMED_JSON');
    expect((await request(app).post('/echo').send({ blob: 'x'.repeat(5000) })).status).toBe(413);
    expect((await request(app).get('/nope')).body.code).toBe('ROUTE_NOT_FOUND');
  });
});
