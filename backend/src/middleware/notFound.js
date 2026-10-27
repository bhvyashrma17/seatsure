import { AppError } from '../utils/AppError.js';

// [BACKEND M1.9] Catch-all registered after every route: anything unmatched is a 404 in the standard envelope.
export function notFound(req, res, next) {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404, 'ROUTE_NOT_FOUND'));
}
