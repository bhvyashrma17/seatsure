// Organiser attendee list.
// [FULLSTACK M3.8: Offset pagination] page -> ?page=&pageSize= -> Prisma/SQL OFFSET/LIMIT -> meta.totalPages.
// [FULLSTACK M3.7: Filtering] status / name search / answer filters flow React state -> Axios params ->
// Express query -> SQL WHERE (the answer filter uses JSONB containment on the server).
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge } from '../../shared/components/Badge.jsx';
import { Button } from '../../shared/components/Button.jsx';
import { ErrorState, Spinner } from '../../shared/components/Feedback.jsx';
import { Pagination } from '../../shared/components/Pagination.jsx';
import { SeatMeter } from '../../shared/components/SeatMeter.jsx';
import { useToast } from '../../shared/components/Toast.jsx';
import { useDebouncedValue } from '../../shared/hooks/useDebouncedValue.js';
import { formatDateTime } from '../../shared/lib/format.js';
import { registrationsApi } from '../../services/registrationsApi.js';
import { useAttendees, useCheckIn } from './hooks/useOrganiser.js';

export default function AttendeesPage() {
  const { eventId } = useParams();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [answerFilter, setAnswerFilter] = useState({ questionId: '', value: '' });
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  const params = useMemo(
    () => ({
      page,
      pageSize: 15,
      ...(status ? { status } : {}),
      ...(debouncedSearch ? { search: debouncedSearch } : {}),
      ...(answerFilter.questionId && answerFilter.value ? { answers: { [answerFilter.questionId]: answerFilter.value } } : {}),
    }),
    [page, status, debouncedSearch, answerFilter],
  );

  const { data, error, isPending, isPlaceholderData, refetch } = useAttendees(eventId, params);
  const checkIn = useCheckIn(eventId);
  const [exporting, setExporting] = useState(false);

  if (isPending) return <Spinner label="Loading attendees" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const { data: rows, meta } = data;
  const event = meta.event;
  const questions = event.questions ?? [];
  const filterQuestion = questions.find((q) => q.id === answerFilter.questionId);

  async function exportCsv() {
    setExporting(true);
    try {
      await registrationsApi.downloadCsv(eventId);
    } catch (err) {
      toast.show(err.message, { tone: 'error' });
    } finally {
      setExporting(false);
    }
  }

  function doCheckIn(row) {
    checkIn.mutate(row.id, {
      onSuccess: (res) => toast.show(res.data.alreadyCheckedIn ? `${row.name} was already checked in` : `${row.name} checked in`, { tone: 'success' }),
      onError: (err) => toast.show(err.message, { tone: 'error' }),
    });
  }

  const resetPage = (fn) => (...args) => {
    fn(...args);
    setPage(1);
  };

  return (
    <div className="stack">
      <div className="toolbar toolbar--spread">
        <div>
          <Link to={`/events/${event.id}`} className="muted small">
            ← {event.title}
          </Link>
          <SeatMeter capacity={event.capacity} confirmed={event.confirmedCount} compact />
        </div>
        <Button variant="secondary" size="sm" onClick={exportCsv} loading={exporting}>
          Export CSV
        </Button>
      </div>

      <div className="filters">
        <input className="input" type="search" placeholder="Search name or email…" value={search} onChange={(e) => resetPage(setSearch)(e.target.value)} aria-label="Search attendees" />
        <select className="input" value={status} onChange={(e) => resetPage(setStatus)(e.target.value)} aria-label="Status">
          <option value="">All statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="WAITLISTED">Waitlisted</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        {questions.length > 0 && (
          <>
            <select className="input" value={answerFilter.questionId} onChange={(e) => resetPage(setAnswerFilter)({ questionId: e.target.value, value: '' })} aria-label="Filter by answer">
              <option value="">Filter by answer…</option>
              {questions
                .filter((q) => q.type !== 'text')
                .map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.label}
                  </option>
                ))}
            </select>
            {filterQuestion && (
              <select className="input" value={answerFilter.value} onChange={(e) => resetPage(setAnswerFilter)({ ...answerFilter, value: e.target.value })} aria-label="Answer value">
                <option value="">Any answer</option>
                {(filterQuestion.type === 'boolean' ? ['true', 'false'] : filterQuestion.options).map((o) => (
                  <option key={o} value={o}>
                    {o === 'true' ? 'Yes' : o === 'false' ? 'No' : o}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
      </div>

      <div className={`table-wrap ${isPlaceholderData ? 'is-stale' : ''}`}>
        <table className="table">
          <thead>
            <tr>
              <th>Attendee</th>
              <th>Status</th>
              {questions.map((q) => (
                <th key={q.id}>{q.label}</th>
              ))}
              <th>Registered</th>
              <th>Check-in</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4 + questions.length} className="muted center">
                  No attendees match these filters
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.name}</strong>
                  <div className="muted small">
                    {r.email} · {r.department ?? '-'}
                  </div>
                </td>
                <td>
                  <Badge>{r.status}</Badge>
                  {r.waitlistPosition && <span className="muted small"> #{r.waitlistPosition}</span>}
                </td>
                {questions.map((q) => (
                  <td key={q.id}>{formatAnswer(r.answers?.[q.id])}</td>
                ))}
                <td className="small">{formatDateTime(r.createdAt)}</td>
                <td>
                  {r.checkedInAt ? (
                    <span className="muted small">✓ {formatDateTime(r.checkedInAt)}</span>
                  ) : r.status === 'CONFIRMED' && event.checkInOpen ? (
                    <Button size="sm" variant="secondary" onClick={() => doCheckIn(r)} loading={checkIn.isPending && checkIn.variables === r.id}>
                      Check in
                    </Button>
                  ) : r.status === 'CONFIRMED' ? (
                    <span className="muted small">{new Date(event.startsAt) > new Date() ? 'Opens 2 h before start' : 'Check-in closed'}</span>
                  ) : (
                    <span className="muted small">-</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={meta.page} totalPages={meta.totalPages} total={meta.total} onPageChange={setPage} disabled={isPlaceholderData} />
    </div>
  );
}

function formatAnswer(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return value ?? <span className="muted">-</span>;
}
