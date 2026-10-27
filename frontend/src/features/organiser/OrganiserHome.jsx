import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../shared/components/Badge.jsx';
import { Button } from '../../shared/components/Button.jsx';
import { EmptyState, ErrorState, Spinner } from '../../shared/components/Feedback.jsx';
import { Pagination } from '../../shared/components/Pagination.jsx';
import { SeatMeter } from '../../shared/components/SeatMeter.jsx';
import { useToast } from '../../shared/components/Toast.jsx';
import { formatDateTime } from '../../shared/lib/format.js';
import { useDeleteEvent, useMyClubEvents, useUpdateEvent } from './hooks/useOrganiser.js';

export default function OrganiserHome() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const toast = useToast();
  const params = { page, pageSize: 8, ...(status ? { status } : {}) };
  const { data, error, isPending, isPlaceholderData, refetch } = useMyClubEvents(params);
  const update = useUpdateEvent();
  const remove = useDeleteEvent();

  function publish(event) {
    update.mutate(
      { eventId: event.id, changes: { status: 'PUBLISHED' } },
      { onSuccess: () => toast.show(`"${event.title}" is now live`, { tone: 'success' }), onError: (e) => toast.show(e.message, { tone: 'error' }) },
    );
  }

  function deleteDraft(event) {
    if (!window.confirm(`Delete the draft "${event.title}"?`)) return;
    remove.mutate(event.id, { onSuccess: () => toast.show('Draft deleted'), onError: (e) => toast.show(e.message, { tone: 'error' }) });
  }

  if (isPending) return <Spinner label="Loading your events" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const { data: events, meta } = data;

  return (
    <div className="stack">
      <div className="toolbar">
        <select className="input" value={status} onChange={(e) => (setStatus(e.target.value), setPage(1))} aria-label="Status filter">
          <option value="">All statuses</option>
          <option value="DRAFT">Drafts</option>
          <option value="PUBLISHED">Published</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <Link className="btn btn--primary btn--sm" to="/organiser/events/new">
          + New event
        </Link>
      </div>
      {events.length === 0 ? (
        <EmptyState title="No events here yet" />
      ) : (
        <div className={`table-wrap ${isPlaceholderData ? 'is-stale' : ''}`}>
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Starts</th>
                <th>Status</th>
                <th>Seats</th>
                <th>Waitlist</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link to={`/events/${e.id}`}>{e.title}</Link>
                    <div className="muted small">{e.club?.name}</div>
                  </td>
                  <td>{formatDateTime(e.startsAt)}</td>
                  <td>
                    <Badge>{e.status}</Badge>
                  </td>
                  <td className="table__meter">
                    <SeatMeter capacity={e.capacity} confirmed={e.confirmedCount} compact />
                  </td>
                  <td>{e.waitlistCount}</td>
                  <td className="table__actions">
                    {e.status === 'DRAFT' ? (
                      <>
                        <Button size="sm" onClick={() => publish(e)} loading={update.isPending && update.variables?.eventId === e.id}>
                          Publish
                        </Button>
                        <Link className="btn btn--ghost btn--sm" to={`/organiser/events/${e.id}/edit`}>
                          Edit
                        </Link>
                        <Button size="sm" variant="ghost" onClick={() => deleteDraft(e)}>
                          Delete
                        </Button>
                      </>
                    ) : (
                      <>
                        <Link className="btn btn--secondary btn--sm" to={`/organiser/events/${e.id}/attendees`}>
                          Attendees
                        </Link>
                        <Link className="btn btn--ghost btn--sm" to={`/organiser/events/${e.id}/edit`}>
                          Edit
                        </Link>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} onPageChange={setPage} disabled={isPlaceholderData} />
    </div>
  );
}
