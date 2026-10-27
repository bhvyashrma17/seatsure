# Test cases: Advanced Database Systems

- **Run:** 27 Oct 2026, `SAVE_RESULTS=1 npm run test:db`.
- **Result: 50 / 50 passed.** Raw output is in [`../test-results/database-tests.txt`](../test-results/database-tests.txt).
- **Environment:** PostgreSQL 18.4 (dedicated `seatsure_test` database, migrated with `prisma migrate deploy` before the run; tables are emptied before each test) and MongoDB 8.2 (npm-distributed in-memory server).
- **Module numbers** refer to the Advanced Database livebook (M1 PostgreSQL, M2 Prisma, M3 MongoDB).

## Integrity constraints, including the tasks table (`tests/constraints.test.ts`)

| ID | Concept | Scenario | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|---|
| DB-C01 | M1.6 CHECK constraint | Venue with no seats | `INSERT venues capacity = 0` | Rejected by `venues_capacity_positive_chk` | Rejected, SQLSTATE 23514, constraint named | Pass |
| DB-C02 | M1.6 CHECK constraint | Event ends before it starts | `ends_at = starts_at − 1 min` | Rejected by `events_time_order_chk` | Rejected (23514) | Pass |
| DB-C03 | M1.6 CHECK (core "no overbooking" rule) | Raw SQL bypassing the API | `UPDATE events SET confirmed_count = capacity + 1` | Rejected by `events_confirmed_within_capacity_chk` | Rejected | Pass |
| DB-C04 | M1.9 JSONB + CHECK | Questions stored as an object, not an array | `questions = {"not":"an array"}` | Rejected by `events_questions_is_array_chk` | Rejected | Pass |
| DB-C05 | M1.6 CHECK | CANCELLED row without `cancelled_at` | `status = CANCELLED, cancelled_at = NULL` | Rejected by `registrations_cancelled_at_chk` | Rejected | Pass |
| DB-C06 | M1.6 CHECK | Checking in a waitlisted student | `WAITLISTED` + `checked_in_at` | Rejected by `registrations_checkin_requires_confirmed_chk` | Rejected | Pass |
| DB-C07 | M1.10 partial UNIQUE index | Same student, two active registrations | 2 inserts for the same event and user | 2nd rejected: P2002 on `registrations_one_active_per_user_key` | Rejected with P2002 and that constraint | Pass |
| DB-C08 | M1.10 partial index | Register again after cancelling | CANCELLED row, then CONFIRMED row | Allowed (cancelled rows are outside the index) | 2 rows stored | Pass |
| DB-C09 | M1.6 FOREIGN KEY | Registration for an event that doesn't exist | `event_id = 99999` | Rejected (P2003) | Rejected (FOREIGN_KEY_VIOLATION) | Pass |
| DB-C10 | M1.6 UNIQUE | Duplicate email | Existing student's email | Rejected by `users_email_key` | Rejected | Pass |
| DB-C11 | M1.6 `ON DELETE RESTRICT` | Delete a club that still has events | `DELETE club` | Refused | Refused (FK) | Pass |
| DB-C12 | M1.6 `ON DELETE CASCADE` | Delete an event with registrations | `DELETE event` | Its registrations are removed | 0 registrations left | Pass |
| DB-C13 | M2.19 structured error handling | Pool could not supply a connection in time | `Error('timeout exceeded when trying to connect')` | Classified as `TIMEOUT` (API answers 503); unrelated errors are not database errors | As expected | Pass |
| DB-C14 | M1.6 CHECK constraint | Task with a blank title | `title = '   '` | Rejected by `tasks_title_not_blank_chk` | Rejected (23514) | Pass |
| DB-C15 | M1.6 CHECK constraint | Task marked done without a completion time | `completed = true, completed_at = NULL` | Rejected by `tasks_completed_at_chk` | Rejected (23514) | Pass |
| DB-C16 | M1.6 `ON DELETE CASCADE` | Delete a user who has tasks | 2 tasks, then `DELETE user` | The user's tasks are removed | 0 tasks left | Pass |

## Transactions, locking and isolation (`tests/transactions.test.ts`)

| ID | Concept | Scenario | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|---|
| DB-T01 | M2.15 `$transaction`, M1.14 atomicity | Error thrown after two writes | Insert registration, count +1, then `throw` | Nothing persists | 0 registrations, count still 0 | Pass |
| DB-T02 | M1.14 rollback | The database refuses a step mid-transaction | count +2 on a 1-seat event | CHECK violation, whole transaction rolled back | `CHECK_VIOLATION`, 0 rows | Pass |
| DB-T03 | M2.15 nested writes | Nested create with one invalid child | Club + 2 organiser links (1 bad FK) | Nothing created | 0 clubs created | Pass |
| DB-T04 | M1.14 race condition (reproduced) | No lock: read, 20 ms gap, write | 12 parallel transactions, 3 seats | More than 3 confirmed (shows the bug exists) | Oversold (> 3 confirmed) | Pass |
| DB-T05 | M1.14 `SELECT … FOR UPDATE` | Same load, same gap, with a row lock | 12 parallel transactions, 3 seats | Exactly 3 confirmed, 9 waitlisted, counter = 3 | `{confirmed: 3, waitlisted: 9, stored: 3}`, 0 mismatches | Pass |
| DB-T06 | M1.11 READ COMMITTED | Read twice while another session commits | capacity 10 → 25 | Second read sees 25 | `[10, 25]` (non-repeatable read) | Pass |
| DB-T07 | M1.11 MVCC + REPEATABLE READ | Snapshot read, then a conflicting write | Same | `[10, 10]`, then the UPDATE fails with 40001 | `[10, 10]`, SQLSTATE 40001, mapped as retryable | Pass |
| DB-T08 | M1.14 row lock waiting | Second `FOR UPDATE` while the first holds the lock | Lock held 300 ms | Second waits ≥ 250 ms | Waited ≥ 250 ms | Pass |

## Query correctness (`tests/queries.test.ts`)

| ID | Concept | Scenario | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|---|
| DB-Q01 | M2.11 cursor pagination | Walk the catalogue 3 events at a time | 7 upcoming + 1 draft + 1 past | E1…E7 once each, in order, 3 pages | E1…E7, 3 pages, no draft or past event | Pass |
| DB-Q02 | M2.11 filtering | Category, club, availability, title search | 3 events in 2 clubs | Correct subset for each filter | All 5 filter checks match | Pass |
| DB-Q03 | M2.11 sorting | "Most popular" sort with a tiebreak | counts 5 and 2 | B before A | `[B, A]` | Pass |
| DB-Q04 | M1.12 `ROW_NUMBER()` | Waitlist positions, then the first person leaves | 3 waitlisted, cancel #1 | 1,2,3, then 1,2 | 1,2,3 → 1,2 | Pass |
| DB-Q05 | M1.12 `RANK() … PARTITION BY`, M1.13 CTE | Fill-rate ranking across 2 clubs | Fill 100 %, 50 %, 75 % | Overall 1/3/2, in-club ranks, vs club average ±25 | Exact values match | Pass |
| DB-Q06 | M1.13 CTE + `generate_series` + `SUM() OVER` | Daily sign-ups with a running total | 3 sign-ups over 7 days | 7 rows, last cumulative = 3, never decreasing | As expected | Pass |
| DB-Q07 | M1.12 `DENSE_RANK`, `FILTER` | Club leaderboard with attendance | Past event, 1 of 2 checked in | `[Other Club 100 % #1]`, `[Test Club 50 %, attendance 50 % #2]` | Exact match | Pass |
| DB-Q08 | M2.10 N+1 problem | "My passes" with event/club/venue include | 2 vs 10 registrations | Same SQL count both times (≤ 4) | Constant query count | Pass |
| DB-Q09 | M1.9 JSONB `@>`, `COUNT(*) OVER ()` | Attendee filter `tshirt = M`, page size 2 | 5 registrations | total 3, page 1 has 2 rows, page 2 has 1 | As expected; combined filter total 3 | Pass |
| DB-Q10 | Integrity probe | Seat counter drifts from real rows | stored 0, actual 1 | Mismatch reported, then `[]` after fixing | As expected | Pass |
| DB-Q11 | Timestamps / session time zone | Prisma writes `2027-01-01T00:00Z` | Read back via SQL in UTC | `2027-01-01 00:00`, and `starts_at > now()` is true | Exact (regression test for a real bug, see DECISIONS.md D-12) | Pass |

## Index impact with EXPLAIN ANALYZE (`tests/indexes.test.ts`, 30 000 events / 100 000 registrations)

Each query runs twice on the same data. **Before:** inside a transaction that drops the index, then `ROLLBACK`. **After:** with the index present. The pass condition is the plan change plus a speed-up; exact timings vary slightly from run to run. The values below are from the recorded run, whose plans are in [`../test-results/explain-analyze-test.txt`](../test-results/explain-analyze-test.txt). To regenerate that file, run `SAVE_RESULTS=1 npm run test:db`.

| ID | Concept | Scenario | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|---|
| DB-I01 | M1.10 partial index, M1.15 EXPLAIN | Catalogue: next 12 published events | `WHERE status='PUBLISHED' AND starts_at >= now() ORDER BY starts_at, id LIMIT 13` | Seq Scan + Sort becomes Index Scan, faster | 1.663 ms → 0.007 ms (237.6×), `Index Scan using events_published_starts_at_idx` | Pass |
| DB-I02 | M1.10 composite index | Rare category (HACKATHON ≈ 2 %) | Same, plus `category = 'HACKATHON'` | The composite index is chosen and is faster | 0.023 → 0.005 ms (4.6×), `events_published_category_starts_at_idx` | Pass |
| DB-I03 | M1.9 GIN (`jsonb_path_ops`) | Who chose the Jain meal? | `answers @> '{"diet":"Jain"}'` over 100 k rows | Seq Scan becomes Bitmap Index Scan, faster | 6.645 → 0.060 ms (110.8×) | Pass |
| DB-I04 | M1.10 composite index | Attendee page in registration order | `event_id = 42 AND status = 'CONFIRMED' ORDER BY created_at LIMIT 20` | Index Scan with no separate Sort | 2.309 → 0.008 ms (288.6×) | Pass |
| DB-I05 | M1.10 partial indexes | The definitions are really partial | `pg_indexes` | All 3 index definitions contain a `WHERE` clause | 3 / 3 | Pass |

## MongoDB (`tests/mongo.test.ts`)

| ID | Concept | Scenario | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|---|
| DB-M01 | M3.4 Mongoose validators | Bad notification | `type: 'SPAM'`, empty title, `userId: 0` | ValidationError on `title`, `type`, `userId` | Exactly those 3 paths | Pass |
| DB-M02 | M3.4 middleware hook (`pre('validate')`) | Notification without an expiry | No `expiresAt` | Hook sets expiry 30 days ahead | 29.9 to 30 days | Pass |
| DB-M03 | M3.19 `$jsonSchema` | Write bypassing Mongoose (native driver) | `type: 'NOT_A_TYPE'` | MongoDB rejects it (code 121) | Code 121 DocumentValidationFailure | Pass |
| DB-M04 | M3.19 TTL index | Expired vs fresh notification | `expiresAt` in the past | Expired one deleted automatically, fresh one kept | Deleted in about 1 s (TTL monitor), fresh kept | Pass |
| DB-M05 | Idempotent delivery (unique `outboxId`) | Same outbox message delivered twice | Same `outboxId` | `inserted`, then `duplicate`, 1 document | As expected | Pass |
| DB-M06 | M3.7/M3.12 aggregation, M3.16 `$facet` | Dashboard summary | 8 activities (1 outside the window) | totals 7 / 2 events, per-action counts, top event | Exact match | Pass |
| DB-M07 | M3.7 `$match` first | Scope to one club | `clubIds: [7]` | 1 activity, 1 event | As expected | Pass |
| DB-M08 | M3.16 `$lookup` | Promotions joined to notifications | 2 promotions, 2 notices (1 read) | `{promotions: 2, notified: 2, unread: 1}` | Exact match | Pass |
| DB-M09 | M3.20 index design + `explain()` | Event feed query | 300 activities across 30 events | `IXSCAN` on `event.id_1_at_-1`, docs examined = docs returned | IXSCAN, 10 / 10 | Pass |
| DB-M10 | M3.8 embedding | Activity keeps its event snapshot | Old title in the snapshot | Feed reads the embedded snapshot, no join | Snapshot returned unchanged | Pass |

## Benchmark (system-level evidence, not counted in the 50)

`npm run bench:explain` uses a throw-away `seatsure_bench` database with **50 000 events and 200 000 registrations**. Output: [`../test-results/explain-analyze-benchmark.txt`](../test-results/explain-analyze-benchmark.txt).

| Query | Index | Before (dropped) | After (present) | Speed-up | Plan change |
|---|---|---|---|---|---|
| Catalogue page | `events_published_starts_at_idx` (partial) | 2.636 ms | 0.006 ms | 439× | Seq Scan + Sort → Index Scan |
| Rare category | `events_published_category_starts_at_idx` | 0.023 ms | 0.006 ms | 3.8× | starts_at index + filter → composite Index Scan |
| JSONB answers | `registrations_answers_gin_idx` (GIN) | 13.600 ms | 0.119 ms | 114× | Seq Scan → Bitmap Index Scan |
| Attendee page | `registrations_event_id_status_created_at_idx` | 4.285 ms | 0.009 ms | 476× | Parallel Seq Scan + Sort → Index Scan |

## Connection pool experiment (M2.12 / M2.13, `npm run experiment:pool -w @seatsure/db`)

40 queries start at once, and each holds a connection for 100 ms (`SELECT pg_sleep(0.1)`). Output: [`../test-results/pool-experiment.txt`](../test-results/pool-experiment.txt).

| Pool size | Wall time | Theory ≈ ⌈40/N⌉ × 100 ms |
|---|---|---|
| 1 | 4106 ms | 4000 ms |
| 5 | 829 ms | 800 ms |
| 10 | 423 ms | 400 ms |
| 20 | 235 ms | 200 ms |
| 40 | 153 ms | 100 ms |

**Failure mode:** with a pool of 2 connections, 20 queries that each hold a connection for 1 s, and a 5 s acquire timeout, 10 queries succeeded and 10 gave up quickly with `TIMEOUT`. They did not hang.

## Race-condition experiment (M1.14, `npm run experiment:race -w @seatsure/db`)

A 3-seat event, with N simultaneous registrations, each pausing 20 ms between its read and its write. Output: [`../test-results/race-experiment.txt`](../test-results/race-experiment.txt).

| Simultaneous requests | Confirmed, no lock | Confirmed, `FOR UPDATE` | Time, no lock | Time, `FOR UPDATE` |
|---|---|---|---|---|
| 2 | 2 | 2 | 42 ms | 54 ms |
| 5 | **5** (overbooked) | 3 | 33 ms | 119 ms |
| 10 | **10** (overbooked) | 3 | 42 ms | 246 ms |
| 20 | **10** (overbooked) | 3 | 69 ms | 489 ms |
| 40 | **10** (overbooked) | 3 | 124 ms | 964 ms |

**Reading the results:**
- **The overbooking stops at 10 because of the connection pool.** Without the lock, the overbooking is limited only by how many transactions can run at once, which is the pool size of 10.
- **The lock costs throughput on a busy event.** It makes registrations for that one event run one after another, so 40 requests take 964 ms instead of 124 ms.
- **The cost stays on that event.** Each event has its own row lock, so other events are never blocked.
