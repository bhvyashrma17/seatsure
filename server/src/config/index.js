// [BACKEND M2.12: Supporting layers - configuration] Every environment-dependent value is read here,
// once, from process.env (loaded from the project-root .env). Nothing else touches process.env.
import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';

loadDotenv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

function int(name, fallback) {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value)) throw new Error(`Environment variable ${name} must be an integer`);
  return value;
}

const env = process.env.NODE_ENV ?? 'development';

export const config = Object.freeze({
  env,
  isProduction: env === 'production',
  isTest: env === 'test',
  port: int('PORT', 4000),
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  mongoUri: process.env.MONGODB_URI ?? '',
  // [BACKEND M2.6: API hardening] Reject oversized JSON bodies before they are parsed.
  bodyLimit: process.env.BODY_LIMIT ?? '10kb',
  outbox: Object.freeze({
    intervalMs: int('OUTBOX_INTERVAL_MS', 2_000),
    batchSize: int('OUTBOX_BATCH_SIZE', 100),
    deliveryTimeoutMs: int('OUTBOX_DELIVERY_TIMEOUT_MS', 5_000),
  }),
  // [BACKEND M3.11] How long a request may wait on MongoDB before falling back.
  mongoTimeoutMs: int('MONGO_TIMEOUT_MS', 1_500),
  pagination: Object.freeze({ defaultLimit: 12, maxLimit: 50, defaultPageSize: 20, maxPageSize: 100 }),
  // Developer-only routes (demo identities, simulated MongoDB outage) are never mounted in production.
  enableDevRoutes: env !== 'production',
  // Production hosting: the API also serves the built React app (client/dist), so the whole site is one
  // service on one URL and the browser calls the API on the same origin.
  clientDist: process.env.CLIENT_DIST ?? (env === 'production' ? fileURLToPath(new URL('../../../client/dist/', import.meta.url)) : ''),
});
