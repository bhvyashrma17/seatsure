// [BACKEND M3.11 + M3.12] Retries, timeouts, the event bus and the outbox dispatcher.
import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../../src/events/eventBus.js';
import { createOutboxDispatcher } from '../../src/events/outboxDispatcher.js';
import { csvLine } from '../../src/services/registrationService.js';
import { backoffMs, retry, TimeoutError, withTimeout } from '../../src/utils/retry.js';

describe('retry and timeout helpers', () => {
  it('BE-U31 retries transient failures with growing delays, then succeeds', async () => {
    const delays = [];
    let calls = 0;
    const result = await retry(
      async () => {
        calls++;
        if (calls < 3) throw Object.assign(new Error('busy'), { transient: true });
        return 'ok';
      },
      { retries: 3, baseMs: 5, shouldRetry: (e) => e.transient, onRetry: (_e, _n, delay) => delays.push(delay) },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
    expect(delays[1]).toBeGreaterThanOrEqual(delays[0] * 0.9); // exponential-ish (with jitter)
  });

  it('BE-U32 gives up after the retry budget and never retries permanent errors', async () => {
    const op = vi.fn().mockRejectedValue(new Error('nope'));
    await expect(retry(op, { retries: 2, baseMs: 1 })).rejects.toThrow('nope');
    expect(op).toHaveBeenCalledTimes(3);
    const permanent = vi.fn().mockRejectedValue(new Error('bad input'));
    await expect(retry(permanent, { retries: 5, baseMs: 1, shouldRetry: () => false })).rejects.toThrow();
    expect(permanent).toHaveBeenCalledTimes(1);
  });

  it('BE-U33 withTimeout rejects slow work and backoff caps at 60 s', async () => {
    await expect(withTimeout(new Promise((r) => setTimeout(r, 200)), 20, 'slow call')).rejects.toBeInstanceOf(TimeoutError);
    expect([1, 2, 3, 10].map((n) => backoffMs(n))).toEqual([2000, 4000, 8000, 60000]);
  });
});

describe('event bus (EventEmitter)', () => {
  it('BE-U34 publish() waits for every subscriber and reports failures', async () => {
    const bus = createEventBus();
    const seen = [];
    bus.on('registration.confirmed', async (m) => seen.push(`activity:${m.id}`));
    bus.on('registration.confirmed', async (m) => seen.push(`notify:${m.id}`));
    expect(await bus.publish('registration.confirmed', { id: 1 })).toBe(2);
    expect(seen).toEqual(['activity:1', 'notify:1']);

    bus.on('registration.cancelled', async () => {
      throw new Error('mongo down');
    });
    await expect(bus.publish('registration.cancelled', {})).rejects.toThrow(/1 of 1 subscribers failed/);
  });
});

describe('outbox dispatcher', () => {
  function fakeOutbox(messages) {
    return {
      pending: [...messages],
      published: [],
      failed: [],
      async fetchDue(limit) {
        return this.pending.slice(0, limit);
      },
      async markPublished(id) {
        this.published.push(id);
        this.pending = this.pending.filter((m) => m.id !== id);
      },
      async markFailed(id, error, nextAt) {
        this.failed.push({ id, error, nextAt });
        this.pending = this.pending.filter((m) => m.id !== id); // not due again until nextAt
      },
    };
  }

  it('BE-U35 delivers due messages in order and marks them published', async () => {
    const outbox = fakeOutbox([{ id: 1n, type: 't', payload: { a: 1 }, attempts: 0 }, { id: 2n, type: 't', payload: { a: 2 }, attempts: 0 }]);
    const bus = createEventBus();
    const got = [];
    bus.on('t', async (m) => got.push(m));
    const d = createOutboxDispatcher({ outbox, bus });
    await d.drain();
    expect(outbox.published).toEqual([1n, 2n]);
    expect(got.map((m) => m.outboxId)).toEqual(['1', '2']); // idempotency key travels with the message
  });

  it('BE-U36 on failure schedules a retry with backoff and stops the round', async () => {
    const outbox = fakeOutbox([{ id: 1n, type: 't', payload: {}, attempts: 2 }, { id: 2n, type: 't', payload: {}, attempts: 0 }]);
    const bus = createEventBus();
    bus.on('t', async () => {
      throw new Error('MongoDB unreachable');
    });
    const now = new Date('2026-10-26T10:00:00Z');
    const d = createOutboxDispatcher({ outbox, bus, clock: () => now });
    await d.runOnce();
    expect(outbox.failed).toHaveLength(1); // second message not attempted this round
    expect(outbox.failed[0].nextAt.getTime() - now.getTime()).toBe(8000); // attempt 3 -> 8 s
    expect(outbox.published).toEqual([]);
  });

  it('BE-U37 a stuck subscriber is cut off by the delivery timeout', async () => {
    const outbox = fakeOutbox([{ id: 1n, type: 't', payload: {}, attempts: 0 }]);
    const bus = createEventBus();
    bus.on('t', () => new Promise(() => {})); // never settles
    const d = createOutboxDispatcher({ outbox, bus, deliveryTimeoutMs: 30 });
    await d.runOnce();
    expect(outbox.failed[0].error).toMatch(/timed out/);
  });
});

describe('CSV export rows', () => {
  it('BE-U38 quotes commas/quotes and neutralises spreadsheet formulas', () => {
    expect(csvLine(['Priya', 'a,b', 'say "hi"'])).toBe('Priya,"a,b","say ""hi"""\n');
    expect(csvLine(['=HYPERLINK("evil")'])).toBe(`"'=HYPERLINK(""evil"")"\n`);
  });
});
