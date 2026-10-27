// [DATABASE M2.19: Structured error handling]
// Translates Prisma / PostgreSQL failures into a few storage-neutral kinds. The API layer maps a
// kind to an HTTP status; it never needs to know Prisma error codes or SQLSTATEs.
import { Prisma } from '../generated/prisma/client';

export type DbErrorKind =
  | 'UNIQUE_VIOLATION' // 23505 / P2002 -> 409 Conflict
  | 'FOREIGN_KEY_VIOLATION' // 23503 / P2003 -> 409/422
  | 'CHECK_VIOLATION' // 23514        -> 409/422
  | 'NOT_FOUND' // P2025        -> 404
  | 'WRITE_CONFLICT' // 40001 / 40P01 / P2034 -> retryable
  | 'TIMEOUT' // 57014 / P2024 / P2028 -> 503
  | 'UNAVAILABLE' // P1001 / connection refused -> 503
  | 'UNKNOWN';

export class DbError extends Error {
  readonly kind: DbErrorKind;
  readonly constraint: string | undefined;
  readonly sqlState: string | undefined;
  readonly prismaCode: string | undefined;

  constructor(kind: DbErrorKind, message: string, details: { constraint?: string; sqlState?: string; prismaCode?: string; cause?: unknown } = {}) {
    super(message, { cause: details.cause });
    this.name = 'DbError';
    this.kind = kind;
    this.constraint = details.constraint;
    this.sqlState = details.sqlState;
    this.prismaCode = details.prismaCode;
  }

  get retryable(): boolean {
    return this.kind === 'WRITE_CONFLICT';
  }
}

const SQLSTATE_KIND: Record<string, DbErrorKind> = {
  '23505': 'UNIQUE_VIOLATION',
  '23503': 'FOREIGN_KEY_VIOLATION',
  '23514': 'CHECK_VIOLATION',
  '40001': 'WRITE_CONFLICT', // serialization_failure
  '40P01': 'WRITE_CONFLICT', // deadlock_detected
  '55P03': 'WRITE_CONFLICT', // lock_not_available (NOWAIT / lock_timeout)
  '57014': 'TIMEOUT', // query_canceled (statement_timeout)
};

const PRISMA_CODE_KIND: Record<string, DbErrorKind> = {
  P2002: 'UNIQUE_VIOLATION',
  P2003: 'FOREIGN_KEY_VIOLATION',
  P2025: 'NOT_FOUND',
  P2034: 'WRITE_CONFLICT', // "Transaction failed due to a write conflict or a deadlock"
  P2024: 'TIMEOUT', // timed out fetching a connection from the pool
  P2028: 'TIMEOUT', // interactive transaction expired / API error
  P1001: 'UNAVAILABLE',
};

type AdapterCause = { originalCode?: string; code?: string; constraint?: { index?: string; fields?: string[] }; originalMessage?: string; message?: string };

function adapterCause(err: Prisma.PrismaClientKnownRequestError): AdapterCause | undefined {
  const meta = err.meta as { driverAdapterError?: { cause?: AdapterCause }; code?: string } | undefined;
  return meta?.driverAdapterError?.cause ?? (meta?.code ? { originalCode: meta.code } : undefined);
}

function constraintFrom(cause: AdapterCause | undefined): string | undefined {
  if (cause?.constraint?.index) return cause.constraint.index;
  if (cause?.constraint?.fields) return cause.constraint.fields.join(',');
  const text = cause?.originalMessage ?? cause?.message ?? '';
  return /constraint "([^"]+)"/.exec(text)?.[1];
}

/** Returns a DbError for database failures, or null when `err` is not a database error. */
export function toDbError(err: unknown): DbError | null {
  if (err instanceof DbError) return err;

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const cause = adapterCause(err);
    const sqlState = cause?.originalCode ?? cause?.code;
    const kind = (sqlState && SQLSTATE_KIND[sqlState]) || PRISMA_CODE_KIND[err.code] || 'UNKNOWN';
    return new DbError(kind, err.message.split('\n').pop() ?? err.message, {
      constraint: constraintFrom(cause),
      sqlState,
      prismaCode: err.code,
      cause: err,
    });
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    return new DbError('UNAVAILABLE', 'Database is unavailable', { prismaCode: err.errorCode, cause: err });
  }

  // Raw pg errors (e.g. from the isolation-level demo that uses pg directly) carry a SQLSTATE in `code`.
  const code = (err as { code?: unknown })?.code;
  if (typeof code === 'string' && SQLSTATE_KIND[code]) {
    return new DbError(SQLSTATE_KIND[code], (err as Error).message, { sqlState: code, cause: err });
  }
  if (code === 'ECONNREFUSED') {
    return new DbError('UNAVAILABLE', 'Database is unavailable', { cause: err });
  }
  // node-postgres pool: every connection stayed busy for longer than connectionTimeoutMillis.
  if (err instanceof Error && /timeout exceeded when trying to connect/i.test(err.message)) {
    return new DbError('TIMEOUT', 'No database connection became free in time', { cause: err });
  }
  return null;
}
