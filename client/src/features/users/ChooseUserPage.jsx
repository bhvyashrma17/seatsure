// Target of the Axios 401 interceptor: pick who you are acting as.
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card } from '../../shared/components/Card.jsx';
import { Spinner } from '../../shared/components/Feedback.jsx';
import { useCurrentUser } from './CurrentUserContext.jsx';
import { useDemoUsers } from './useDemoUsers.js';

export function ChooseUserPage() {
  const { setUserId } = useCurrentUser();
  const { data: users, isPending } = useDemoUsers();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const next = params.get('next') || '/events';

  if (isPending) return <Spinner label="Loading demo users" />;
  const featured = [users.find((u) => u.name === 'Priya Singh'), ...users.filter((u) => u.role === 'ORGANISER').slice(0, 3)].filter(Boolean);

  function choose(id) {
    setUserId(id);
    navigate(next, { replace: true });
  }

  return (
    <section className="page page--narrow">
      <h1>Who are you today?</h1>
      <p className="lead">SeatSure uses demo identities instead of passwords (login is a later module). Pick a person to act as.</p>
      <div className="grid grid--2">
        {featured.map((u) => (
          <Card key={u.id}>
            <Card.Header eyebrow={u.role === 'ORGANISER' ? 'Organiser' : 'Student'} title={u.name} />
            <Card.Body>
              <p className="muted">{u.department}</p>
            </Card.Body>
            <Card.Footer>
              <button className="btn btn--primary btn--sm" onClick={() => choose(u.id)}>
                Continue as {u.name.split(' ')[0]}
              </button>
            </Card.Footer>
          </Card>
        ))}
      </div>
      <p className="muted small">You can switch to any of the {users.length} seeded users from the menu at the top right.</p>
    </section>
  );
}
