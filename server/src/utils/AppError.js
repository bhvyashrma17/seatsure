// [BACKEND M2.7: Error handling architecture] An *expected* failure with an HTTP meaning.
// Services throw it; they never call res.status() themselves. The central error handler turns it
// into the standard error envelope. `isOperational` marks it as safe to show to the client.
export class AppError extends Error {
  /**
   * @param {string} message  human-readable, safe to show to the user
   * @param {number} statusCode  HTTP status (4xx for client problems, 503 for dependencies)
   * @param {string} [code]  stable machine-readable code the client can branch on
   * @param {Array<{field: string, message: string}>} [errors]  per-field problems (validation)
   */
  constructor(message, statusCode = 400, code = undefined, errors = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.status = String(statusCode).startsWith('4') ? 'fail' : 'error';
    this.code = code ?? defaultCode(statusCode);
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

function defaultCode(statusCode) {
  return (
    {
      400: 'BAD_REQUEST',
      401: 'UNAUTHENTICATED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      413: 'PAYLOAD_TOO_LARGE',
      422: 'UNPROCESSABLE',
      503: 'SERVICE_UNAVAILABLE',
    }[statusCode] ?? 'ERROR'
  );
}
