// [FULLSTACK M1.10: Nested routes] One layout route (AppLayout) with child routes rendered in its
// <Outlet/>; the organiser area is a second, nested layout route.
// [FULLSTACK M1.8: Code splitting] Every page is loaded on demand with React.lazy, so a student who
// never opens the organiser area never downloads its JavaScript.
import { lazy } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import { ChooseUserPage } from '../features/users/index.js';
import { AppLayout } from '../layouts/AppLayout.jsx';

const EventsPage = lazy(() => import('../features/events/EventsPage.jsx'));
const EventDetailPage = lazy(() => import('../features/events/EventDetailPage.jsx'));
const MyPassesPage = lazy(() => import('../features/registrations/MyPassesPage.jsx'));
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage.jsx'));
const OrganiserLayout = lazy(() => import('../features/organiser/OrganiserLayout.jsx'));
const OrganiserHome = lazy(() => import('../features/organiser/OrganiserHome.jsx'));
const EventFormPage = lazy(() => import('../features/organiser/EventFormPage.jsx'));
const AttendeesPage = lazy(() => import('../features/organiser/AttendeesPage.jsx'));
const AnalyticsPage = lazy(() => import('../features/organiser/AnalyticsPage.jsx'));
const NotFoundPage = lazy(() => import('../pages/NotFoundPage.jsx'));

export const routes = [
  {
    element: <AppLayout />,
    children: [
      { index: true, element: <Navigate to="/events" replace /> },
      { path: 'events', element: <EventsPage /> },
      { path: 'events/:eventId', element: <EventDetailPage /> },
      { path: 'me/passes', element: <MyPassesPage /> },
      { path: 'me/notifications', element: <NotificationsPage /> },
      { path: 'choose-user', element: <ChooseUserPage /> },
      {
        path: 'organiser',
        element: <OrganiserLayout />,
        children: [
          { index: true, element: <OrganiserHome /> },
          { path: 'events/new', element: <EventFormPage /> },
          { path: 'events/:eventId/edit', element: <EventFormPage /> },
          { path: 'events/:eventId/attendees', element: <AttendeesPage /> },
          { path: 'analytics', element: <AnalyticsPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];

export const createAppRouter = () => createBrowserRouter(routes);
