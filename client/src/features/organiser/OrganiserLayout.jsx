// [FULLSTACK M1.10: Layout route] Shared organiser chrome (sub-navigation + access check) around an
// <Outlet/> where the child route renders. This whole area is lazy-loaded ([FULLSTACK M1.8]).
import { NavLink, Outlet } from 'react-router-dom';
import { EmptyState } from '../../shared/components/Feedback.jsx';
import { useCurrentUser } from '../users/index.js';

export default function OrganiserLayout() {
  const { user, isLoading } = useCurrentUser();
  if (isLoading) return null;
  if (user?.role !== 'ORGANISER') {
    return (
      <section className="page page--narrow">
        <EmptyState title="Organisers only">Switch to an organiser (top right) to manage events.</EmptyState>
      </section>
    );
  }
  return (
    <section className="page">
      <header className="page__header">
        <div>
          <p className="eyebrow">Organiser · {user.clubs.map((c) => c.name).join(', ')}</p>
          <h1>Organiser dashboard</h1>
        </div>
      </header>
      <nav className="subnav" aria-label="Organiser">
        <NavLink end to="/organiser">
          My events
        </NavLink>
        <NavLink to="/organiser/events/new">New event</NavLink>
        <NavLink to="/organiser/analytics">Analytics</NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
