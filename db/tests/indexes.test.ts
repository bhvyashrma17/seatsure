// Index impact measured with EXPLAIN ANALYZE before vs after ([DATABASE M1.9], [DATABASE M1.10], [DATABASE M1.15]).
// The plans are saved to docs/test-results/explain-analyze-test.txt only when SAVE_RESULTS=1, so a routine
// `npm test` never overwrites the recorded evidence (timings differ slightly on every run).
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/client';
import { SCENARIOS, formatResult, loadBenchData, measureScenario, type ScenarioResult } from '../src/bench/explain';
import { resetDb } from './helpers';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const results: ScenarioResult[] = [];

beforeAll(async () => {
  await resetDb();
  await client.connect();
  await loadBenchData(client, { events: 30_000, users: 400, eventsWithRegistrations: 250 });
});

afterAll(async () => {
  if (process.env.SAVE_RESULTS === '1') {
    const out = fileURLToPath(new URL('../../docs/test-results/', import.meta.url));
    mkdirSync(out, { recursive: true });
    writeFileSync(`${out}explain-analyze-test.txt`, results.map(formatResult).join('\n'));
  }
  await client.end();
  await resetDb();
  await prisma.$disconnect();
});

const scenario = (id: string) => SCENARIOS.find((s) => s.id === id)!;

describe('EXPLAIN ANALYZE: before vs after each index', () => {
  it('DB-I01 partial index turns the catalogue query from a full scan + sort into an index scan', async () => {
    const r = await measureScenario(client, scenario('catalogue'));
    results.push(r);
    expect(r.before.nodes.join(' ')).toMatch(/Seq Scan/);
    expect(r.after.nodes.join(' ')).toContain('events_published_starts_at_idx');
    expect(r.after.executionMs).toBeLessThan(r.before.executionMs);
  });

  it('DB-I02 composite (category, starts_at, id) index jumps straight to a rare category', async () => {
    const r = await measureScenario(client, scenario('catalogue-category'));
    results.push(r);
    // Without it the planner can only walk the starts_at index and throw most rows away.
    expect(r.before.nodes.join(' ')).not.toContain('events_published_category_starts_at_idx');
    expect(r.after.nodes.join(' ')).toContain('events_published_category_starts_at_idx');
    expect(r.after.executionMs).toBeLessThan(r.before.executionMs);
  });

  it('DB-I03 GIN index answers JSONB containment (@>) without scanning every registration', async () => {
    const r = await measureScenario(client, scenario('jsonb-answers'));
    results.push(r);
    expect(r.before.nodes.join(' ')).toMatch(/Seq Scan/);
    expect(r.after.nodes.join(' ')).toContain('registrations_answers_gin_idx');
    expect(r.after.executionMs).toBeLessThan(r.before.executionMs);
  });

  it('DB-I04 (event_id, status, created_at) index returns an attendee page already in order', async () => {
    const r = await measureScenario(client, scenario('attendees'));
    results.push(r);
    expect(r.after.nodes.join(' ')).toContain('registrations_event_id_status_created_at_idx');
    expect(r.after.nodes.join(' ')).not.toMatch(/^Sort|Sort \(/); // no separate sort step needed
    expect(r.after.executionMs).toBeLessThan(r.before.executionMs);
  });

  it('DB-I05 the partial indexes really are partial (only PUBLISHED / only active rows)', async () => {
    const { rows } = await client.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE indexname IN ('events_published_starts_at_idx', 'registrations_one_active_per_user_key', 'outbox_events_pending_idx')
       ORDER BY indexname`,
    );
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.indexdef).toMatch(/WHERE/);
  });
});
