// [FULLSTACK M3.5: Rendering nested include data] Each pass carries registration -> event -> club/venue
// from one Prisma include. Optional chaining guards against missing nested data.
import { Link } from 'react-router-dom';
import { Badge } from '../../shared/components/Badge.jsx';
import { Button } from '../../shared/components/Button.jsx';
import { Card } from '../../shared/components/Card.jsx';
import { formatDateTime, formatRange } from '../../shared/lib/format.js';

export function PassCard({ pass, onCancel, cancelling }) {
  const event = pass.event ?? {};
  const upcoming = new Date(event.startsAt) > new Date();
  const canCancel = upcoming && pass.status !== 'CANCELLED';

  return (
    <Card className={`pass pass--${pass.status.toLowerCase()}`}>
      <Card.Header
        eyebrow={event.club?.name ?? 'Club'}
        title={<Link to={`/events/${event.id}`}>{event.title ?? 'Event'}</Link>}
        actions={<Badge>{pass.status}</Badge>}
      />
      <Card.Body>
        <p>{formatRange(event.startsAt, event.endsAt)}</p>
        <p className="muted">{event.venue ? `${event.venue.name}, ${event.venue.building}` : 'Venue to be announced'}</p>
        {pass.status === 'WAITLISTED' && pass.position && (
          <p className="notice notice--warning">
            Waitlist position <strong>#{pass.position}</strong>
          </p>
        )}
        {pass.promotedAt && pass.status === 'CONFIRMED' && <p className="notice notice--success">Promoted from the waitlist {formatDateTime(pass.promotedAt)}</p>}
        {pass.checkedInAt && <p className="muted small">Checked in {formatDateTime(pass.checkedInAt)}</p>}
        {event.status === 'CANCELLED' && <p className="notice notice--error">The organiser cancelled this event.</p>}
      </Card.Body>
      {canCancel && (
        <Card.Footer>
          <Button variant="ghost" size="sm" onClick={() => onCancel(pass)} loading={cancelling}>
            Cancel registration
          </Button>
        </Card.Footer>
      )}
    </Card>
  );
}
