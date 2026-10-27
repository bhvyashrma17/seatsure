// [FULLSTACK M1.10: Layout route] Header + navigation shared by every page; the current page renders in
// <Outlet/>. [FULLSTACK M1.9] The outlet is wrapped in an error boundary that resets on navigation, so a
// crash on one page never takes down the header (or the whole app).
import { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ErrorFallback, Spinner } from '../shared/components/Feedback.jsx';
import { NotificationBell } from '../features/notifications/index.js';
import { UserSwitcher, useCurrentUser } from '../features/users/index.js';

export function AppLayout() {
  const location = useLocation();
  const { user, isOrganiser } = useCurrentUser();

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/events" className="brand" aria-label="SeatSure home">
          <span className="brand__mark" aria-hidden="true">✓</span>
          <span className="brand__name">SeatSure</span>
        </Link>
        <nav className="topbar__nav" aria-label="Main">
          <NavLink to="/events">Events</NavLink>
          {user && <NavLink to="/me/passes">My passes</NavLink>}
          {user && <NavLink to="/me/tasks">My tasks</NavLink>}
          {isOrganiser && <NavLink to="/organiser">Organiser</NavLink>}
        </nav>
        <div className="topbar__right">
          {user && <NotificationBell />}
          <UserSwitcher />
        </div>
      </header>
      <main className="main">
        <ErrorBoundary FallbackComponent={ErrorFallback} resetKeys={[location.pathname]}>
          {/* [FULLSTACK M1.8] Lazy pages show this fallback while their chunk downloads. */}
          <Suspense fallback={<Spinner label="Loading page" />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      <footer className="footer muted small">SeatSure · integrated micro project (Full Stack · Backend · Advanced Database)</footer>
    </div>
  );
}
