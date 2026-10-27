// [FULLSTACK M1.7: React.memo] The catalogue re-polls every 30 s and can hold dozens of cards. TanStack
// Query's structural sharing keeps unchanged events as the *same object*, so memoised cards whose
// data did not change skip re-rendering (measured by the render-count test FS-T27, EventCard.test.jsx).
import { memo } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '../../shared/components/Card.jsx';
import { SeatMeter } from '../../shared/components/SeatMeter.jsx';
import { CATEGORY_LABELS, formatRange } from '../../shared/lib/format.js';

function EventCardComponent({ event }) {
  return (
    <Card className="event-card">
      <Card.Header eyebrow={`${CATEGORY_LABELS[event.category]} · ${event.club?.name ?? ''}`} title={<Link to={`/events/${event.id}`}>{event.title}</Link>} />
      <Card.Body>
        <p className="event-card__meta">{formatRange(event.startsAt, event.endsAt)}</p>
        <p className="event-card__meta muted">
          {event.venue?.name}, {event.venue?.building}
        </p>
        <SeatMeter capacity={event.capacity} confirmed={event.confirmedCount} compact />
      </Card.Body>
      <Card.Footer>
        <Link className="btn btn--secondary btn--sm" to={`/events/${event.id}`}>
          {event.isFull ? 'Join waitlist' : 'View & register'}
        </Link>
      </Card.Footer>
    </Card>
  );
}

export const EventCard = memo(EventCardComponent);
