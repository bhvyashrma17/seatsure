// [BACKEND M2.4: Middleware pipeline] Timing + logging middleware.
// Measures how long the request took, exposes it as X-Response-Time and logs one line per request.
import { logger } from '../utils/logger.js';

export function requestTimer(req, res, next) {
  const start = process.hrtime.bigint();
  const elapsedMs = () => Number(process.hrtime.bigint() - start) / 1e6;

  // Headers must be set before they are sent, so hook the moment they are written.
  const writeHead = res.writeHead;
  res.writeHead = function patchedWriteHead(...args) {
    if (!res.headersSent) res.setHeader('X-Response-Time', `${elapsedMs().toFixed(1)}ms`);
    return writeHead.apply(this, args);
  };

  res.on('finish', () => {
    const fields = { id: req.id, ms: Number(elapsedMs().toFixed(1)), user: req.user?.id };
    const line = `${req.method} ${req.originalUrl} -> ${res.statusCode}`;
    if (res.statusCode >= 500) logger.error(line, fields);
    else if (res.statusCode >= 400) logger.warn(line, fields);
    else logger.info(line, fields);
  });
  next();
}
