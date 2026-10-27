import { withTimeout } from '../utils/retry.js';

export function createHealthService({ pingPostgres, mongoState, outbox, registrations, dispatcher }) {
  return {
    async check() {
      let postgres = 'up';
      try {
        await withTimeout(pingPostgres(), 2_000, 'PostgreSQL ping');
      } catch {
        postgres = 'down';
      }
      const report = {
        postgres,
        mongo: mongoState(),
        uptimeSeconds: Math.round(process.uptime()),
        dispatcher: { delivered: dispatcher.stats.delivered, failed: dispatcher.stats.failed, lastError: dispatcher.stats.lastError },
      };
      if (postgres === 'up') {
        report.outbox = await outbox.stats();
        // Integrity probe: every event's confirmed_count equals its real confirmed rows.
        report.seatCounterMismatches = (await registrations.countMismatches()).length;
      }
      return report;
    },
  };
}
