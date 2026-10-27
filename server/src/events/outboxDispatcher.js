// Delivers transactional-outbox messages from PostgreSQL to the event bus (and so to MongoDB).
// [BACKEND M3.11: Reliability]
//  - timeout: a stuck subscriber cannot block delivery forever
//  - retry with exponential backoff: a failed message is rescheduled 2 s, 4 s, 8 s ... 60 s later
//  - idempotent subscribers (unique outboxId) make at-least-once delivery safe
import { backoffMs, withTimeout } from '../utils/retry.js';
import { logger } from '../utils/logger.js';

export function createOutboxDispatcher({ outbox, bus, batchSize = 100, intervalMs = 2_000, deliveryTimeoutMs = 5_000, clock = () => new Date() }) {
  let timer = null;
  let busy = false;
  // Every delivery round runs one at a time (the interval, kick() and drain() share this chain),
  // so two rounds can never fetch and deliver the same message concurrently.
  let chain = Promise.resolve();
  const exclusive = (work) => {
    const run = chain.then(work, work);
    chain = run.catch(() => {});
    return run;
  };
  const stats = { delivered: 0, failed: 0, lastError: null, lastRunAt: null };

  async function deliver(message) {
    try {
      // The idempotency key travels with the message so subscribers can ignore re-deliveries.
      const outboxId = message.messageId ?? String(message.id);
      await withTimeout(bus.publish(message.type, { ...message.payload, outboxId }), deliveryTimeoutMs, `deliver ${message.type}`);
      await outbox.markPublished(message.id);
      stats.delivered++;
      return true;
    } catch (err) {
      const attempts = message.attempts + 1;
      await outbox.markFailed(message.id, err.message, new Date(clock().getTime() + backoffMs(attempts)));
      stats.failed++;
      stats.lastError = err.message;
      logger.warn('Outbox delivery failed; will retry', { id: String(message.id), type: message.type, attempts, error: err.message });
      return false;
    }
  }

  /** Delivers one batch of due messages. Returns how many were attempted. */
  async function runOnce() {
    const due = await outbox.fetchDue(batchSize, clock());
    stats.lastRunAt = clock();
    for (const message of due) {
      const ok = await deliver(message);
      // If the consumer side is down, stop this round; backoff schedules the rest.
      if (!ok) break;
    }
    return due.length;
  }

  /** Runs batches back-to-back until nothing is due (used at start-up and in tests). */
  function drain(maxBatches = 1_000) {
    return exclusive(async () => {
      let total = 0;
      for (let i = 0; i < maxBatches; i++) {
        const before = stats.failed;
        const n = await runOnce();
        total += n;
        if (n < batchSize || stats.failed > before) break;
      }
      return total;
    });
  }

  function tick() {
    if (busy) return chain; // a round is already queued or running
    busy = true;
    return exclusive(runOnce)
      .catch((err) => logger.error('Outbox dispatcher error', { error: err.message }))
      .finally(() => {
        busy = false;
      });
  }

  return {
    stats,
    runOnce: () => exclusive(runOnce),
    drain,
    /** Ask for a delivery round now (called right after a transaction commits). */
    kick: () => setImmediate(tick),
    start() {
      if (!timer) timer = setInterval(tick, intervalMs);
      timer.unref?.();
    },
    async stop() {
      clearInterval(timer);
      timer = null;
      await chain;
    },
  };
}
