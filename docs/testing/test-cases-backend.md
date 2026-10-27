# Test cases: Back-End Web Development

**Run:** 27 Oct 2026, `npm run test:backend`.
**Result: 71 / 71 passed.** Raw output: [`../test-results/backend-tests.txt`](../test-results/backend-tests.txt).

The tests come in two kinds:
- **Unit tests (`BE-U`)** build the services with in-memory fake repositories. No database is needed, which shows the repository pattern at work.
- **Integration tests (`BE-I`)** send real HTTP requests through Supertest to the full Express app, backed by PostgreSQL and an in-memory MongoDB.

Module numbers refer to the Backend livebook (M1 foundations, M2 architecture, M3 engineering principles).

## Domain rules and workflows (unit)

| ID | Concept | Scenario | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|---|
| BE-U01 | M3.2 workflow (state machine) | Event status transitions | DRAFT→PUBLISHED, PUBLISHED→CANCELLED, DRAFT→CANCELLED, CANCELLED→PUBLISHED | First two allowed, last two `409 INVALID_STATUS_TRANSITION` | As expected | Pass |
| BE-U02 | M3.2 domain rules | Registering for a draft or a closed event | status DRAFT; closes-at in the past | `409 REGISTRATION_NOT_OPEN` / `409 REGISTRATION_CLOSED` | As expected | Pass |
| BE-U03 | M3.2 domain rules | Check-in window | Before, during, after the window | NOT_OPEN / ok / CLOSED | As expected | Pass |
| BE-U04 | M3.2 seat decision | Seat or waitlist | 1/2 and 2/2 confirmed | true / false | As expected | Pass |
| BE-U05 | M3.2 capacity rules | Shrinking below confirmed; exceeding the venue | 30 confirmed → 20; 150 > venue 100 | 409 CAPACITY_BELOW_CONFIRMED; 422 CAPACITY_EXCEEDS_VENUE | As expected | Pass |
| BE-U06 | M2.6 sanitisation | Answers are cleaned | `" Byte Busters "`, `"true"` | trimmed, boolean `true` | As expected | Pass |
| BE-U07 | M2.5 validation (all errors at once) | Several bad answers | Unknown key, wrong option, missing required | 422 with 3 field paths | `answers.hacker`, `answers.laptop`, `answers.tshirt` | Pass |
| BE-U08 | M3.2 rules | Organiser's question list | Duplicate ids; choice with 1 option | 422 INVALID_QUESTIONS | As expected | Pass |

## Services with fake repositories (unit)

| ID | Concept | Scenario | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|---|
| BE-U09 | M3.2 workflow, M2.10 service | 4 students, 2 seats | Sequential registrations | CONFIRMED, CONFIRMED, WAITLISTED #1, #2 | As expected; counter = 2 | Pass |
| BE-U10 | M3.12 events via outbox | Outbox message per registration | 2 registrations | `registration.confirmed`, `registration.waitlisted` (position 1); delivery requested twice | As expected | Pass |
| BE-U11 | M3.2 rule | Same student twice | 2 registrations | 409 ALREADY_REGISTERED | As expected | Pass |
| BE-U12 | M3.2 + M2.5 | Answers checked against the event's own questions | Missing required select | 422 INVALID_ANSWERS, then success with a valid answer | As expected | Pass |
| BE-U13 | M3.11 retry | Transaction loses a write conflict once | Fake transaction throws `WRITE_CONFLICT` first | Retried, then succeeds (2 calls) | 2 calls, CONFIRMED | Pass |
| BE-U14 | M3.11 retry only when transient | Business-rule failure | DRAFT event | Not retried (1 call) | 1 call | Pass |
| BE-U15 | M3.2 workflow + M3.6 transaction | Cancel a confirmed seat | 1 seat, 2 waitlisted | Oldest waitlisted promoted; counter unchanged; cancelled + promoted messages | As expected | Pass |
| BE-U16 | M3.2 | Cancel with nobody waiting | 2 seats, 1 registered | Seat freed (counter 0), `promoted: null` | As expected | Pass |
| BE-U17 | M3.3 trust boundaries | Who may cancel | Stranger / club organiser / owner again | 403 / ok / 409 ALREADY_CANCELLED | As expected | Pass |
| BE-U18 | M3.2 | Cancel after the start | `startsAt` in the past | 409 EVENT_STARTED | As expected | Pass |
| BE-U19 | M3.2 idempotency | Check-in twice; check-in by a student | Organiser ×2, student ×1 | 403; `alreadyCheckedIn` false then true | As expected | Pass |
| BE-U20 | M3.3 authorisation | Create an event | Student; organiser of another club; own club | 403, 403, 201-equivalent DRAFT | As expected | Pass |
| BE-U21 | M3.2 | Capacity above the venue | 80 > 50 | 422 with `capacity` field error | As expected | Pass |
| BE-U22 | M3.2 + M3.6 | Raise capacity with a waitlist | 1 → 3 seats, 3 waitlisted | 2 promoted, counter 3, capacity_changed + 2 promoted messages | As expected | Pass |
| BE-U23 | M3.2 workflow | Publish, publish again, delete published | Same event | publishedAt set; second publish is a no-op; delete 409 NOT_A_DRAFT | As expected | Pass |

## Middleware, errors and reliability (unit)

| ID | Concept | Scenario | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|---|
| BE-U24 | M2.4 request-id + timing middleware | Any request | `GET /ping` | `X-Request-Id` (UUID) matches `req.id`; `X-Response-Time` ends in "ms" | As expected | Pass |
| BE-U25 | M3.3 trust boundary | Incoming request id | `trace-12345678` vs `<script>` | Reused vs replaced | As expected | Pass |
| BE-U26 | M2.5 validation, M2.6 mass assignment | Bad body; extra field | `{title:'x', qty:'many'}`; `{…, isAdmin:true}` | 400 listing `title`, `qty`; handler sees only declared fields | As expected | Pass |
| BE-U27 | M2.7 AppError → envelope | Thrown AppError 404 | `EVENT_NOT_FOUND` | `{status:'fail', code, message, requestId}` | Exact body | Pass |
| BE-U28 | M2.7 + DB error mapping | DbError kinds | UNIQUE / NOT_FOUND / UNAVAILABLE | 409 ALREADY_REGISTERED / 404 / 503 | As expected | Pass |
| BE-U29 | M2.7 programmer errors, M1.15 no leaks | `TypeError` thrown | — | 500 generic message, no stack or type names | As expected | Pass |
| BE-U30 | M2.6 payload limit, M1.9 catch-all | Malformed JSON; 5 KB body on a 1 KB limit; unknown route | — | 400 MALFORMED_JSON; 413; 404 ROUTE_NOT_FOUND | As expected | Pass |
| BE-U31 | M3.11 retry with backoff | Fails twice, then succeeds | — | 3 attempts; delays grow | As expected | Pass |
| BE-U32 | M3.11 retry budget | Always fails; permanent error | retries 2; shouldRetry false | 3 calls then throw; 1 call | As expected | Pass |
| BE-U33 | M3.11 timeout, backoff cap | 200 ms task with a 20 ms timeout; backoff(1,2,3,10) | — | TimeoutError; 2 s, 4 s, 8 s, 60 s | As expected | Pass |
| BE-U34 | M3.12 EventEmitter bus | 2 subscribers; failing subscriber | — | Both called, returns 2; rejects "1 of 1 subscribers failed" | As expected | Pass |
| BE-U35 | M3.12 + outbox | Two due messages | — | Delivered in order, both marked published, `outboxId` attached | As expected | Pass |
| BE-U36 | M3.11 backoff | Subscriber failing (MongoDB down) | attempts = 2 | Rescheduled 8 s later; round stops | +8000 ms | Pass |
| BE-U37 | M3.11 timeout | Subscriber never settles | 30 ms timeout | Marked failed: "timed out" | As expected | Pass |
| BE-U38 | M2.2 streams (CSV rows) | Commas, quotes, formula injection | `a,b`, `say "hi"`, `=HYPERLINK(…)` | RFC 4180 quoting; formula prefixed with `'` | As expected | Pass |

## HTTP integration (Supertest → Express → PostgreSQL + MongoDB)

| ID | Concept | Scenario | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|---|
| BE-I01 | M1.6 contract, M3.11 health | Health check | `GET /api/v1/health` | 200; postgres up, mongo up, 0 counter mismatches | As expected | Pass |
| BE-I02 | M1.15 envelope, M2.4 request id | Unknown route | `GET /api/v1/does-not-exist` | 404 `ROUTE_NOT_FOUND` with the same request id as the header | As expected | Pass |
| BE-I03 | M3.10 API versioning | Legacy unversioned path | `GET /api/events` | 200 + `Deprecation: true` + `Link` to `/api/v1/events` | As expected | Pass |
| BE-I04 | M3.9 cursor pagination, M3.8 metadata | Catalogue page 1 and 2 | `limit=2`, then `cursor=…` | 2 + 2 events in date order; `hasMore` true then false | As expected | Pass |
| BE-I05 | M1.11 query params, M2.5 validation | Filter; invalid params | `category=TALK`; `limit=500&category=PARTY` | 1 talk; 400 listing `category`, `limit` | As expected | Pass |
| BE-I06 | M3.3 authorisation | Draft visibility | Student vs club organiser | 404 vs 200 `canManage: true` | As expected | Pass |
| BE-I07 | M1.5 REST, M1.15 status codes | Create an event | Student; organiser | 403; 201 + `Location: /api/v1/events/:id`, DRAFT | As expected | Pass |
| BE-I08 | M2.5 validation, M2.6 mass assignment | Invalid body; smuggled fields | `title:'Hi', capacity:0`; `status, confirmedCount:999, createdById` | 400 listing 3 fields; 201 DRAFT, count 0, creator = caller | As expected | Pass |
| BE-I09 | M3.2 rule over HTTP | Capacity above the venue | 100 > 40 | 422 with `capacity` field error | As expected | Pass |
| BE-I10 | M3.2 workflow | Publish; invalid target; delete published | `PATCH {status}`; `DELETE` | 200 PUBLISHED; 400; 409 NOT_A_DRAFT | As expected | Pass |
| BE-I11 | M3.3 authorisation | Another club's organiser edits | `PATCH title` | 403 NOT_CLUB_ORGANISER | As expected | Pass |
| BE-I12 | M2.4 auth placeholder, M3.3 trust boundary | Missing, malformed, unknown user header | none / `abc` / `99999` | 401 / 400 / 401 UNKNOWN_USER | As expected | Pass |
| BE-I13 | M3.2 workflow, M2.6 | 5 students, 3 seats; client sends `status: CONFIRMED` | `POST …/registrations` ×5 | C, C, C, W#1, W#2 (injected status ignored) | As expected | Pass |
| BE-I14 | M3.2 + M2.5 | Duplicate; bad answers | Same student; `{tshirt:'XXXL', extra}` | 409 ALREADY_REGISTERED; 422 listing `answers.extra`, `answers.tshirt` | As expected | Pass |
| BE-I15 | M3.2 + M3.6 | Cancel a confirmed seat with a waitlist | `DELETE /registrations/:id` | 200, first waitlisted promoted; #2 becomes #1; second cancel 409 | As expected | Pass |
| BE-I16 | M3.2 idempotency | Check-in today vs in 3 days | `PATCH {checkedIn:true}` | First ok, second `alreadyCheckedIn`, early 409 CHECK_IN_NOT_OPEN | As expected | Pass |
| BE-I17 | M3.9 offset pagination + JSONB filter | Attendees with `answers[tshirt]=M`, page size 2 | Organiser; student | 200, total 3, 2 pages, `checkInOpen:false`; student 403 | As expected | Pass |
| BE-I18 | M2.2 streams | CSV export | `GET …/registrations/export` | `text/csv`, header row + 4 rows | As expected | Pass |
| BE-I19 | M3.3 + analytics | Analytics as student / organiser | `GET /analytics/overview` | 403 / 200 with rank 1 = "Git Bootcamp", 21 daily rows | As expected | Pass |
| BE-I20 | M3.3 single source of truth | Counter after mixed register/cancel | 6 registrations, 2 cancels | `confirmed_count` = real CONFIRMED rows = 3 | As expected | Pass |
| BE-I21 | M3.4/M3.5 race condition, M3.6 transaction | **50 simultaneous registrations, 3 seats** | `Promise.all` of 50 POSTs | All 201; exactly 3 confirmed; positions 1…47 unique; counter 3 | As expected | Pass |
| BE-I22 | M3.5 duplicate processing | One student double-clicks 10× | 10 parallel POSTs, same user | Exactly one 201, nine 409 ALREADY_REGISTERED, 1 row | As expected | Pass |
| BE-I23 | M3.5 lost update | 3 simultaneous cancellations | 3 parallel DELETEs | 3 different students promoted (the 3 oldest), counter 3 | As expected | Pass |
| BE-I24 | M3.12 event-driven + outbox | Registration reaches MongoDB | Register, drain outbox | Notification `REGISTRATION_CONFIRMED` + feed item `REGISTERED`; 0 pending | As expected | Pass |
| BE-I25 | M3.11 graceful degradation | MongoDB outage, then recovery | Disconnect, register, read, reconnect, drain | Register 201; reads `degraded:true`; health mongo down; outbox keeps messages; delivered after recovery | As expected (this test found the outbox-id bug, DECISIONS.md D-11) | Pass |
| BE-I26 | M3.12 | Promotion notification | Cancel a confirmed seat | Promoted student gets `PROMOTED_FROM_WAITLIST` | As expected | Pass |

## Tasks: CRUD over REST (integration, `tests/integration/tasks.test.js`)

| ID | Concept | Scenario | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|---|
| BE-I27 | M1.13 create, M1.15 status codes | Create a task | `POST /api/v1/tasks {title:"Buy notebook"}` | 201 + `Location: /api/v1/tasks/:id`, stored open | As expected | Pass |
| BE-I28 | M2.5 validation | Empty title | `POST /api/v1/tasks {title:""}` | 400 `VALIDATION_ERROR`, field `title` ("Title is required"); nothing stored | As expected | Pass |
| BE-I29 | M1.13 read, M3.3 trust boundary | List my tasks | 2 own tasks (1 done) + 1 of another user | 200, only my 2 tasks, open first; `meta {total 2, open 1, done 1}` | As expected | Pass |
| BE-I30 | M1.14 update | Edit and tick done, then reopen | `PATCH {title, completed:true}`, then `{completed:false}` | 200; `completedAt` set, then cleared | As expected | Pass |
| BE-I31 | M1.14 delete, M1.15 | Delete twice; missing id | `DELETE /api/v1/tasks/:id` ×2; `DELETE /api/v1/tasks/99` | 204, then 404 `TASK_NOT_FOUND`; 404 | As expected | Pass |
| BE-I32 | M3.3 trust boundary, M2.6 mass assignment | Another user's task; smuggled `userId` | GET/PATCH/DELETE as another student | 404 for all three; stored owner = caller | As expected | Pass |
| BE-I33 | M2.5 validation, M2.4 auth placeholder | Empty update; bad date; no user | `PATCH {}`; `dueDate:"next friday"`; no `X-User-Id` | 400 `EMPTY_UPDATE`; 400 field `dueDate`; 401 | As expected | Pass |

## Live system demo (not counted in the 71)

`npm run demo:concurrency -- --seats 10 --students 50` against the running API (output: [`../test-results/concurrency-demo.txt`](../test-results/concurrency-demo.txt)):

| Requests | HTTP 201 | Confirmed | Waitlisted | Errors | Waitlist positions | Counter mismatches | Wall time |
|---|---|---|---|---|---|---|---|
| 50 | 50 | **10** | **40** | 0 | 1..40, all unique | 0 | 414 ms |
