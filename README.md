# SeatSure: campus event registration that can't overbook

**Integrated micro project, Semester 3.** Full Stack Web Development · Back-End Web Development · Advanced Database Systems
**Student:** Bhavya Sharma (Kalvium, Alliance University)

Clubs at Alliance University run workshops, hackathons and talks in rooms with a fixed number of seats. Registrations happen on Google Forms and WhatsApp, which cause several problems:
- They can't enforce a seat limit, so popular events get overbooked.
- Waitlists are kept by hand.
- When someone drops out, the freed seat isn't offered to the next person.
- Organisers have no data on fill rates or attendance.

**SeatSure** is a web app where students browse events and register against a **hard seat cap that stays correct even when many people click "Register" at the same moment**. A cancellation **automatically promotes** the next waitlisted student, who is notified. Organisers create events with their own registration questions, check people in, export attendees and view analytics.

Every user also has a personal to-do list, **My tasks**, where they can add, view, edit, tick off and delete tasks. It is the simplest create/read/update/delete example in the app: React → `/api/v1/tasks` → PostgreSQL.

![Catalogue](docs/screenshots/01-catalogue.png)

**Live demo:** <https://seatsure-production.up.railway.app> (deployed on Railway, see [Deployment](#deployment-railway)). Pick a demo user in the header to start.

**Reports:** for each course (Full Stack, Back-End, Advanced Database) there is a short report, `SeatSure_Report_<Course>_BhavyaSharma.pdf` (10 pages, following the submission guidelines), and a detailed report, `SeatSure_DetailedReport_<Course>_BhavyaSharma.pdf`. All six are in [`docs/reports/`](docs/reports/) as PDF and Word files.

## Submission contents

| Required item | Where it is |
|---|---|
| Frontend source | [`frontend/`](frontend/) (React + Vite), with `frontend/package.json` |
| Backend source | [`backend/`](backend/) (Express API), with `backend/package.json`. The data-access layer is [`db/`](db/) (`db/package.json`), kept as a separate package |
| Database dump, schema and seed | [`db/seatsure_dump.sql`](db/seatsure_dump.sql) (full `pg_dump` with the seed data: 230 users, 30 events, 2515 registrations, 46 tasks), [`db/schema.sql`](db/schema.sql) (the schema alone), [`db/prisma/migrations/`](db/prisma/migrations/) (the same schema as versioned migrations), [`db/prisma/seed.ts`](db/prisma/seed.ts) + `seed-data.ts` (seed script, `npm run db:seed`). MongoDB only holds data derived from PostgreSQL and is rebuilt from it through the outbox, so no MongoDB export is needed |
| Screenshots | [`docs/screenshots/`](docs/screenshots/), indexed by operation (Read, Create, Update, Delete, validation/error) in [`docs/screenshots/README.md`](docs/screenshots/README.md) |
| Report (PDF) | At the root of each submission ZIP: the short report (problem and CRUD over REST, setup and API reference, the full flow, route mapping and validation on both sides, test cases) and the detailed report for that course. All reports are also in [`docs/reports/`](docs/reports/) |
| Test cases | [`docs/testing/`](docs/testing/) (tables with expected and actual results), [`docs/test-results/`](docs/test-results/) (raw outputs, including `api-checks.txt`: live CRUD requests against the running API) |

`node_modules/` and `.env` files are not included: run `npm install` and copy `.env.example` to `.env` (see Quick start).

---

## Quick start (macOS, PostgreSQL 18 already installed)

```bash
npm install
```

```bash
cp .env.example .env && cp frontend/.env.example frontend/.env
```

Edit `.env`: in `DATABASE_URL` and `DATABASE_URL_TEST`, replace `YOUR_USERNAME` with the output of `whoami`.

```bash
npm run setup
```

```bash
npm run dev
```

- `npm run setup` creates `seatsure_dev` and `seatsure_test`, applies the migrations and loads the seed data. To use the dump instead: `createdb seatsure_dev && psql -d seatsure_dev -f db/seatsure_dump.sql` (the tests still need `npm run db:create`, which also creates `seatsure_test`).
- `npm run dev` starts the API on http://localhost:4000/api/v1 and the React app on http://localhost:5173.

Open **http://localhost:5173** and pick a demo user in the top-right menu:
- **Priya Singh** (student)
- **Aarav Mehta** (organiser, Coding Club)
- **Diya Nair** (organiser, AI & ML Society)
- **Ananya Iyer** (organiser, E-Cell, who owns the event that starts about an hour after seeding, for the check-in demo)

> MongoDB needs no installation in development. When `MONGODB_URI` is empty, the API starts an npm-distributed in-memory MongoDB and rebuilds it from PostgreSQL. The first start downloads about 77 MB.

---

## Prerequisites

| Tool | Version | Check | Install |
|---|---|---|---|
| Node.js | 22.12 or newer (developed on 22.23) | `node -v` | https://nodejs.org (LTS) or `brew install node@22` |
| PostgreSQL | 18 (developed on 18.4) | `psql --version` | `brew install postgresql@18 && brew services start postgresql@18` |
| MongoDB | optional (8.x) | — | Not needed for development (see above). For a persistent one: MongoDB Atlas (below) or `brew tap mongodb/brew && brew install mongodb-community` |

Windows: install PostgreSQL 18 from postgresql.org and use `postgresql://postgres:YOUR_PASSWORD@localhost:5432/seatsure_dev` in `.env`.

## Environment files

| File | Used by | Key variables |
|---|---|---|
| `.env` (copy of `.env.example`) | `/db`, `/backend`, tests | `DATABASE_URL`, `DATABASE_URL_TEST` (a separate database: tests wipe it), `DB_POOL_MAX`, `MONGODB_URI`, `PORT`, `CORS_ORIGIN` |
| `frontend/.env` (copy of `frontend/.env.example`) | Vite | `VITE_API_URL=http://localhost:4000/api/v1` |

Never commit the real `.env` files (they are in `.gitignore`).

## Commands

| Command | What it does |
|---|---|
| `npm run setup` | `db:create` + `db:migrate` + `db:seed` |
| `npm run db:create` | Creates the dev and test databases named in `.env` (if missing) |
| `npm run db:migrate` | `prisma migrate deploy` + `prisma generate` (applies `db/prisma/migrations/*`) |
| `npm run db:seed` | Wipes and reloads deterministic demo data: 8 clubs, 8 venues, 230 users, 30 events, about 2,500 registrations |
| `npm run db:reset` | Drops everything, re-migrates and re-seeds |
| `npm run dev` | API (nodemon + tsx) and React (Vite) together via `concurrently` |
| `npm test` | All 153 automated tests (database, backend, frontend) |
| `npm run test:db` / `test:backend` / `test:frontend` | One subject's test suite |
| `npm run demo:concurrency -- --seats 10 --students 50` | Live race demo against the running API |
| `npm run test:api` | Live CRUD-over-REST checks against the running API: 7 for tasks (including the guideline examples: create 201, empty title 400, `DELETE /tasks/99` 404) and 14 for events and registrations; writes `docs/test-results/api-checks.txt` |
| `npm run bench:explain` | EXPLAIN ANALYZE before/after for each index on 50k events / 200k registrations, in a throwaway `seatsure_bench` database |
| `npm run report:bundle` | Production build, then the gzipped JavaScript a student downloads on a first visit vs what the organiser area adds (`docs/test-results/bundle-split.json`) |
| `npm run experiment:pool -w @seatsure/db` | Connection-pool experiment (Advanced Database M2.13) |
| `npm run experiment:race -w @seatsure/db` | No-lock vs `FOR UPDATE` race experiment (uses the test database) |
| `npm run studio -w @seatsure/db` | Prisma Studio (browse the tables) |

**Latest results: 153 / 153 tests passed** (50 database, 71 backend, 32 frontend), recorded on 27 Oct 2026; raw outputs are in `docs/test-results/`. Live API checks against the running server (`npm run test:api`, 27 Oct 2026): 21 / 21 as expected. Test-case tables (ID, concept, scenario, input, expected, actual, pass/fail) are in `docs/testing/`.

---

## Fallback: free hosted databases (if PostgreSQL won't install)

You create the accounts yourself. No code changes are needed, only `.env`.

**PostgreSQL on Neon (free tier)**
1. Sign up at https://neon.tech and create a project (region: Asia Pacific Singapore is closest to Bengaluru).
2. *Branches → main → Roles & databases*: create two databases, `seatsure_dev` and `seatsure_test`.
3. *Dashboard → Connect*: choose **Direct connection** (not "pooled"; Prisma migrations need a direct connection) and copy the URL.
4. In `.env`:
   ```
   DATABASE_URL="postgresql://USER:PASSWORD@ep-xxxx.ap-southeast-1.aws.neon.tech/seatsure_dev?sslmode=require"
   DATABASE_URL_TEST="postgresql://USER:PASSWORD@ep-xxxx.ap-southeast-1.aws.neon.tech/seatsure_test?sslmode=require"
   DB_POOL_MAX=5
   ```
5. Run `npm run db:migrate && npm run db:seed`, then `npm run dev`. Skip `db:create`, because Neon creates databases in step 2.

Supabase works the same way (*Project settings → Database → Connection string → URI*, direct connection on port 5432).

**MongoDB on Atlas (free M0)**, only if you want MongoDB data to survive restarts
1. https://www.mongodb.com/cloud/atlas → create a free **M0** cluster.
2. *Database Access* → add a user and password. *Network Access* → add your current IP.
3. *Connect → Drivers* → copy the `mongodb+srv://…` URI and add the database name:
   `MONGODB_URI="mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/seatsure?retryWrites=true&w=majority"`
4. Run `npm run db:seed` (it also clears the Atlas collections), then `npm run dev`. The API replays the outbox into Atlas automatically.

---

## Deployment (Railway)

The live demo is one Railway web service plus two managed databases, in a Railway project named `seatsure`:

| Railway service | What it runs | Key settings |
|---|---|---|
| `seatsure` | The Express API and the built React app, on one URL | Build: `npm run build:production` (Prisma client + Vite build). Pre-deploy: `npm run db:deploy` (migrations, then the demo seed only if the database is empty). Start: `npm run start:production`. Health check: `/api/v1/health` |
| `Postgres` | Managed PostgreSQL | `DATABASE_URL=${{Postgres.DATABASE_URL}}` (private network) |
| `MongoDB` | Managed MongoDB | `MONGODB_URI=${{MongoDB.MONGO_URL}}/seatsure?authSource=admin` |

Other variables on `seatsure`:
- `VITE_API_URL=/api/v1`: read at build time, so the browser calls the API on the same origin.
- `CORS_ORIGIN`
- `RAILPACK_NODE_VERSION=22`
- `MONGOMS_DISABLE_POSTINSTALL=1`: skips downloading the development-only in-memory MongoDB.

Useful Railway CLI commands (run from this folder after `railway link`):

| Command | What it does |
|---|---|
| `railway up --service seatsure` | Deploy the current code |
| `railway ssh --service seatsure -- npm run db:seed` | Reload the demo data. This **wipes** the hosted data; do it on demo day so the check-in event starts about an hour later |
| `railway logs --service seatsure --lines 100` | Recent logs |

As in development, identity is the demo user switcher (`X-User-Id`), not real authentication, so anyone with the URL can act as any demo user. All data is fictional seed data. The MongoDB-outage buttons are development-only and are hidden in the deployed app.

## Architecture

```mermaid
flowchart LR
  subgraph Frontend["/frontend · React (Vite)"]
    UI[Pages and components] --> Hooks[Feature hooks<br/>TanStack Query]
    Hooks --> Svc[services/ · Axios instance<br/>+ interceptors]
  end
  subgraph Backend["/backend · Express API /api/v1"]
    MW[Middleware pipeline<br/>requestId → timer → CORS → JSON 10kb] --> R[routes/] --> V[validators/<br/>express-validator] --> C[controllers/<br/>thin] --> S[services/<br/>domain rules, transactions]
    S --> Bus((EventEmitter bus))
    D[Outbox dispatcher<br/>retry · backoff · timeout] --> Bus
    EH[Central error handler]
  end
  subgraph DB["/db · @seatsure/db"]
    Repo[repositories/<br/>Prisma 7 + $queryRaw] --> PG[(PostgreSQL 18<br/>source of truth + outbox)]
    Mongo[Mongoose models<br/>aggregations] --> MDB[(MongoDB<br/>notifications · activity)]
  end
  Svc -- "HTTP JSON + X-User-Id" --> MW
  S --> Repo
  D -- "poll due messages" --> Repo
  Bus --> Mongo
```

**One registration, end to end.**
1. React `RegistrationPanel` (React Hook Form) calls `useRegister` (a TanStack mutation), which calls `registrationsApi.register` (Axios), sending `POST /api/v1/events/:id/registrations`.
2. Express runs the middleware pipeline, then `registerRules` and `validate`, then the controller.
3. `registrationService.register` opens **one PostgreSQL transaction**. Inside it:
   - `SELECT … FOR UPDATE` locks the event row.
   - The domain rules run.
   - The registration is inserted as CONFIRMED or WAITLISTED.
   - The seat counter is updated.
   - An outbox row is written.
4. After COMMIT, the dispatcher publishes the outbox message on the EventEmitter bus. The subscribers write a notification and an activity document to MongoDB.
5. The response `201 {outcome, position}` returns to React, which invalidates exactly the affected caches.

More detail: [`docs/er-diagram.md`](docs/er-diagram.md) (ER diagram, normalisation, constraints, index rationale) and [`DECISIONS.md`](DECISIONS.md) (every judgement call).

## Project structure

```
seatsure/
├── frontend/               FULL STACK: React 19 + Vite + React Router v6 + TanStack Query + Axios + React Hook Form
│   └── src/
│       ├── app/            router (lazy nested routes), QueryClient defaults
│       ├── layouts/        AppLayout (header, Outlet, error boundary, Suspense)
│       ├── services/       Axios instance + interceptors, one module per API area
│       ├── features/       events/, registrations/, tasks/, organiser/, notifications/, users/ (each with hooks/ + barrel)
│       └── shared/         Card (compound), Field, Pagination, Toast (context), hooks, query-key factory
├── backend/                BACKEND: Express 5 REST API
│   └── src/
│       ├── app.js          middleware pipeline (order matters) + routers + 404 + error handler
│       ├── routes/         one Router per resource (events, registrations, tasks, me, analytics), /api/v1 + deprecated /api alias
│       ├── validators/     express-validator chains
│       ├── controllers/    thin: extract → call → format
│       ├── services/       business rules + workflows (rules/eventRules.js is pure functions)
│       ├── middleware/     requestId, requestTimer, auth (demo identity), validate, errorHandler, deprecation
│       ├── events/         EventEmitter bus, outbox dispatcher, MongoDB subscribers
│       ├── utils/          AppError, asyncHandler, retry/withTimeout/backoff, respond, logger
│       └── config/         env-driven configuration
├── db/                     ADVANCED DATABASE: PostgreSQL schema + migrations, Prisma 7, MongoDB
│   ├── prisma/             schema.prisma, migrations/ (init, CHECK constraints, outbox key, tasks), seed.ts
│   ├── src/                Prisma client (pool), transaction, errors, repositories/, mongo/, bench/
│   ├── scripts/            explain-benchmark.ts, pool-experiment.ts, race-experiment.ts, seed-if-empty.ts
│   └── tests/              constraints, transactions, queries, indexes, mongo
├── scripts/                create-databases.mjs, concurrency-demo.mjs, api-checks.mjs, bundle-report.mjs
└── docs/                   er-diagram.md, testing/ (test-case tables), test-results/ (raw outputs), screenshots/
```

## API reference (all JSON, under `/api/v1`)

Success responses use `{ "status": "success", "data": …, "meta"?: … }`. Errors use `{ "status": "fail" | "error", "code", "message", "errors"?: [{field, message}], "requestId" }`. Requests that need a user send `X-User-Id`.

| Method | Path | Who | Purpose |
|---|---|---|---|
| GET | `/health` | anyone | PostgreSQL/MongoDB status, outbox backlog, seat-counter integrity |
| GET | `/users` | anyone | Demo identities |
| GET | `/me` · `/me/registrations` · `/me/notifications` | user | Profile, passes (with waitlist positions), notifications |
| PATCH | `/me/notifications` `{read:true}` | user | Mark all notifications read |
| GET | `/clubs` · `/venues` | anyone | Reference data |
| GET | `/events?q&clubId&category&availability&sort&cursor&limit` | anyone | Catalogue (cursor pagination) |
| GET | `/events/:id` | anyone | Event detail (+ my registration) |
| GET | `/events/mine?page&pageSize&status` | organiser | Organiser dashboard (offset pagination) |
| POST · PATCH · DELETE | `/events` · `/events/:id` | organiser of the club | Create draft · edit/publish/cancel/capacity · delete draft |
| POST | `/events/:id/registrations` `{answers}` | user | Register: 201 `{outcome: CONFIRMED \| WAITLISTED, position}` |
| GET | `/events/:id/registrations?page&pageSize&status&search&answers[key]=value` | organiser | Attendees (offset pagination + JSONB filter) |
| GET | `/events/:id/registrations/export` | organiser | Streamed CSV |
| GET | `/events/:id/activity` | anyone | MongoDB activity feed (`meta.degraded` if MongoDB is down) |
| DELETE | `/registrations/:id` | owner or organiser | Cancel (+ automatic promotion) |
| PATCH | `/registrations/:id` `{checkedIn:true}` | organiser | Check in (idempotent) |
| GET | `/tasks` | user | My tasks, open first, with `meta {total, open, done}` |
| POST | `/tasks` `{title, notes?, dueDate?}` | user | Create a task: 201 + `Location` (empty title: 400) |
| GET · PATCH · DELETE | `/tasks/:id` | owner | Read · edit or tick done `{title?, notes?, dueDate?, completed?}` · delete (204). Another user's or a missing task: 404 |
| GET | `/analytics/overview?scope=mine\|all` · `/analytics/activity` | organiser | Window-function reports · MongoDB aggregations |
| POST | `/dev/mongo/outage` · `/dev/mongo/restore` | organiser, dev only | Graceful-degradation demo |
| GET | `/api/events` | anyone | **Deprecated** alias (sends `Deprecation`, `Sunset` and `Link` headers) |

---

## Traceability matrix

Every concept is tagged in the code as `// [FULLSTACK|BACKEND|DATABASE Mx.y: Concept]`. Run `grep -rn "\[BACKEND M" backend/src` (and the same for the other two tags) to list them. Module numbers are the livebook lesson numbers in [`../concepts.md`](../concepts.md). Test IDs link to `docs/testing/`.

### Full Stack Web Development (`/frontend`)

| Module | Concept | Files / functions | How to demo | Test IDs |
|---|---|---|---|---|
| M1.4 | Context API | `features/users/CurrentUserContext.jsx` (`CurrentUserProvider`, `useCurrentUser`); `shared/components/Toast.jsx` (`ToastProvider`) | Switch the user in the header: header, passes, organiser tab and bell all change | FS-T05, FS-T12 |
| M1.5 | Custom hooks | `shared/hooks/useDebouncedValue.js`, `useIntersectionObserver.js`; `features/*/hooks/*` | Type in search: one request after typing stops | FS-T04, FS-T18 |
| M1.6 | React Hook Form | `features/events/RegistrationPanel.jsx` (fields from JSONB questions); `features/organiser/EventFormPage.jsx` (`useFieldArray`, cross-field `validate`) | Submit an empty registration / an event ending before it starts | FS-T09, FS-T19, FS-T20 |
| M1.7 | `React.memo` / `useMemo` / `useCallback` | `features/events/EventCard.jsx` (`memo`); `EventsPage.jsx` (`useMemo` params, `useCallback` loadMore) | Profiler: polling doesn't re-render unchanged cards | FS-T27 |
| M1.8 | Code splitting (`React.lazy` + `Suspense`) | `app/router.jsx` (every page lazy); `layouts/AppLayout.jsx` (`<Suspense>`) | Network tab: `OrganiserLayout-*.js` loads only when opening Organiser | FS-T24 |
| M1.9 | Error boundaries | `layouts/AppLayout.jsx` (resets on navigation); `features/organiser/AnalyticsPage.jsx` (`Panel` + `QueryErrorResetBoundary`) | Analytics → "Simulate a chart crash" | FS-T22 |
| M1.10 | Nested / layout routes | `app/router.jsx`; `layouts/AppLayout.jsx`, `features/organiser/OrganiserLayout.jsx` (`<Outlet/>`) | Organiser tabs keep the shared chrome | FS-T24, FS-T25, FS-T26 |
| M1.11 | `useReducer` | `features/events/state/filtersReducer.js`; `EventsPage.jsx` | Category chips / "Clear filters" | FS-T01–T03 |
| M1.12 | Compound components / slots | `shared/components/Card.jsx` (`Card.Header/Body/Footer`, `title`/`actions` slots) used by every card | Same Card in catalogue, passes, panels | (all UI tests) |
| M1.13 | Feature-based architecture | `frontend/src/features/*` + barrels, `shared/`, `services/` | Folder tour | — |
| M2.1 | CORS, env, both servers | `backend/src/app.js` (`cors` allowlist); `.env.example`, `frontend/.env.example`; root `npm run dev` (`concurrently`) | `npm run dev`: every API call from :5173 to :4000 is cross-origin | — (no automated CORS test) |
| M2.2 | Axios instance + `VITE_API_URL` | `services/apiClient.js` (`apiClient`, `unwrap`) | — | FS-T05 |
| M2.3–2.4 | TanStack Query: QueryClient, caching, `staleTime` | `app/queryClient.js`; `features/events/hooks/useEvents.js` | "Updating…" pill while refetching in the background | FS-T16 |
| M2.5 | Filters → query params | `EventFilters.jsx` → `useEventsInfinite(params)` → `eventsApi.list` | Change filters: new request, new cache entry | FS-T17, FS-T18 |
| M2.6–2.7 | Mutations + selective invalidation | `useRegister` (`useEvents.js`); `useCreateEvent`/`useUpdateEvent`/`useCheckIn` (`useOrganiser.js`) | Register, then the seat meter and passes refresh | FS-T11, FS-T15 |
| M2.8 | Optimistic updates + rollback | `features/registrations/hooks/useMyRegistrations.js` (`useCancelRegistration`) | Cancel a pass: it moves instantly | FS-T14 |
| M2.9 | RHF + mutation + server errors | `RegistrationPanel.jsx` `onSubmit` (`setError`); `EventFormPage.jsx`; `shared/lib/format.js` (`toFormField`) | Server 422 shows under the field | FS-T10, FS-T21 |
| M2.10 | Axios interceptors, retry config | `services/apiClient.js` (`toApiError`, 401 → `/choose-user`); `app/queryClient.js` (no 4xx retries) | Clear the user, then try to register | FS-T06–T08 |
| M2.11 | Custom API hooks + key factory | `shared/lib/queryKeys.js`; `features/*/hooks/*` | — | (all hook tests) |
| M3.1–3.2 | Prisma connected to Express | `db/src/client.ts` (`prisma`); `backend/src/container.js` | — | BE-I01 |
| M3.3 | `include` / `select` / `_count` | `db/src/repositories/eventRepository.ts` (`cardSelect`, `findDetail`) | Event page waitlist count | DB-Q02 |
| M3.4 | Prisma errors P2002 / P2025 in the UI | `db/src/errors.ts` → `backend/src/middleware/errorHandler.js` → toast | Register twice: "already registered" | BE-U28, BE-I14 |
| M3.5 | Nested include data in React | `features/registrations/PassCard.jsx` | My passes (event → club → venue) | FS-T13 |
| M3.7 | Filtering & sorting end-to-end | `EventFilters` → `events.validators.js` → `eventRepository.listPublished` | Sort "Most popular" | FS-T17, BE-I05, DB-Q02 |
| M3.8 | Offset pagination | `OrganiserHome.jsx`, `AttendeesPage.jsx`, `shared/components/Pagination.jsx` | Attendees page 2 | BE-I17, DB-Q09 |
| M3.9 | Cursor pagination + `useInfiniteQuery` | `useEventsInfinite` (`useEvents.js`); `eventRepository.listPublished` (`cursor`, `take: limit+1`) | Scroll the catalogue | FS-T16, BE-I04, DB-Q01 |
| M3.11 | Infinite scroll (IntersectionObserver) | `useIntersectionObserver.js` + sentinel in `EventsPage.jsx` | Scroll to the bottom | FS-T16 |
| M3.12 | Polling, `refetchOnWindowFocus`, `staleTime` | `useEvent` (5 s), `useNotifications` (15 s), catalogue (30 s) | Two windows: seats update live | FS-E06 |
| M1.6, M2.6–2.9 | Tasks CRUD in the UI: form validation, mutations, optimistic tick, server errors on fields | `features/tasks/TasksPage.jsx`, `TaskItem.jsx`, `hooks/useTasks.js`; `services/tasksApi.js` | My tasks: add, tick done, edit, delete | FS-T28–T32 |

### Back-End Web Development (`/backend`)

| Module | Concept | Files / functions | How to demo | Test IDs |
|---|---|---|---|---|
| M1.5 | REST resource design | `routes/*.routes.js` (nouns, sub-resources `/events/:id/registrations`) | API table above | BE-I04, BE-I07 |
| M1.6 / M1.15 | JSON contract, status codes, error envelope | `utils/respond.js` (`ok`, `created`, `noContent`); `middleware/errorHandler.js` | `curl -i`: 201 + Location, 204, 404, 409, 422 | BE-U27, BE-I02, BE-I07 |
| M1.9 / M1.11 | Express server, Router modules, params vs query, catch-all 404 | `server.js` (`app.listen`), `routes/index.js`, `middleware/notFound.js` | `GET /api/v1/nope` | BE-U30, BE-I02 |
| M2.2 | Streams | `controllers/registrations.controller.js` (`exportCsv`: `Readable.from` + `pipeline`); `registrationRepository.iterateForExport` | Attendees → Export CSV | BE-I18, BE-U38 |
| M2.4 | Middleware pipeline (request-id, timing, logging, order) | `app.js`; `middleware/requestId.js`, `middleware/requestTimer.js` | Response headers `X-Request-Id`, `X-Response-Time`; server log | BE-U24, BE-U25 |
| M2.5 | express-validator | `validators/*.validators.js`; `middleware/validate.js` | POST invalid event: 400 field list | BE-U26, BE-I05, BE-I08 |
| M2.6 | Hardening: sanitisation, mass assignment, payload limit | `validate.js` (`matchedData` allowlist); `express.json({limit:'10kb'})`; `eventRules.normaliseAnswers` | Send `status:"CONFIRMED"` → ignored; 20 KB body → 413 | BE-I08, BE-I13, BE-U30 |
| M2.7 | AppError + asyncHandler + central handler | `utils/AppError.js`, `utils/asyncHandler.js`, `middleware/errorHandler.js` | Any 4xx/5xx shares one shape | BE-U27–U29 |
| M2.9–2.11 | Layered architecture, thin controllers, services, repository pattern | `routes/` → `controllers/` → `services/` → `@seatsure/db` repositories; `container.js` (composition root) | Unit tests swap in fake repositories | BE-U09–U23 |
| M2.12 | Supporting layers: config | `config/index.js` (env-driven, frozen) | — | — |
| M3.1 / M3.3 | Data flow, trust boundaries, single source of truth | `middleware/auth.js` (validates `X-User-Id`); PostgreSQL authoritative, MongoDB derived | `/health` `seatCounterMismatches: 0` | BE-I12, BE-I20 |
| M3.2 | Domain rules & workflows | `services/rules/eventRules.js` (state machine, windows, answers); `registrationService.register/cancel/checkIn`; `eventService.update` (capacity → promotion) | Cancel → next person promoted | BE-U01–U23, BE-I10, BE-I15 |
| M3.4–3.6 | Concurrency, race conditions, transactions | `registrationService.register` (`transactWithRetry` → `lockForUpdate` → insert → counter → outbox) | `npm run demo:concurrency` | BE-I21–I23, DB-T04/T05 |
| M3.8–3.9 | API design: pagination, filtering, sorting metadata | `events.controller.js` (`meta.nextCursor/hasMore`, `meta.page/total/totalPages`) | Catalogue / attendees | BE-I04, BE-I17 |
| M3.10 | API versioning + deprecation | `routes/index.js` (`/api/v1`, `/api/events` alias); `middleware/deprecation.js` | `curl -i /api/events` | BE-I03 |
| M3.11 | Reliability: retries, timeouts, backoff, graceful degradation | `utils/retry.js`; `events/outboxDispatcher.js`; `services/feedService.js`, `analyticsService.activity` | Analytics → "Simulate MongoDB outage" | BE-U13, BE-U31–U37, BE-I25 |
| M3.12 | Event-driven (EventEmitter bus) | `events/eventBus.js` (`publish`); `events/subscribers/*`; dispatcher | Register → notification appears | BE-U34, BE-I24, BE-I26 |
| M1.5, M1.13–1.15 | CRUD over REST: the tasks resource | `routes/tasks.routes.js`, `validators/tasks.validators.js`, `controllers/tasks.controller.js`, `services/taskService.js` | `npm run test:api` (API-01–07) | BE-I27–I33 |

### Advanced Database Systems (`/db`)

| Module | Concept | Files / functions | How to demo | Test IDs |
|---|---|---|---|---|
| M1.4–1.5 | ER model, normalisation (3NF) | `docs/er-diagram.md`; `prisma/schema.prisma` | Explain venue/club separation | — |
| M1.6 | DDL constraints (PK, FK, UNIQUE, CHECK, ON DELETE) | `prisma/migrations/*_init`, `*_integrity_checks/migration.sql` | psql: `UPDATE events SET confirmed_count = capacity + 1` → rejected | DB-C01–C12 |
| M1.9 | JSONB + GIN | `events.questions`, `registrations.answers`; `registrations_answers_gin_idx`; `registrationRepository.listForEvent` (`@>`) | Attendees → filter by answer | DB-C04, DB-Q09, DB-I03 |
| M1.10 | Partial & composite indexes | `schema.prisma` `@@index(… where: …)`, partial `@@unique` | `\d events` in psql | DB-C07, DB-I01, DB-I02, DB-I04, DB-I05 |
| M1.11 | MVCC & isolation levels | `src/transaction.ts` (`withTransaction`, isolation option); `tests/transactions.test.ts` | Two psql sessions (as in tests DB-T06/T07) | DB-T06, DB-T07 |
| M1.12 | Window functions | `analyticsRepository.ts` (`RANK`, `DENSE_RANK`, `NTILE`, `SUM/AVG OVER`); `registrationRepository.waitlistPositions` (`ROW_NUMBER`), `listForEvent` (`COUNT(*) OVER()`) | Analytics page | DB-Q04–Q07, DB-Q09 |
| M1.13 | CTEs | `analyticsRepository.ts` (`event_stats`, `rated`, `calendar`, `per_club`) | — | DB-Q05–Q07 |
| M1.14 | Transactions & concurrent writes (row locks) | `eventRepository.lockForUpdate` (`FOR UPDATE OF e`); service transaction boundaries | `npm run demo:concurrency` | DB-T01–T05, DB-T08 |
| M1.15 | EXPLAIN ANALYZE | `src/bench/explain.ts`; `scripts/explain-benchmark.ts` | `npm run bench:explain` | DB-I01–I04 |
| M2.1 / M2.12–2.13 | Prisma 7 setup, adapter-pg, connection pooling | `src/client.ts` (`createPrismaClient`: `max`, timeouts, UTC session); `scripts/pool-experiment.ts` | `npm run experiment:pool -w @seatsure/db` | DB-C13, DB-Q11 |
| M2.3 / M2.5 / M2.20 | Schema, migrations, enums, `migrate deploy` | `prisma/schema.prisma`, `prisma/migrations/`, `prisma7.config.ts` | `npm run db:migrate` | (all DB tests run on migrated schema) |
| M2.8 / M2.10 | Prisma Client CRUD, relation queries (no N+1) | `repositories/*.ts`; `registrationRepository.listForUser` (`include`) | My passes | DB-Q08 |
| M2.11 | Filtering, sorting, cursor pagination | `eventRepository.listPublished` | Catalogue | DB-Q01–Q03 |
| M2.15 | Interactive `$transaction`, nested writes | `src/transaction.ts`; `registrationService`; nested create (DB-T03) | — | DB-T01–T03 |
| M2.19 | `$queryRaw` + structured error handling | `analyticsRepository.ts`, `lockForUpdate`, `listForEvent`; `src/errors.ts` (`toDbError`) | Duplicate registration → 409 | DB-C07, DB-C13, BE-U28 |
| M3.2–3.4 | Documents vs rows, BSON/_id, Mongoose schema + validators + hooks | `src/mongo/models/Notification.ts`, `ActivityLog.ts` | Notifications page | DB-M01, DB-M02 |
| M3.7 / M3.12 / M3.16 | Aggregation pipelines, `$facet`, `$lookup` | `src/mongo/aggregations.ts` (`activitySummaryPipeline`, `promotionReachPipeline`) | Analytics → Activity / Waitlist promotions | DB-M06–M08 |
| M3.8 | Embedding vs referencing | `ActivityLog.ts` (embedded snapshots + id references) | — | DB-M10 |
| M3.19 | TTL indexes, `$jsonSchema`, dual-write problem | `Notification.ts` (TTL), `jsonSchemas.ts`, `connection.ts` (`ensureCollections`); outbox (`outboxRepository.ts`) | Outage demo | DB-M03–M05, BE-I25 |
| M3.20 | Index design proven with `explain()` | `ActivityLog.ts` compound index | — | DB-M09 |
| M1.6, M1.10, M2.8 | Tasks table: CHECK constraints, ON DELETE CASCADE, composite index, Prisma CRUD | `prisma/schema.prisma` (`Task`), `migrations/*_tasks`, `src/repositories/taskRepository.ts` | psql: `\d tasks` | DB-C14–C16 |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `P1010: User was denied access` or `P1000` | Put your macOS username (`whoami`) in `DATABASE_URL`, or the `postgres` user and password on Windows |
| `P1001: Can't reach database server` | `brew services start postgresql@18` |
| `database "seatsure_dev" does not exist` | `npm run db:create` |
| Port 4000 or 5173 in use | Stop the other process, or change `PORT` / `VITE_API_URL` and `CORS_ORIGIN` |
| First API start is slow | The in-memory MongoDB binary (~77 MB) downloads once; after that it starts in about a second |
| Activity feed says "unavailable" | MongoDB is offline or degraded (expected in the outage demo). Use *Restore MongoDB*, or check `MONGODB_URI` |
| "Check in" says "Opens 2 h before start" | Re-run `npm run db:seed`. It creates an event starting about an hour later, and check-in opens 2 h before the start |
