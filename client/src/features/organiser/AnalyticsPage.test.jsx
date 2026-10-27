// [FULLSTACK M1.9] A crashing chart is contained by its error boundary; the rest of the page survives.
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok, renderWithProviders } from '../../test/utils.jsx';
import AnalyticsPage from './AnalyticsPage.jsx';

vi.mock('../../services/catalogApi.js', () => ({
  catalogApi: {
    me: vi.fn().mockResolvedValue({ data: { id: 1, name: 'Aarav Mehta', role: 'ORGANISER', clubs: [{ id: 1, name: 'Coding Club' }] } }),
    analyticsOverview: vi.fn(),
    analyticsActivity: vi.fn(),
    health: vi.fn().mockResolvedValue({ data: { postgres: 'up', mongo: 'up', outbox: { pending: 0 } } }),
    simulateMongoOutage: vi.fn(),
    restoreMongo: vi.fn(),
  },
}));

import { catalogApi } from '../../services/catalogApi.js';

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {}); // React logs caught render errors
  catalogApi.analyticsOverview.mockResolvedValue(
    ok({
      scope: 'mine',
      dailySignups: [
        { day: '2026-10-25', signups: 4, cumulative: 4, movingAvg7d: 4 },
        { day: '2026-10-26', signups: 2, cumulative: 6, movingAvg7d: 3 },
      ],
      fillRates: [{ id: 1, title: 'Git Bootcamp', clubName: 'Coding Club', fillRate: 100, waitlisted: 3, overallRank: 1, rankInClub: 1, vsClubAverage: 10 }],
      clubLeaderboard: [{ clubId: 1, clubName: 'Coding Club', fillRate: 90, attendanceRate: 80, rank: 1, tier: 1 }],
    }),
  );
  catalogApi.analyticsActivity.mockResolvedValue(ok({ degraded: true, reason: 'Activity data is temporarily unavailable' }));
});

describe('AnalyticsPage', () => {
  it('FS-T22 contains a chart crash inside its boundary and recovers when fixed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AnalyticsPage />, { userId: 1 });
    expect(await screen.findByRole('img', { name: /daily sign-ups/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /simulate a chart crash/i }));
    expect(await screen.findByText('This part of the page crashed.')).toBeInTheDocument();
    expect(screen.getByText('Git Bootcamp')).toBeInTheDocument(); // the rest of the dashboard survived

    await user.click(screen.getByRole('button', { name: /fix the chart/i }));
    expect(await screen.findByRole('img', { name: /daily sign-ups/i })).toBeInTheDocument();
  });

  it('FS-T23 shows MongoDB degradation without hiding PostgreSQL reports', async () => {
    renderWithProviders(<AnalyticsPage />, { userId: 1 });
    expect(await screen.findByText(/activity data is temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText('Coding Club', { selector: 'td, td *' })).toBeInTheDocument();
  });
});
