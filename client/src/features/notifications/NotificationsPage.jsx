import { Card } from '../../shared/components/Card.jsx';
import { Button } from '../../shared/components/Button.jsx';
import { EmptyState, ErrorState, Spinner } from '../../shared/components/Feedback.jsx';
import { timeAgo } from '../../shared/lib/format.js';
import { useMarkAllRead, useNotifications } from './hooks/useNotifications.js';

export default function NotificationsPage() {
  const { data, error, isPending, refetch } = useNotifications();
  const markAll = useMarkAllRead();

  if (isPending) return <Spinner label="Loading notifications" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const items = data.data;
  const { unread, degraded } = data.meta;
  return (
    <section className="page page--narrow">
      <header className="page__header">
        <div>
          <h1>Notifications</h1>
          <p className="lead">{degraded ? 'Status unknown while notifications are offline' : `${unread ? `${unread} unread` : 'All caught up'} · auto-deleted after 30 days`}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => markAll.mutate()} disabled={!unread || degraded} loading={markAll.isPending}>
          Mark all read
        </Button>
      </header>
      {degraded && <p className="notice notice--warning">Notifications are temporarily unavailable (MongoDB is offline). Your registrations are safe.</p>}
      {!degraded && items.length === 0 ? (
        <EmptyState title="No notifications yet">Register for an event and updates will appear here.</EmptyState>
      ) : (
        <div className="stack">
          {items.map((n) => (
            <Card key={n._id} className={`notification ${n.readAt ? '' : 'notification--unread'}`}>
              <Card.Header title={n.title} eyebrow={n.type.replaceAll('_', ' ').toLowerCase()} actions={<time className="muted small">{timeAgo(n.createdAt)}</time>} />
              <Card.Body>
                <p>{n.message}</p>
              </Card.Body>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
