// [DATABASE M1.15: EXPLAIN ANALYZE] Measures what each index buys us.
// For every scenario we run the same query twice on the same data:
//   BEFORE: inside a transaction that DROPs the index (PostgreSQL DDL is transactional), then ROLLBACK
//   AFTER:  with the index in place
// and compare the plan's node types and execution time.
import pg from 'pg';

export type Scenario = {
  id: string;
  title: string;
  /** Index(es) whose impact is being measured. */
  indexes: string[];
  sql: string;
  params?: unknown[];
};

export const SCENARIOS: Scenario[] = [
  {
    id: 'catalogue',
    title: 'Catalogue page: next 12 upcoming published events',
    indexes: ['events_published_starts_at_idx', 'events_published_category_starts_at_idx'],
    sql: `SELECT id, title, starts_at FROM events
          WHERE status = 'PUBLISHED' AND starts_at >= now()
          ORDER BY starts_at, id LIMIT 13`,
  },
  {
    id: 'catalogue-category',
    // Measures only the composite index: the plain starts_at index stays available in BOTH runs,
    // so the difference is exactly what (category, starts_at, id) adds for a rare category.
    title: 'Catalogue filtered by a rare category (HACKATHON, ~2% of events)',
    indexes: ['events_published_category_starts_at_idx'],
    sql: `SELECT id, title, starts_at FROM events
          WHERE status = 'PUBLISHED' AND category = 'HACKATHON' AND starts_at >= now()
          ORDER BY starts_at, id LIMIT 13`,
  },
  {
    id: 'jsonb-answers',
    title: 'Who chose the Jain meal? JSONB containment over all registrations',
    indexes: ['registrations_answers_gin_idx'],
    sql: `SELECT count(*) FROM registrations WHERE answers @> '{"diet": "Jain"}'`,
  },
  {
    id: 'attendees',
    title: 'Attendee page: one event\'s confirmed list in registration order',
    indexes: ['registrations_event_id_status_created_at_idx', 'registrations_one_active_per_user_key'],
    sql: `SELECT id, user_id, created_at FROM registrations
          WHERE event_id = $1 AND status = 'CONFIRMED'
          ORDER BY created_at LIMIT 20`,
    params: [42],
  },
];

type PlanNode = { 'Node Type': string; 'Index Name'?: string; Plans?: PlanNode[] };

function nodesOf(plan: PlanNode): string[] {
  const label = plan['Index Name'] ? `${plan['Node Type']} (${plan['Index Name']})` : plan['Node Type'];
  return [label, ...(plan.Plans ?? []).flatMap(nodesOf)];
}

export type ExplainRun = { executionMs: number; nodes: string[]; text: string };
export type ScenarioResult = { scenario: Scenario; before: ExplainRun; after: ExplainRun; speedup: number };

async function explain(client: pg.Client, sql: string, params: unknown[] = []): Promise<ExplainRun> {
  // Warm-up run so both measurements read from the buffer cache, not from disk.
  await client.query(sql, params);
  const json = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`, params);
  const text = await client.query(`EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) ${sql}`, params);
  const [root] = json.rows[0]['QUERY PLAN'];
  return {
    executionMs: root['Execution Time'],
    nodes: nodesOf(root.Plan),
    text: text.rows.map((r) => r['QUERY PLAN']).join('\n'),
  };
}

export async function measureScenario(client: pg.Client, scenario: Scenario): Promise<ScenarioResult> {
  let before: ExplainRun;
  await client.query('BEGIN');
  try {
    for (const index of scenario.indexes) await client.query(`DROP INDEX IF EXISTS "${index}"`);
    before = await explain(client, scenario.sql, scenario.params);
  } finally {
    await client.query('ROLLBACK'); // the indexes come back untouched
  }
  const after = await explain(client, scenario.sql, scenario.params);
  return { scenario, before, after, speedup: before.executionMs / Math.max(after.executionMs, 0.001) };
}

/**
 * Fills the given database with a large synthetic data set using generate_series
 * (much faster than inserting row by row). Expects an empty schema.
 */
export async function loadBenchData(client: pg.Client, { events = 50_000, users = 1_000, eventsWithRegistrations = 200 } = {}) {
  await client.query(`
    INSERT INTO clubs (name, slug) VALUES ('Bench Club', 'bench-club');
    INSERT INTO venues (name, building, capacity) VALUES ('Bench Hall', 'Bench Block', 2000);
    INSERT INTO users (name, email, role)
      SELECT 'Bench User ' || g, 'bench' || g || '@example.edu', CASE WHEN g = 1 THEN 'ORGANISER' ELSE 'STUDENT' END::"Role"
      FROM generate_series(1, ${users}) AS g;
  `);
  // Events spread from ~1 year ago to ~1 year ahead; 60% published, 30% draft, 10% cancelled.
  await client.query(`
    INSERT INTO events (club_id, venue_id, created_by_id, title, description, category, status,
                        starts_at, ends_at, capacity, confirmed_count, questions, published_at, updated_at)
    SELECT 1, 1, 1, 'Bench event ' || g, 'Synthetic event for EXPLAIN ANALYZE',
           CASE WHEN g % 50 = 0 THEN 'HACKATHON'
                ELSE (ARRAY['WORKSHOP','TALK','COMPETITION','CULTURAL','SPORTS'])[1 + g % 5] END::"EventCategory",
           CASE WHEN g % 10 < 6 THEN 'PUBLISHED' WHEN g % 10 < 9 THEN 'DRAFT' ELSE 'CANCELLED' END::"EventStatus",
           now() - interval '365 days' + (g * interval '730 days' / ${events}),
           now() - interval '365 days' + (g * interval '730 days' / ${events}) + interval '2 hours',
           2000, 0, '[]'::jsonb, now(), now()
    FROM generate_series(1, ${events}) AS g;
  `);
  // Every user registers for each of the first N events. ~0.2% of answers are the rare "Jain" meal.
  await client.query(`
    INSERT INTO registrations (event_id, user_id, status, answers, created_at, updated_at)
    SELECT e, u,
           CASE WHEN (e + u) % 10 < 8 THEN 'CONFIRMED' ELSE 'WAITLISTED' END::"RegistrationStatus",
           jsonb_build_object(
             'tshirt', (ARRAY['S','M','L','XL'])[1 + (e * 7 + u) % 4],
             'diet', CASE WHEN (e * 31 + u * 17) % 500 = 0 THEN 'Jain' WHEN (e + u) % 2 = 0 THEN 'Veg' ELSE 'Non-veg' END),
           now() - ((e + u) % 500) * interval '1 minute', now()
    FROM generate_series(1, ${eventsWithRegistrations}) AS e, generate_series(1, ${users}) AS u;
  `);
  // VACUUM merges the GIN index's "pending list" (bulk inserts land there first) and ANALYZE
  // refreshes planner statistics, so the plans reflect a settled production table.
  await client.query('VACUUM ANALYZE');
}

export function formatResult(r: ScenarioResult): string {
  const line = '-'.repeat(78);
  return [
    line,
    `${r.scenario.title}`,
    `Indexes measured: ${r.scenario.indexes.join(', ')}`,
    `SQL: ${r.scenario.sql.replace(/\s+/g, ' ').trim()}`,
    line,
    `BEFORE (index dropped): ${r.before.executionMs.toFixed(3)} ms`,
    r.before.text,
    '',
    `AFTER (index present):  ${r.after.executionMs.toFixed(3)} ms`,
    r.after.text,
    '',
    `Speed-up: ${r.speedup.toFixed(1)}x`,
    '',
  ].join('\n');
}
