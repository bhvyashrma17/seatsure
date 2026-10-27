// [BACKEND M2.5: Request validation] Runs after an express-validator chain. On failure it stops the
// request with a structured 400 that lists every field problem. On success it exposes only the
// fields the chain declared (matchedData), so unknown fields never reach a service.
// [BACKEND M2.6: Mass-assignment protection] e.g. a client-sent "status": "CONFIRMED" or "confirmedCount"
// is silently dropped because no validator declares it.
import { matchedData, validationResult } from 'express-validator';
import { AppError } from '../utils/AppError.js';

export function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const errors = result.array({ onlyFirstError: true }).map((e) => ({
      field: e.type === 'field' ? e.path : e.type,
      message: e.msg,
      location: e.type === 'field' ? e.location : undefined,
    }));
    return next(new AppError('Some fields are invalid', 400, 'VALIDATION_ERROR', errors));
  }
  req.valid = {
    params: matchedData(req, { locations: ['params'] }),
    query: matchedData(req, { locations: ['query'] }),
    body: matchedData(req, { locations: ['body'], includeOptionals: false }),
  };
  next();
}
