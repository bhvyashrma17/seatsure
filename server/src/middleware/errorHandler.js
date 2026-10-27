// [BACKEND M2.7: Central error-handling pipeline] Registered LAST in app.js. Express recognises an
// error handler by its four arguments. Every failure in the app ends up here and leaves in the same
// envelope: { status, code, message, errors?, requestId }.
//  - Operational errors (AppError, known DB/HTTP problems) show their message.
//  - Programmer errors (bugs) are logged in full server-side and hidden behind a generic 500,
//    so stack traces and SQL never leak to clients ([BACKEND M1.15]).
import { toDbError } from '@seatsure/db';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { TimeoutError } from '../utils/retry.js';

// [FULLSTACK M3.4] [DATABASE M2.19] Known constraint names -> friendly messages + stable codes.
const CONSTRAINT_ERRORS = {
  registrations_one_active_per_user_key: ['You are already registered for this event', 'ALREADY_REGISTERED'],
  events_confirmed_within_capacity_chk: ['This event is already full', 'EVENT_FULL'],
  events_time_order_chk: ['The event must end after it starts', 'INVALID_TIME_RANGE'],
  users_email_key: ['That email address is already in use', 'EMAIL_TAKEN'],
  clubs_name_key: ['A club with that name already exists', 'DUPLICATE_CLUB'],
};

function fromDbError(dbErr) {
  const [message, code] = CONSTRAINT_ERRORS[dbErr.constraint] ?? [];
  switch (dbErr.kind) {
    case 'UNIQUE_VIOLATION': // Prisma P2002
      return new AppError(message ?? 'This record already exists', 409, code ?? 'DUPLICATE');
    case 'FOREIGN_KEY_VIOLATION': // P2003
      return new AppError('A related record does not exist', 409, 'RELATED_RECORD_MISSING');
    case 'CHECK_VIOLATION': // SQLSTATE 23514
      return new AppError(message ?? 'The change would break a data rule', 409, code ?? 'CONSTRAINT_VIOLATION');
    case 'NOT_FOUND': // P2025
      return new AppError('Record not found', 404, 'NOT_FOUND');
    case 'WRITE_CONFLICT':
      return new AppError('Too many people did this at the same moment. Please try again.', 409, 'WRITE_CONFLICT');
    case 'TIMEOUT':
    case 'UNAVAILABLE':
      return new AppError('The database is busy or unavailable. Please try again shortly.', 503, 'DATABASE_UNAVAILABLE');
    default:
      return null;
  }
}

function normalise(err) {
  if (err instanceof AppError) return err;
  // Errors raised by express.json() before any route runs.
  if (err?.type === 'entity.too.large') return new AppError(`Request body is too large (limit ${err.limit} bytes)`, 413, 'PAYLOAD_TOO_LARGE');
  if (err?.type === 'entity.parse.failed') return new AppError('Request body is not valid JSON', 400, 'MALFORMED_JSON');
  if (err instanceof TimeoutError) return new AppError('A dependency took too long to respond', 503, 'TIMEOUT');
  const dbErr = toDbError(err);
  return dbErr ? fromDbError(dbErr) : null;
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  const appError = normalise(err);

  if (res.headersSent) {
    // A stream (e.g. CSV export) failed after headers went out: we can only abort the response.
    logger.error('Error after response started', { id: req.id, message: err?.message });
    return next(err);
  }

  if (appError) {
    if (appError.statusCode >= 500) logger.error(appError.message, { id: req.id, code: appError.code, cause: err?.message });
    return res.status(appError.statusCode).json({
      status: appError.status,
      code: appError.code,
      message: appError.message,
      ...(appError.errors ? { errors: appError.errors } : {}),
      requestId: req.id,
    });
  }

  // Programmer error: full details in the server log only.
  logger.error('Unhandled error', { id: req.id, name: err?.name, message: err?.message, stack: err?.stack });
  return res.status(500).json({
    status: 'error',
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong. Please try again later.',
    requestId: req.id,
  });
}
