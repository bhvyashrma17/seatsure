#!/usr/bin/env node
// Live demo of the "can't overbook" guarantee ([BACKEND M3.4-3.6], [DATABASE M1.14]).
// 1. An organiser creates and publishes a fresh event with a small capacity.
// 2. N different students hit "Register" at the same instant (all requests fired in parallel).
// 3. We count the outcomes and ask the API for the event's final numbers.
//
// Usage (API must be running):  npm run demo:concurrency -- --seats 10 --students 50
const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => (arg.startsWith('--') ? [...pairs, [arg.slice(2), all[i + 1]]] : pairs), []),
);
const API = args.api ?? process.env.API_URL ?? 'http://localhost:4000/api/v1';
const SEATS = Number(args.seats ?? 10);
const STUDENTS = Number(args.students ?? 50);
const ORGANISER_ID = Number(args.organiser ?? 1); // Aarav Mehta, Coding Club lead in the seed data

async function call(method, path, { userId, body } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(userId ? { 'X-User-Id': String(userId) } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const health = await call('GET', '/health').catch(() => fail(`API not reachable at ${API}. Start it with "npm run dev".`));
if (health.status !== 200) fail('API is not healthy');

// Students to use: everyone with role STUDENT from the demo-identity endpoint.
const users = (await call('GET', '/users')).json.data;
const students = users.filter((u) => u.role === 'STUDENT').slice(0, STUDENTS);
if (students.length < STUDENTS) fail(`Only ${students.length} students available`);

const me = (await call('GET', '/me', { userId: ORGANISER_ID })).json.data;
const clubId = me?.clubs?.[0]?.id ?? fail('Organiser has no club');
const venues = (await call('GET', '/venues')).json.data;
const venue = venues.find((v) => v.capacity >= SEATS) ?? venues[0];

const starts = new Date(Date.now() + 3 * 24 * 3_600_000);
const created = await call('POST', '/events', {
  userId: ORGANISER_ID,
  body: {
    clubId,
    venueId: venue.id,
    title: `Flash Workshop (${SEATS} seats) #${Date.now() % 10_000}`,
    description: 'Concurrency demo event created by scripts/concurrency-demo.mjs.',
    category: 'WORKSHOP',
    startsAt: starts.toISOString(),
    endsAt: new Date(starts.getTime() + 2 * 3_600_000).toISOString(),
    capacity: SEATS,
    questions: [],
  },
});
if (created.status !== 201) fail(`Could not create event: ${JSON.stringify(created.json)}`);
const eventId = created.json.data.id;
const published = await call('PATCH', `/events/${eventId}`, { userId: ORGANISER_ID, body: { status: 'PUBLISHED' } });
if (published.status !== 200) fail(`Could not publish: ${JSON.stringify(published.json)}`);

console.log(`\nEvent #${eventId}: ${SEATS} seats. Firing ${students.length} registrations at the same moment...\n`);
const t0 = performance.now();
const results = await Promise.all(students.map((s) => call('POST', `/events/${eventId}/registrations`, { userId: s.id, body: { answers: {} } })));
const elapsed = Math.round(performance.now() - t0);

const tally = { CONFIRMED: 0, WAITLISTED: 0, ERROR: 0 };
for (const r of results) {
  if (r.status === 201) tally[r.json.data.outcome]++;
  else tally.ERROR++;
}
const positions = results.filter((r) => r.json?.data?.position).map((r) => r.json.data.position).sort((a, b) => a - b);

const detail = (await call('GET', `/events/${eventId}`)).json.data;
const finalHealth = (await call('GET', '/health')).json.data;

console.table({
  requests: students.length,
  'HTTP 201': results.filter((r) => r.status === 201).length,
  confirmed: tally.CONFIRMED,
  waitlisted: tally.WAITLISTED,
  errors: tally.ERROR,
  'wall time (ms)': elapsed,
});
console.log(`Waitlist positions handed out: ${positions[0]}..${positions.at(-1)} (${new Set(positions).size} unique)`);
console.log(`Database says: confirmedCount=${detail.confirmedCount}/${detail.capacity}, waitlist=${detail.waitlistCount}`);
console.log(`Seat counter mismatches across all events: ${finalHealth.seatCounterMismatches}`);

const ok = tally.CONFIRMED === SEATS && detail.confirmedCount === SEATS && tally.ERROR === 0 && finalHealth.seatCounterMismatches === 0;
console.log(ok ? `\n✓ No overbooking: exactly ${SEATS} confirmed, everyone else waitlisted in order.\n` : '\n✗ Unexpected result\n');
process.exit(ok ? 0 : 1);
