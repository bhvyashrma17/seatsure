// [BACKEND M1.6 + M1.15: JSON contract] Every success response has the same envelope:
//   { "status": "success", "data": ..., "meta": { ... } }
// (errors use { "status": "fail" | "error", "code", "message", "errors"?, "requestId" }).
export function ok(res, data, meta) {
  return res.status(200).json(meta ? { status: 'success', data, meta } : { status: 'success', data });
}

export function created(res, data, location) {
  if (location) res.location(location);
  return res.status(201).json({ status: 'success', data });
}

export function noContent(res) {
  return res.status(204).end();
}
