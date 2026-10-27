// Recent activity from MongoDB. If MongoDB is down, the API answers degraded: true and this panel
// says so, while the rest of the page (PostgreSQL data) keeps working.
import { Card } from '../../shared/components/Card.jsx';
import { timeAgo } from '../../shared/lib/format.js';
import { useEventActivity } from './hooks/useEvents.js';

const VERBS = {
  REGISTERED: 'registered',
  WAITLISTED: 'joined the waitlist',
  PROMOTED: 'moved off the waitlist',
  CANCELLED: 'cancelled',
  CHECKED_IN: 'checked in',
  EVENT_PUBLISHED: 'published this event',
  CAPACITY_CHANGED: 'changed the capacity',
};

export function ActivityFeed({ eventId }) {
  const { data, isPending } = useEventActivity(eventId);
  const degraded = data?.meta?.degraded;
  const items = data?.data ?? [];

  return (
    <Card>
      <Card.Header title="Live activity" eyebrow="From MongoDB" />
      <Card.Body>
        {isPending ? (
          <p className="muted">Loading…</p>
        ) : degraded ? (
          <p className="notice notice--warning">Activity is temporarily unavailable. Registrations still work normally.</p>
        ) : items.length === 0 ? (
          <p className="muted">No activity yet.</p>
        ) : (
          <ul className="feed">
            {items.map((a) => (
              <li key={a._id} className="feed__item">
                <span className={`feed__dot feed__dot--${a.action.toLowerCase()}`} aria-hidden="true" />
                <span>
                  <strong>{a.actor?.name ?? 'Someone'}</strong> {VERBS[a.action] ?? a.action.toLowerCase()}
                  {a.meta?.position ? ` (#${a.meta.position})` : ''}
                </span>
                <time className="muted small" dateTime={a.at}>
                  {timeAgo(a.at)}
                </time>
              </li>
            ))}
          </ul>
        )}
      </Card.Body>
    </Card>
  );
}
