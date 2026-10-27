// [FULLSTACK M1.8 + M1.10] Lazy-loaded nested routes render inside their layout routes.
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CurrentUserProvider } from '../features/users/index.js';
import { ToastProvider } from '../shared/components/Toast.jsx';
import { makeQueryClient, ok } from '../test/utils.jsx';
import { routes } from './router.jsx';

vi.mock('../services/catalogApi.js', () => ({
  catalogApi: {
    me: vi.fn().mockResolvedValue({ data: { id: 1, name: 'Aarav Mehta', role: 'ORGANISER', clubs: [{ id: 1, name: 'Coding Club' }] } }),
    users: vi.fn().mockResolvedValue({ data: [] }),
    notifications: vi.fn().mockResolvedValue({ data: [], meta: { unread: 2, degraded: false } }),
    clubs: vi.fn().mockResolvedValue({ data: [] }),
  },
}));
vi.mock('../services/eventsApi.js', () => ({ eventsApi: { mine: vi.fn(), list: vi.fn() } }));
import { eventsApi } from '../services/eventsApi.js';

function renderAt(path) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <ToastProvider>
        <CurrentUserProvider initialUserId={1}>
          <RouterProvider router={router} />
        </CurrentUserProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe('router', () => {
  it('FS-T24 /organiser lazy-loads the organiser layout and its index page inside the app layout', async () => {
    eventsApi.mine.mockResolvedValue(ok([], { page: 1, pageSize: 8, total: 0, totalPages: 1 }));
    renderAt('/organiser');
    expect(screen.getByRole('link', { name: /seatsure home/i })).toBeInTheDocument(); // AppLayout rendered first
    expect(await screen.findByRole('heading', { name: 'Organiser dashboard' })).toBeInTheDocument(); // lazy chunk
    expect(await screen.findByText('No events here yet')).toBeInTheDocument(); // nested index route
    expect(screen.getByLabelText(/notifications, 2 unread/i)).toBeInTheDocument();
  });

  it('FS-T25 "/" redirects to /events, and unknown paths get the not-found page inside the layout', async () => {
    eventsApi.list.mockResolvedValue(ok([], { nextCursor: null }));
    const home = renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Upcoming events' })).toBeInTheDocument();
    expect(home.state.location.pathname).toBe('/events');
  });

  it('FS-T26 unknown paths render the lazy not-found page with the header still present', async () => {
    renderAt('/nowhere-at-all');
    expect(await screen.findByText('Page not found')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /seatsure home/i }).length).toBeGreaterThan(0);
  });
});
