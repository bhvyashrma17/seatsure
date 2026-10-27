// [BACKEND M2.4: Middleware pipeline] Gives every request an id that is echoed in the X-Request-Id
// header, written in every log line and included in error bodies, so one failing request can be
// traced from the browser's Network tab to the server log.
import { randomUUID } from 'node:crypto';

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function requestId(req, res, next) {
  // Trust boundary ([BACKEND M3.3]): reuse a caller-supplied id only if it looks like an id.
  const incoming = req.get('X-Request-Id');
  req.id = incoming && SAFE_ID.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
