// MongoDB-backed reads (notifications and activity feeds), wrapped for graceful degradation:
// a MongoDB outage costs these features only; registrations keep working on PostgreSQL.
import { withTimeout } from '../utils/retry.js';

export function createFeedService({ store, mongoState, mongoTimeoutMs }) {
  async function guarded(label, work, fallback) {
    if (mongoState() !== 'up') return { ...fallback, degraded: true };
    try {
      return { ...(await withTimeout(work(), mongoTimeoutMs, label)), degraded: false };
    } catch {
      return { ...fallback, degraded: true };
    }
  }

  return {
    notifications(user) {
      return guarded('notifications', () => store.listNotifications(user.id, 25), { items: [], unread: 0 });
    },

    async markAllRead(user) {
      return guarded('mark notifications read', async () => ({ updated: await store.markAllNotificationsRead(user.id) }), { updated: 0 });
    },

    eventActivity(eventId) {
      return guarded('event activity', async () => ({ items: await store.eventFeed(eventId, 15) }), { items: [] });
    },
  };
}
