import { Link, useParams } from 'react-router-dom';
import { Badge } from '../../shared/components/Badge.jsx';
import { Card } from '../../shared/components/Card.jsx';
import { ErrorState, Spinner } from '../../shared/components/Feedback.jsx';
import { SeatMeter } from '../../shared/components/SeatMeter.jsx';
import { CATEGORY_LABELS, formatRange } from '../../shared/lib/format.js';
import { ActivityFeed } from './ActivityFeed.jsx';
import { useEvent } from './hooks/useEvents.js';
import { RegistrationPanel } from './RegistrationPanel.jsx';

export default function EventDetailPage() {
  const { eventId } = useParams();
  const { data: event, error, isPending, refetch, isFetching } = useEvent(eventId);

  if (isPending) return <Spinner label="Loading event" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <section className="page">
      <nav className="breadcrumbs">
        <Link to="/events">← All events</Link>
      </nav>
      <header className="page__header">
        <div>
          <p className="eyebrow">
            {CATEGORY_LABELS[event.category]} · {event.club?.name}
          </p>
          <h1>{event.title}</h1>
          <p className="lead">{formatRange(event.startsAt, event.endsAt)}</p>
        </div>
        <div className="page__header-actions">
          {event.status !== 'PUBLISHED' && <Badge>{event.status}</Badge>}
          {event.canManage && (
            <>
              <Link className="btn btn--secondary btn--sm" to={`/organiser/events/${event.id}/attendees`}>
                Attendees
              </Link>
              <Link className="btn btn--ghost btn--sm" to={`/organiser/events/${event.id}/edit`}>
                Edit
              </Link>
            </>
          )}
        </div>
      </header>

      <div className="layout-2col">
        <div className="stack">
          <Card>
            <Card.Header title="Seats" actions={<span className={`pill ${isFetching ? 'pill--live' : 'pill--quiet'}`}>● Live</span>} />
            <Card.Body>
              <SeatMeter capacity={event.capacity} confirmed={event.confirmedCount} />
              <p className="muted small">
                {event.confirmedCount} confirmed · {event.waitlistCount} on the waitlist · updates every 5 seconds
              </p>
            </Card.Body>
          </Card>
          <Card>
            <Card.Header title="About this event" />
            <Card.Body>
              <p>{event.description}</p>
              <dl className="details">
                <dt>Venue</dt>
                <dd>
                  {event.venue?.name}, {event.venue?.building} ({event.venue?.capacity} seats)
                </dd>
                <dt>Organised by</dt>
                <dd>{event.club?.name}</dd>
              </dl>
            </Card.Body>
          </Card>
          <ActivityFeed eventId={event.id} />
        </div>
        <aside className="stack">
          <RegistrationPanel event={event} />
        </aside>
      </div>
    </section>
  );
}
