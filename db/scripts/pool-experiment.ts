// [DATABASE M2.12 / M2.13: Connection pool experiment]
// 40 requests arrive at once and each needs the database for ~100 ms (pg_sleep(0.1)).
// With a pool of N connections, only N queries run at the same time and the rest queue for a free
// connection, so total time ≈ ceil(40 / N) × 100 ms. A tiny pool with a short acquire timeout also
// shows the failure mode: requests give up instead of waiting forever.
// Usage: npm run experiment:pool        Output: docs/test-results/pool-experiment.txt
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createPrismaClient } from '../src/client';
import { toDbError } from '../src/errors';

const REQUESTS = 40;
const lines: string[] = [`Connection pool experiment - ${new Date().toISOString()}`, `${REQUESTS} concurrent queries, each SELECT pg_sleep(0.1)`, ''];
const log = (s: string) => (console.log(s), lines.push(s));

log('pool size | wall time (ms) | expected ≈ ceil(40/N)×100 | failed');
for (const poolMax of [1, 5, 10, 20, 40]) {
  const db = createPrismaClient({ poolMax });
  await db.$queryRaw`SELECT 1`; // open the pool before timing
  const t0 = performance.now();
  const results = await Promise.allSettled(Array.from({ length: REQUESTS }, () => db.$executeRaw`SELECT pg_sleep(0.1)`));
  const ms = Math.round(performance.now() - t0);
  const failed = results.filter((r) => r.status === 'rejected').length;
  log(`${String(poolMax).padStart(9)} | ${String(ms).padStart(14)} | ${String(Math.ceil(REQUESTS / poolMax) * 100).padStart(25)} | ${failed}`);
  await db.$disconnect();
}

// Failure mode: 2 connections, every query holds one for 1 s, and nobody may wait for a connection longer than 5 s.
const tiny = createPrismaClient({ poolMax: 2 });
const outcomes = await Promise.allSettled(Array.from({ length: 20 }, () => tiny.$executeRaw`SELECT pg_sleep(1)`));
const timeouts = outcomes.filter((r) => r.status === 'rejected').map((r) => toDbError((r as PromiseRejectedResult).reason)?.kind ?? 'error');
log('');
log(`Pool of 2, 20 queries × 1 s, 5 s acquire timeout: ${outcomes.length - timeouts.length} succeeded, ${timeouts.length} gave up (${[...new Set(timeouts)].join(', ') || 'none'})`);
log('Conclusion: the pool caps concurrent connections (protecting PostgreSQL); more connections help only up to the');
log('point where the database itself is the bottleneck, and the acquire timeout turns overload into a fast, visible error.');
await tiny.$disconnect();

const out = fileURLToPath(new URL('../../docs/test-results/', import.meta.url));
mkdirSync(out, { recursive: true });
writeFileSync(`${out}pool-experiment.txt`, lines.join('\n') + '\n');
