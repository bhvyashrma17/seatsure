// [FULLSTACK M2.8 + M3.5] Optimistic cancel with rollback; nested Prisma include data rendered safely.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/apiClient.js';
import { registrationsApi } from '../../services/registrationsApi.js';
import { deferred, ok, renderWithProviders } from '../../test/utils.jsx';
import MyPassesPage from './MyPassesPage.jsx';

vi.mock('../../services/registrationsApi.js', () => ({ registrationsApi: { register: vi.fn(), cancel: vi.fn(), mine: vi.fn() } }));
vi.mock('../../services/catalogApi.js', () => ({
  catalogApi: { me: vi.fn().mockResolvedValue({ data: { id: 11, name: 'Priya Singh', role: 'STUDENT', clubs: [] } }) },
}));

const future = new Date(Date.now() + 2 * 86_400_000).toISOString();
const pass = {
  id: 5,
  status: 'CONFIRMED',
  position: null,
  answers: {},
  createdAt: new Date().toISOString(),
  event: {
    id: 7,
    title: 'Hands-on LLM Workshop',
    status: 'PUBLISHED',
    startsAt: future,
    endsAt: future,
    capacity: 40,
    confirmedCount: 40,
    club: { id: 2, name: 'AI & ML Society' },
    venue: { id: 4, name: 'Innovation Lab 204', building: 'Tech Park' },
  },
};

const tabCount = (name) => within(screen.getByRole('tab', { name: new RegExp(name) })).getByText(/\d+/).textContent;

beforeEach(() => {
  vi.clearAllMocks();
  registrationsApi.mine.mockResolvedValue(ok([pass]));
});

describe('MyPassesPage', () => {
  it('FS-T13 renders nested event -> club -> venue data from one response', async () => {
    renderWithProviders(<MyPassesPage />, { userId: 11 });
    expect(await screen.findByText('Hands-on LLM Workshop')).toBeInTheDocument();
    expect(screen.getByText('AI & ML Society')).toBeInTheDocument();
    expect(screen.getByText('Innovation Lab 204, Tech Park')).toBeInTheDocument();
  });

  it('FS-T14 cancel is optimistic, and rolls back when the server refuses', async () => {
    const user = userEvent.setup();
    const pending = deferred();
    registrationsApi.cancel.mockReturnValue(pending.promise);
    renderWithProviders(<MyPassesPage />, { userId: 11 });
    await screen.findByText('Hands-on LLM Workshop');

    await user.click(screen.getByRole('button', { name: /cancel registration/i }));
    // The UI changed BEFORE the server answered.
    await waitFor(() => expect(tabCount('Cancelled')).toBe('1'));
    expect(tabCount('Upcoming')).toBe('0');

    pending.reject(new ApiError({ status: 409, code: 'EVENT_STARTED', message: 'This event has already started' }));
    await waitFor(() => expect(tabCount('Upcoming')).toBe('1')); // rolled back
    expect(await screen.findByText(/could not cancel: this event has already started/i)).toBeInTheDocument();
  });

  it('FS-T15 after a successful cancel the list is re-fetched from the server', async () => {
    const user = userEvent.setup();
    registrationsApi.cancel.mockResolvedValue(ok({ cancelled: { id: 5 }, promoted: { registrationId: 9 } }));
    renderWithProviders(<MyPassesPage />, { userId: 11 });
    await screen.findByText('Hands-on LLM Workshop');
    registrationsApi.mine.mockResolvedValue(ok([{ ...pass, status: 'CANCELLED', cancelledAt: new Date().toISOString() }]));

    await user.click(screen.getByRole('button', { name: /cancel registration/i }));
    expect(await screen.findByText(/your seat passed to the next person/i)).toBeInTheDocument();
    await waitFor(() => expect(registrationsApi.mine).toHaveBeenCalledTimes(2)); // invalidated -> refetched
  });
});
