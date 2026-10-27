// Organiser analytics: PostgreSQL window-function reports + MongoDB aggregation reports.
import { AppError } from '../utils/AppError.js';
import { withTimeout } from '../utils/retry.js';

export function createAnalyticsService({ analytics, mongoReports, mongoState, mongoTimeoutMs, clock = () => new Date() }) {
  function scopeClubIds(user, scope) {
    if (scope === 'all') return undefined;
    const ids = user.clubs.map((c) => c.id);
    if (ids.length === 0) throw new AppError('You do not organise any club yet', 403, 'NO_CLUBS');
    return ids;
  }

  return {
    /** Fill-rate ranking, daily sign-ups and the club leaderboard (all from PostgreSQL). */
    async overview(user, { scope = 'mine', days = 21 } = {}) {
      const clubIds = scopeClubIds(user, scope);
      const [fillRates, dailySignups, clubLeaderboard] = await Promise.all([
        analytics.fillRateRanking({ clubIds, limit: 12 }),
        analytics.dailySignups({ clubIds, days }),
        analytics.clubLeaderboard(),
      ]);
      return { scope, fillRates, dailySignups, clubLeaderboard };
    },

    /**
     * Activity summary from MongoDB. [BACKEND M3.11: Graceful degradation] If MongoDB is down or slow,
     * answer with `degraded: true` and empty data instead of failing the whole dashboard.
     */
    async activity(user, { scope = 'mine', days = 14 } = {}) {
      const clubIds = scopeClubIds(user, scope);
      if (mongoState() !== 'up') return { degraded: true, reason: 'Activity data is temporarily unavailable' };
      try {
        const since = new Date(clock().getTime() - days * 24 * 3_600_000);
        const [summary, promotions] = await withTimeout(
          Promise.all([mongoReports.activitySummary({ since, clubIds }), mongoReports.promotionReach(clubIds)]),
          mongoTimeoutMs,
          'MongoDB activity report',
        );
        return { degraded: false, summary, promotions };
      } catch {
        return { degraded: true, reason: 'Activity data is temporarily unavailable' };
      }
    },
  };
}
