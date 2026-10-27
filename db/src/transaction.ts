// [DATABASE M2.15: Interactive $transaction] + [DATABASE M1.11/M1.14: isolation levels & transaction boundaries]
import { Prisma } from '../generated/prisma/client';
import { prisma } from './client';
import { toDbError } from './errors';

/** The client handed to code running inside a transaction (same API as `prisma`, minus $transaction). */
export type Tx = Prisma.TransactionClient;

export type IsolationLevel = 'ReadCommitted' | 'RepeatableRead' | 'Serializable';

export type TransactionOptions = {
  /** PostgreSQL default is READ COMMITTED; SeatSure relies on explicit row locks instead of SERIALIZABLE. */
  isolationLevel?: IsolationLevel;
  /** Whole transaction must finish within this time or it is rolled back. */
  timeoutMs?: number;
  /** Max time to wait for a free pooled connection before giving up. */
  maxWaitMs?: number;
};

/**
 * Runs `work` inside one PostgreSQL transaction: every write commits together or none do.
 * Any thrown error (a domain AppError or a database error) triggers ROLLBACK.
 * Database errors are re-thrown as DbError so callers can check `err.kind` / `err.retryable`.
 */
export async function withTransaction<T>(work: (tx: Tx) => Promise<T>, options: TransactionOptions = {}): Promise<T> {
  try {
    return await prisma.$transaction(work, {
      isolationLevel: Prisma.TransactionIsolationLevel[options.isolationLevel ?? 'ReadCommitted'],
      timeout: options.timeoutMs ?? 5_000,
      maxWait: options.maxWaitMs ?? 3_000,
    });
  } catch (err) {
    throw toDbError(err) ?? err;
  }
}
