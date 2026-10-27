#!/usr/bin/env node
// [BACKEND M1.5 + M1.13-1.15: CRUD over REST, checked live] Sends real HTTP requests to the running API
// and records the expected and actual result of each CRUD operation and of the main error cases
// (invalid input, missing id, duplicate, missing user, unknown route).
// Writes docs/test-results/api-checks.txt and api-checks.json.
// Usage (API must be running):  npm run test:api
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';

async function call(method, path, { user, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(user ? { 'X-User-Id': String(user) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json, location: res.headers.get('location') };
}

const rows = [];
function check(id, operation, request, expected, res, actual, pass) {
  rows.push({ id, operation, request, expected, actual: `${res.status} ${actual}`.trim(), result: pass ? 'Pass' : 'Fail' });
}
const fields = (res) => (res.json?.errors ?? []).map((e) => e.field).join(', ');

// Demo identities and reference data from the seed.
const users = (await call('GET', '/users')).json.data;
const clubs = (await call('GET', '/clubs')).json.data;
const venues = (await call('GET', '/venues')).json.data;
const organiser = users.find((u) => u.name === 'Aarav Mehta');
const student = users.find((u) => u.name === 'Priya Singh') ?? users.find((u) => u.role === 'STUDENT');
const club = clubs.find((c) => c.name === 'Coding Club');
const venue = venues.find((v) => v.name === 'Computer Lab 3');

const start = new Date(Date.now() + 10 * 86_400_000);
start.setUTCHours(9, 0, 0, 0);
const eventBody = (title) => ({
  clubId: club.id,
  venueId: venue.id,
  title,
  description: 'Created by the API check script to exercise create, update and delete.',
  category: 'WORKSHOP',
  startsAt: start.toISOString(),
  endsAt: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
  capacity: 30,
  questions: [],
});

// Read: list
let res = await call('GET', '/events?limit=3');
check('API-01', 'Read (list)', 'GET /events?limit=3', '200, 3 events + nextCursor', res, `${res.json?.data?.length} events, nextCursor ${res.json?.meta?.nextCursor}`, res.status === 200 && res.json.data.length === 3 && res.json.meta.nextCursor !== null);

// Create
res = await call('POST', '/events', { user: organiser.id, body: eventBody('API check: Git workshop') });
const draftId = res.json?.data?.id;
check('API-02', 'Create', 'POST /events {title:"API check: Git workshop", …}', '201 + Location, status DRAFT', res, `${res.json?.data?.status}, Location ${res.location}`, res.status === 201 && res.json.data.status === 'DRAFT' && res.location === `/api/v1/events/${draftId}`);

// Invalid input
res = await call('POST', '/events', { user: organiser.id, body: { ...eventBody(''), capacity: 0 } });
check('API-03', 'Invalid input', 'POST /events {title:"", capacity:0, …}', '400 VALIDATION_ERROR for title and capacity', res, `${res.json?.code} (${fields(res)})`, res.status === 400 && res.json.code === 'VALIDATION_ERROR' && fields(res).includes('title') && fields(res).includes('capacity'));

// Read: one
res = await call('GET', `/events/${draftId}`, { user: organiser.id });
check('API-04', 'Read (one)', `GET /events/${draftId}`, '200, the new draft', res, `"${res.json?.data?.title}" (${res.json?.data?.status})`, res.status === 200 && res.json.data.id === draftId);

// Update
res = await call('PATCH', `/events/${draftId}`, { user: organiser.id, body: { title: 'API check: Git workshop (updated)' } });
check('API-05', 'Update', `PATCH /events/${draftId} {title:"… (updated)"}`, '200, new title', res, `"${res.json?.data?.title}"`, res.status === 200 && res.json.data.title.endsWith('(updated)'));

// Delete
res = await call('DELETE', `/events/${draftId}`, { user: organiser.id });
check('API-06', 'Delete', `DELETE /events/${draftId}`, '204 No Content', res, 'No Content', res.status === 204);

// Missing id
res = await call('DELETE', `/events/${draftId}`, { user: organiser.id });
check('API-07', 'Missing ID', `DELETE /events/${draftId} (again)`, '404 not found', res, `${res.json?.code}`, res.status === 404);

// Registrations on a published event
const published = (await call('POST', '/events', { user: organiser.id, body: eventBody('API check: registration test') })).json.data;
res = await call('PATCH', `/events/${published.id}`, { user: organiser.id, body: { status: 'PUBLISHED' } });
check('API-08', 'Update (workflow)', `PATCH /events/${published.id} {status:"PUBLISHED"}`, '200, PUBLISHED', res, `${res.json?.data?.status}`, res.status === 200 && res.json.data.status === 'PUBLISHED');

res = await call('POST', `/events/${published.id}/registrations`, { user: student.id, body: { answers: {} } });
const registrationId = res.json?.data?.registration?.id;
check('API-09', 'Create (registration)', `POST /events/${published.id}/registrations {answers:{}}`, '201, CONFIRMED', res, `${res.json?.data?.outcome}`, res.status === 201 && res.json.data.outcome === 'CONFIRMED');

res = await call('POST', `/events/${published.id}/registrations`, { user: student.id, body: { answers: {} } });
check('API-10', 'Duplicate', 'Same request again', '409 ALREADY_REGISTERED', res, `${res.json?.code}`, res.status === 409 && res.json.code === 'ALREADY_REGISTERED');

res = await call('POST', `/events/${published.id}/registrations`, { body: { answers: {} } });
check('API-11', 'Missing user', 'Same request without X-User-Id', '401', res, `${res.json?.code}`, res.status === 401);

res = await call('DELETE', `/registrations/${registrationId}`, { user: student.id });
check('API-12', 'Delete (cancel)', `DELETE /registrations/${registrationId}`, '200, cancelled', res, `previous status ${res.json?.data?.cancelled?.previousStatus}`, res.status === 200);

res = await call('DELETE', '/registrations/99999', { user: student.id });
check('API-13', 'Missing ID', 'DELETE /registrations/99999', '404 not found', res, `${res.json?.code}`, res.status === 404);

res = await call('GET', '/does-not-exist');
check('API-14', 'Unknown route', 'GET /does-not-exist', '404 ROUTE_NOT_FOUND', res, `${res.json?.code}`, res.status === 404 && res.json.code === 'ROUTE_NOT_FOUND');

// Clean up: cancel the published test event so it leaves the catalogue.
await call('PATCH', `/events/${published.id}`, { user: organiser.id, body: { status: 'CANCELLED' } });

const passed = rows.filter((r) => r.result === 'Pass').length;
const lines = [
  `SeatSure live API checks - ${new Date().toISOString()}`,
  `API: ${API} (paths below are relative to it). Organiser: ${organiser.name}; student: ${student.name}.`,
  '',
  ...rows.map((r) => `${r.id} | ${r.operation.padEnd(21)} | ${r.request} | expected ${r.expected} | actual ${r.actual} | ${r.result}`),
  '',
  `${passed} / ${rows.length} as expected`,
];
console.log(lines.join('\n'));
const out = fileURLToPath(new URL('../docs/test-results/', import.meta.url));
mkdirSync(out, { recursive: true });
writeFileSync(`${out}api-checks.txt`, lines.join('\n') + '\n');
writeFileSync(`${out}api-checks.json`, JSON.stringify({ api: API, ranAt: new Date().toISOString(), rows }, null, 2) + '\n');
if (passed !== rows.length) process.exit(1);
