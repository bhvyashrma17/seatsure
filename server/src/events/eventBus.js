// [BACKEND M3.12: Event-driven systems] A Node.js EventEmitter used as an in-process event bus.
// Producers announce past-tense facts ("registration.confirmed") without importing the code that
// reacts to them; subscribers (activity log, notifications) register themselves at start-up.
import { EventEmitter } from 'node:events';

export class EventBus extends EventEmitter {
  /**
   * Calls every listener for `type` and waits for all of them. Plain emit() is fire-and-forget,
   * but the outbox dispatcher must know whether delivery succeeded so it can retry, so a failing
   * listener makes publish() reject.
   */
  async publish(type, payload) {
    const listeners = this.listeners(type);
    const results = await Promise.allSettled(listeners.map((listener) => Promise.resolve().then(() => listener(payload))));
    const failures = results.filter((r) => r.status === 'rejected').map((r) => r.reason);
    if (failures.length) {
      throw new AggregateError(failures, `${failures.length} of ${listeners.length} subscribers failed for ${type}: ${failures[0]?.message}`);
    }
    return listeners.length;
  }
}

export function createEventBus() {
  const bus = new EventBus();
  bus.setMaxListeners(50);
  return bus;
}
