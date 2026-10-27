// [FULLSTACK M3.9 + M3.11 + M2.5] Cursor pagination with useInfiniteQuery, infinite scroll, filter params.
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eventsApi } from '../../services/eventsApi.js';
import { ok, renderWithProviders } from '../../test/utils.jsx';
import EventsPage from './EventsPage.jsx';

vi.mock('../../services/eventsApi.js', () => ({ eventsApi: { list: vi.fn() } }));
vi.mock('../../services/catalogApi.js', () => ({ catalogApi: { clubs: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Coding Club' }] }), me: vi.fn() } }));

const card = (id, title) => ({
  id,
  title,
  category: 'WORKSHOP',
  startsAt: new Date(Date.now() + id * 86_400_000).toISOString(),
  endsAt: new Date(Date.now() + id * 86_400_000 + 7_200_000).toISOString(),
  capacity: 10,
  confirmedCount: 4,
  seatsLeft: 6,
  isFull: false,
  club: { name: 'Coding Club' },
  venue: { name: 'Lab', building: 'B' },
});

// A controllable IntersectionObserver: the test decides when the sentinel "becomes visible".
let observerCallbacks = [];
beforeEach(() => {
  vi.clearAllMocks();
  observerCallbacks = [];
  globalThis.IntersectionObserver = class {
    constructor(cb) {
      observerCallbacks.push(cb);
    }
    observe() {}
    disconnect() {}
  };
});
afterEach(() => vi.useRealTimers());

describe('EventsPage', () => {
  it('FS-T16 loads the next page with the cursor when the sentinel scrolls into view', async () => {
    eventsApi.list.mockImplementation((params, cursor) =>
      Promise.resolve(cursor ? ok([card(3, 'Third event')], { nextCursor: null }) : ok([card(1, 'First event'), card(2, 'Second event')], { nextCursor: 2 })),
    );
    renderWithProviders(<EventsPage />);
    expect(await screen.findByText('Second event')).toBeInTheDocument();
    expect(eventsApi.list).toHaveBeenCalledWith({ sort: 'soonest' }, undefined);

    await act(async () => observerCallbacks.at(-1)([{ isIntersecting: true }]));
    expect(await screen.findByText('Third event')).toBeInTheDocument();
    expect(eventsApi.list).toHaveBeenLastCalledWith({ sort: 'soonest' }, 2);
    expect(screen.getByText(/you have reached the end · 3 events/i)).toBeInTheDocument();
  });

  it('FS-T17 a category chip changes the query params (new cache key, new request)', async () => {
    const user = userEvent.setup();
    eventsApi.list.mockResolvedValue(ok([card(1, 'First event')], { nextCursor: null }));
    renderWithProviders(<EventsPage />);
    await screen.findByText('First event');
    await user.click(screen.getByRole('button', { name: 'Talk' }));
    await waitFor(() => expect(eventsApi.list).toHaveBeenLastCalledWith({ category: 'TALK', sort: 'soonest' }, undefined));
    expect(screen.getByRole('button', { name: 'Talk' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('FS-T18 search is debounced: one request after typing stops', async () => {
    const user = userEvent.setup();
    eventsApi.list.mockResolvedValue(ok([card(1, 'First event')], { nextCursor: null }));
    renderWithProviders(<EventsPage />);
    await screen.findByText('First event');
    eventsApi.list.mockClear();
    await user.type(screen.getByRole('searchbox', { name: /search events/i }), 'git');
    await waitFor(() => expect(eventsApi.list).toHaveBeenCalledWith({ q: 'git', sort: 'soonest' }, undefined));
    expect(eventsApi.list).toHaveBeenCalledTimes(1); // not once per keystroke
  });
});
