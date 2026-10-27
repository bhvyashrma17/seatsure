// [DATABASE M2.1: Prisma 7 + driver adapter] PrismaClient talks to PostgreSQL through @prisma/adapter-pg.
// [DATABASE M2.12: Connection pooling] The adapter owns a pg connection pool shared by every request.
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { loadEnv } from './env';

loadEnv();

export type CreateClientOptions = {
  connectionString?: string;
  /** Maximum simultaneous connections this process may open. */
  poolMax?: number;
  /** Emit every SQL statement as a 'query' event (used by the N+1 tests and the pool experiment). */
  logQueries?: boolean;
};

export function createPrismaClient(options: CreateClientOptions = {}) {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env at the project root.');
  }

  const adapter = new PrismaPg({
    connectionString,
    // A small fixed pool: requests queue for a free connection instead of opening a new one
    // per request (which exhausts PostgreSQL's max_connections under load).
    max: options.poolMax ?? Number(process.env.DB_POOL_MAX ?? 10),
    // Fail fast (instead of hanging forever) when every pooled connection is busy.
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    // The adapter sends DateTime parameters without an offset, so PostgreSQL reads them in the
    // session time zone. Pinning sessions to UTC stores instants exactly (found by a probe on an
    // IST machine: 00:00Z was stored as 18:30Z the previous day). Display code converts to IST.
    options: '-c timezone=UTC',
  });

  return new PrismaClient({
    adapter,
    log: options.logQueries
      ? [{ emit: 'event', level: 'query' }, { emit: 'stdout', level: 'warn' }, { emit: 'stdout', level: 'error' }]
      : [{ emit: 'stdout', level: 'warn' }],
  });
}

// [FULLSTACK M3.1: Prisma connected to Express] One client per process (singleton), imported by the API.
// In development, reuse it across hot reloads.
const globalForPrisma = globalThis as unknown as { __seatsurePrisma?: ReturnType<typeof createPrismaClient> };

export const prisma = globalForPrisma.__seatsurePrisma ?? createPrismaClient();
if (process.env.NODE_ENV !== 'production') globalForPrisma.__seatsurePrisma = prisma;

export type Db = typeof prisma;
