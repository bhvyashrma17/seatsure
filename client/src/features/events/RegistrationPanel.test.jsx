// [FULLSTACK M1.6 + M2.9] Dynamic React Hook Form fields, client validation, server error mapping.
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/apiClient.js';
import { registrationsApi } from '../../services/registrationsApi.js';
import { ok, renderWithProviders } from '../../test/utils.jsx';
import { RegistrationPanel } from './RegistrationPanel.jsx';

vi.mock('../../services/registrationsApi.js', () => ({ registrationsApi: { register: vi.fn(), cancel: vi.fn(), mine: vi.fn() } }));
vi.mock('../../services/catalogApi.js', () => ({
  catalogApi: { me: vi.fn().mockResolvedValue({ data: { id: 11, name: 'Priya Singh', role: 'STUDENT', clubs: [] } }) },
}));

const event = {
  id: 7,
  status: 'PUBLISHED',
  startsAt: new Date(Date.now() + 86_400_000).toISOString(),
  registrationClosesAt: null,
  isFull: false,
  myRegistration: null,
  questions: [
    { id: 'tshirt', label: 'T-shirt size', type: 'select', required: true, options: ['S', 'M', 'L'] },
    { id: 'laptop', label: 'Will you bring a laptop?', type: 'boolean', required: true },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('RegistrationPanel', () => {
  it('FS-T09 builds one field per custom question and blocks an incomplete form on the client', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegistrationPanel event={event} />, { userId: 11 });
    expect(screen.getByLabelText('T-shirt size')).toBeInTheDocument();
    expect(screen.getByLabelText('Will you bring a laptop?')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm my seat/i }));
    expect(await screen.findByText('"T-shirt size" is required')).toBeInTheDocument();
    expect(registrationsApi.register).not.toHaveBeenCalled();
  });

  it('FS-T10 shows a server-side answer error under the matching field', async () => {
    const user = userEvent.setup();
    registrationsApi.register.mockRejectedValue(
      new ApiError({ status: 422, code: 'INVALID_ANSWERS', message: 'Some answers are invalid', fieldErrors: { 'answers.tshirt': 'Choose one of: S, M, L' } }),
    );
    renderWithProviders(<RegistrationPanel event={event} />, { userId: 11 });
    await user.selectOptions(screen.getByLabelText('T-shirt size'), 'M');
    await user.selectOptions(screen.getByLabelText('Will you bring a laptop?'), 'true');
    await user.click(screen.getByRole('button', { name: /confirm my seat/i }));

    expect(await screen.findByText('Choose one of: S, M, L')).toBeInTheDocument();
    expect(registrationsApi.register).toHaveBeenCalledWith(7, { tshirt: 'M', laptop: 'true' });
  });

  it('FS-T11 a successful registration shows the outcome', async () => {
    const user = userEvent.setup();
    registrationsApi.register.mockResolvedValue(ok({ outcome: 'WAITLISTED', position: 3 }));
    renderWithProviders(<RegistrationPanel event={{ ...event, isFull: true }} />, { userId: 11 });
    await user.selectOptions(screen.getByLabelText('T-shirt size'), 'S');
    await user.selectOptions(screen.getByLabelText('Will you bring a laptop?'), 'false');
    await user.click(screen.getByRole('button', { name: /join waitlist/i }));
    expect(await screen.findByText(/you are #3 on the waitlist/i)).toBeInTheDocument();
  });

  it('FS-T12 asks anonymous visitors to choose a demo user first', () => {
    renderWithProviders(<RegistrationPanel event={event} />);
    expect(screen.getByRole('link', { name: /choose user/i })).toHaveAttribute('href', expect.stringContaining('/choose-user'));
  });
});
