// [FULLSTACK M1.6] Cross-field validation and useFieldArray; [FULLSTACK M2.9] server errors mapped to fields.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/apiClient.js';
import { eventsApi } from '../../services/eventsApi.js';
import { ok, renderWithProviders } from '../../test/utils.jsx';
import EventFormPage from './EventFormPage.jsx';

vi.mock('../../services/eventsApi.js', () => ({ eventsApi: { create: vi.fn(), update: vi.fn(), get: vi.fn() } }));
vi.mock('../../services/catalogApi.js', () => ({
  catalogApi: {
    me: vi.fn().mockResolvedValue({ data: { id: 1, name: 'Aarav Mehta', role: 'ORGANISER', clubs: [{ id: 1, name: 'Coding Club' }] } }),
    venues: vi.fn().mockResolvedValue({ data: [{ id: 4, name: 'Innovation Lab 204', building: 'Tech Park', capacity: 40 }] }),
  },
}));

const local = (hoursFromNow) => {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

async function fillValidForm(user) {
  await screen.findByRole('option', { name: /Innovation Lab 204/ });
  await user.type(screen.getByLabelText('Title'), 'Docker in a Day');
  await user.type(screen.getByLabelText('Description'), 'Containers, images and compose from scratch.');
  await user.selectOptions(screen.getByLabelText('Venue'), '4');
  fireEvent.change(screen.getByLabelText('Starts'), { target: { value: local(48) } });
  fireEvent.change(screen.getByLabelText('Ends'), { target: { value: local(51) } });
}

beforeEach(() => vi.clearAllMocks());

describe('EventFormPage', () => {
  it('FS-T19 enforces cross-field rules before sending anything', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EventFormPage />, { userId: 1 });
    await fillValidForm(user);
    fireEvent.change(screen.getByLabelText('Ends'), { target: { value: local(40) } }); // before the start
    await user.clear(screen.getByLabelText('Capacity'));
    await user.type(screen.getByLabelText('Capacity'), '100'); // venue holds 40
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    expect(await screen.findByText('The event must end after it starts')).toBeInTheDocument();
    expect(screen.getByText('The venue holds at most 40')).toBeInTheDocument();
    expect(eventsApi.create).not.toHaveBeenCalled();
  });

  it('FS-T20 adds and removes custom questions with useFieldArray', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EventFormPage />, { userId: 1 });
    await screen.findByLabelText('Title');
    await user.click(screen.getByRole('button', { name: /add question/i }));
    await user.click(screen.getByRole('button', { name: /add question/i }));
    expect(screen.getAllByLabelText(/^Question \d/)).toHaveLength(2);

    await user.selectOptions(screen.getAllByLabelText('Type')[0], 'select');
    expect(screen.getByLabelText(/options \(comma separated\)/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
    expect(screen.getAllByLabelText(/^Question \d/)).toHaveLength(1);
  });

  it('FS-T21 sends a clean payload and shows server field errors on the right input', async () => {
    const user = userEvent.setup();
    eventsApi.create.mockRejectedValue(new ApiError({ status: 422, code: 'CAPACITY_EXCEEDS_VENUE', message: 'x', fieldErrors: { capacity: 'The venue holds at most 40 people' } }));
    renderWithProviders(<EventFormPage />, { userId: 1 });
    await fillValidForm(user);
    await user.click(screen.getByRole('button', { name: /add question/i }));
    await user.type(screen.getByLabelText('Question 1'), 'Bringing a laptop?');
    await user.selectOptions(screen.getByLabelText('Type'), 'boolean');
    await user.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => expect(eventsApi.create).toHaveBeenCalled());
    const payload = eventsApi.create.mock.calls[0][0];
    expect(payload).toMatchObject({ clubId: 1, venueId: 4, title: 'Docker in a Day', capacity: 40, category: 'WORKSHOP' });
    expect(payload.questions).toEqual([{ id: 'bringing_a_laptop', label: 'Bringing a laptop?', type: 'boolean', required: false }]);
    expect(await screen.findByText('The venue holds at most 40 people')).toBeInTheDocument();
  });
});
