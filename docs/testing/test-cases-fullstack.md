# Test cases: Full Stack Web Development

**Run:** 26 Oct 2026, `npm run test:client` (Vitest + React Testing Library + jsdom).
**Result: 27 / 27 passed.** Raw output: [`../test-results/fullstack-tests.txt`](../test-results/fullstack-tests.txt).

The service modules (Axios calls) are mocked in these tests, so each one checks React behaviour on its own: forms, the cache, routing and error handling. The real React ↔ Express ↔ database path is covered by the backend integration tests and by the screenshots of the running app, which are listed below the table. Module numbers refer to the Full Stack livebook.

| ID | Concept | Scenario | Input | Expected | Actual | Pass/Fail |
|---|---|---|---|---|---|---|
| FS-T01 | M1.11 `useReducer` | Category chip toggles | `toggleCategory TALK` twice | `'TALK'`, then `''` | As expected | Pass |
| FS-T02 | M1.11 `useReducer` | Reset all filters; unknown action | search, club, availability, then reset | 3 active, then the initial state; unknown action throws | As expected | Pass |
| FS-T03 | M2.5 query params | Only non-empty filters are sent | `category: 'TALK'` | `{category:'TALK', sort:'soonest'}` | As expected | Pass |
| FS-T04 | M1.5 custom hook (debounce) | Typing "h", "ha", "hack" | 299 ms, then 300 ms | Old value, then `'hack'` | As expected | Pass |
| FS-T05 | M2.2 Axios instance + interceptor | Request as a demo user | user 11 | `X-User-Id: 11` header | As expected | Pass |
| FS-T06 | M2.10 error normalisation | 422 with field errors | `answers.tshirt` error | `ApiError {status 422, code, requestId, fieldErrors}` | As expected | Pass |
| FS-T07 | M2.10 401 handling | 401 response | — | Unauthorised handler called (redirect to the user chooser) | As expected | Pass |
| FS-T08 | M2.10 network failure | Server down | Adapter throws | `ApiError {status: 0, code: NETWORK_ERROR}` | As expected | Pass |
| FS-T09 | M1.6 React Hook Form | Fields built from JSONB questions; empty submit | 2 questions, no answers | Both fields rendered; "required" error; API **not** called | As expected | Pass |
| FS-T10 | M2.9 RHF + mutation, server errors | Server rejects an answer | 422 `answers.tshirt` | Message shown under that field; payload `{tshirt:'M', laptop:'true'}` | As expected | Pass |
| FS-T11 | M2.6 mutation success | Full event → waitlist | Outcome WAITLISTED #3 | "you are #3 on the waitlist" | As expected | Pass |
| FS-T12 | M1.4 Context (no user) | Anonymous visitor | — | "Choose user" link to `/choose-user` | As expected | Pass |
| FS-T13 | M3.5 nested include data | My passes | registration → event → club / venue | Title, club and venue rendered | As expected | Pass |
| FS-T14 | **M2.8 optimistic update + rollback** | Cancel, then the server refuses | Cancel resolves 409 later | Moves to "Cancelled" **before** the response, then rolls back to "Upcoming" with an error toast | As expected | Pass |
| FS-T15 | M2.7 selective invalidation | Cancel succeeds | 200 with promotion | Toast shown; "my passes" query re-fetched (2 calls) | As expected | Pass |
| FS-T16 | **M3.9 cursor + `useInfiniteQuery`, M3.11 infinite scroll** | Sentinel scrolls into view | Page 1 `nextCursor: 2` | Second request uses cursor 2; 3 events; "end" message | As expected | Pass |
| FS-T17 | M2.5 filter → query key | Click "Talk" chip | — | New request `{category:'TALK', sort:'soonest'}`, chip pressed | As expected | Pass |
| FS-T18 | M1.5 debounce + M2.5 | Type "git" in search | 3 keystrokes | Exactly 1 request with `q: 'git'` | As expected | Pass |
| FS-T19 | M1.6 cross-field validation | End before start; capacity 100 in a 40-seat venue | Form values | Both errors shown, `create` **not** called | As expected | Pass |
| FS-T20 | M1.6 `useFieldArray` | Add 2 questions, switch to choice, remove 1 | Clicks | 2 rows → options input appears → 1 row | As expected | Pass |
| FS-T21 | M2.9 + payload shaping | Valid form + 1 question; server 422 on capacity | — | Clean payload (ids from labels); server message under Capacity | As expected | Pass |
| FS-T22 | **M1.9 error boundary** | Chart crash, then fix | "Simulate a chart crash" | Fallback shown, rest of the dashboard still visible; chart returns after the fix | As expected | Pass |
| FS-T23 | M1.9 contained failure (degraded data) | MongoDB degraded response | `degraded: true` | Warning shown; PostgreSQL reports still rendered | As expected | Pass |
| FS-T24 | **M1.8 lazy routes + M1.10 nested layout routes** | Open `/organiser` | Memory router | App layout first, then lazy organiser layout + index route; bell shows 2 unread | As expected | Pass |
| FS-T25 | M1.10 index redirect | Open `/` | — | Redirect to `/events` (catalogue heading) | As expected | Pass |
| FS-T26 | M1.10 catch-all route | Unknown path | `/nowhere-at-all` | Lazy "Page not found" inside the layout | As expected | Pass |
| FS-T27 | **M1.7 `React.memo` (measure first)** | List re-renders after a poll, then one event changes | 3 cards; same objects; then event 2 changes | No card re-renders for unchanged data; only card 2 re-renders | Render count 3 → 3 → 4 | Pass |

## End-to-end evidence from the running app (screenshots in `../screenshots/`)

| ID | Concept | What the screenshot shows | File |
|---|---|---|---|
| FS-E01 | M3.7/M3.9 catalogue | Catalogue with live seat meters | `01-catalogue.png` |
| FS-E02 | M2.5 + M1.11 | Workshop + "Seats available" filters applied | `02-catalogue-filtered.png` |
| FS-E03 | M1.6 + M3.5 | Event page with the JSONB question form and venue details | `03-event-detail-open.png` |
| FS-E04 | M2.6 + M3.12 | Joining a full event: waitlist #16 toast, live MongoDB feed | `05-waitlisted-result.png` |
| FS-E05 | M3.5 | My passes (nested data) | `06-my-passes.png` |
| FS-E06 | M3.12 polling | Notifications delivered through the outbox | `07-notifications.png` |
| FS-E07 | M1.10 + M3.8 | Organiser dashboard with offset pagination | `08-organiser-dashboard.png` |
| FS-E08 | M1.6 | Event form validation messages | `09-event-form-validation.png` |
| FS-E09 | M3.7 + M3.8 | Attendees filtered by a JSONB answer | `11-attendees-jsonb-filter.png` |
| FS-E10 | M2.7 | Check-in mutation with selective invalidation | `10c-checked-in.png` |
| FS-E11 | M1.9 | Error boundary fallback around one chart | `13-error-boundary.png` |
| FS-E12 | Reliability | MongoDB outage: notifications degraded, registration page still works | `14-…png`, `15-…png` |
| FS-E13 | Responsive UI | 390 px phone layout | `16-mobile-catalogue.png`, `17-mobile-event-detail.png` |
