// [DATABASE M1.15] Index benchmark for the report: builds a throwaway "seatsure_bench" database with
// 50,000 events and 200,000 registrations, then runs EXPLAIN ANALYZE for each index scenario with
// the index dropped vs present. Output: docs/test-results/explain-analyze-benchmark.{txt,json}
//
// Usage: npm run bench:explain            (add -- --keep to keep the bench database afterwards)
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadEnv } from '../src/env';
import { SCENARIOS, formatResult, loadBenchData, measureScenario } from '../src/bench/explain';

loadEnv();
const keep = process.argv.includes('--keep');
const devUrl = new URL(process.env.DATABASE_URL!);
const benchUrl = new URL(devUrl);
benchUrl.pathname = '/seatsure_bench';
const adminUrl = new URL(devUrl);
adminUrl.pathname = '/postgres';
adminUrl.search = '';

const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
await admin.query('DROP DATABASE IF EXISTS seatsure_bench WITH (FORCE)');
await admin.query('CREATE DATABASE seatsure_bench');

console.log('Applying migrations to seatsure_bench ...');
execSync('npx prisma migrate deploy', {
  cwd: fileURLToPath(new URL('..', import.meta.url)),
  stdio: 'pipe',
  env: { ...process.env, DATABASE_URL: benchUrl.toString() },
});

const client = new pg.Client({ connectionString: benchUrl.toString() });
await client.connect();
console.log('Loading 50,000 events and 200,000 registrations ...');
const t0 = Date.now();
await loadBenchData(client, { events: 50_000, users: 1_000, eventsWithRegistrations: 200 });
console.log(`Loaded in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const results = [];
for (const scenario of SCENARIOS) {
  const r = await measureScenario(client, scenario);
  results.push(r);
  console.log(`${scenario.id.padEnd(20)} before ${r.before.executionMs.toFixed(3).padStart(8)} ms   after ${r.after.executionMs.toFixed(3).padStart(7)} ms   ${r.speedup.toFixed(1)}x`);
}

const { rows: version } = await client.query('SELECT version()');
const out = fileURLToPath(new URL('../../docs/test-results/', import.meta.url));
mkdirSync(out, { recursive: true });
const header = `SeatSure index benchmark - ${new Date().toISOString()}\n${version[0].version}\nData: 50,000 events (60% published), 1,000 users, 200,000 registrations\n\n`;
writeFileSync(`${out}explain-analyze-benchmark.txt`, header + results.map(formatResult).join('\n'));
writeFileSync(
  `${out}explain-analyze-benchmark.json`,
  JSON.stringify(
    results.map((r) => ({
      id: r.scenario.id,
      title: r.scenario.title,
      indexes: r.scenario.indexes,
      beforeMs: r.before.executionMs,
      afterMs: r.after.executionMs,
      speedup: Number(r.speedup.toFixed(1)),
      beforePlan: r.before.nodes,
      afterPlan: r.after.nodes,
    })),
    null,
    2,
  ),
);
await client.end();
if (!keep) await admin.query('DROP DATABASE seatsure_bench WITH (FORCE)');
await admin.end();
console.log(`\nWrote docs/test-results/explain-analyze-benchmark.txt${keep ? ' (bench database kept)' : ''}`);
