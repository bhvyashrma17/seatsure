// [BACKEND M3.11: Reliability engineering] Retry with exponential backoff + jitter, and timeouts.

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Re-runs `operation` when it fails with a *transient* error (decided by `shouldRetry`).
 * Delay doubles each attempt (base, 2x, 4x ... capped at maxMs) and is randomised ("jitter") so
 * many clients that failed together do not all retry at the same instant.
 */
export async function retry(operation, { retries = 3, baseMs = 40, maxMs = 1_000, shouldRetry = () => true, onRetry } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation(attempt);
    } catch (err) {
      if (attempt >= retries || !shouldRetry(err)) throw err;
      const delay = Math.round(Math.min(maxMs, baseMs * 2 ** attempt) * (0.5 + Math.random() / 2));
      onRetry?.(err, attempt + 1, delay);
      await sleep(delay);
    }
  }
}

export class TimeoutError extends Error {
  constructor(label, ms) {
    super(`${label} timed out after ${ms} ms`);
    this.name = 'TimeoutError';
  }
}

/** Rejects if `promise` has not settled within `ms`, so a slow dependency cannot hang a request. */
export function withTimeout(promise, ms, label = 'operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Exponential backoff used by the outbox dispatcher between delivery attempts (2 s .. 60 s). */
export function backoffMs(attempt, baseMs = 2_000, maxMs = 60_000) {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, attempt - 1));
}
