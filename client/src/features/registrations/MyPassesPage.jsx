import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, Spinner } from '../../shared/components/Feedback.jsx';
import { useToast } from '../../shared/components/Toast.jsx';
import { useCurrentUser } from '../users/index.js';
import { useCancelRegistration, useMyRegistrations } from './hooks/useMyRegistrations.js';
import { PassCard } from './PassCard.jsx';

const TABS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
  { id: 'cancelled', label: 'Cancelled' },
];

export default function MyPassesPage() {
  const { user } = useCurrentUser();
  const toast = useToast();
  const [tab, setTab] = useState('upcoming');
  const { data, error, isPending, refetch } = useMyRegistrations();
  const cancel = useCancelRegistration();

  const groups = useMemo(() => {
    const now = new Date();
    const all = data?.data ?? [];
    return {
      upcoming: all.filter((p) => p.status !== 'CANCELLED' && new Date(p.event?.startsAt) > now),
      past: all.filter((p) => p.status !== 'CANCELLED' && new Date(p.event?.startsAt) <= now),
      cancelled: all.filter((p) => p.status === 'CANCELLED'),
    };
  }, [data]);

  function handleCancel(pass) {
    cancel.mutate(
      { registrationId: pass.id, eventId: pass.event?.id },
      {
        onSuccess: (res) => toast.show(res.data.promoted ? 'Cancelled. Your seat passed to the next person on the waitlist.' : 'Registration cancelled.', { tone: 'info' }),
        onError: (err) => toast.show(`Could not cancel: ${err.message}`, { tone: 'error' }),
      },
    );
  }

  if (isPending) return <Spinner label="Loading your passes" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const list = groups[tab];
  return (
    <section className="page">
      <header className="page__header">
        <div>
          <h1>My passes</h1>
          <p className="lead">{user ? `${user.name}'s registrations` : 'Your registrations'}</p>
        </div>
      </header>
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} className={`tab ${tab === t.id ? 'tab--active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label} <span className="tab__count">{groups[t.id].length}</span>
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <EmptyState title={tab === 'upcoming' ? 'No upcoming passes yet' : 'Nothing here'} action={tab === 'upcoming' && <Link className="btn btn--primary btn--sm" to="/events">Browse events</Link>} />
      ) : (
        <div className="grid grid--cards">
          {list.map((pass) => (
            <PassCard key={pass.id} pass={pass} onCancel={handleCancel} cancelling={cancel.isPending && cancel.variables?.registrationId === pass.id} />
          ))}
        </div>
      )}
    </section>
  );
}
