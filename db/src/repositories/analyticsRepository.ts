// Organiser analytics, written in SQL because they need CTEs and window functions.
// [DATABASE M1.12: Window functions] [DATABASE M1.13: CTEs] [DATABASE M2.19: $queryRaw]
// All values are bound as parameters (tagged template), never concatenated into the SQL string.
import { Prisma } from '../../generated/prisma/client';
import { prisma } from '../client';
import type { Tx } from '../transaction';

const CAMPUS_TZ = 'Asia/Kolkata';

function clubFilter(column: Prisma.Sql, clubIds?: number[]) {
  return clubIds && clubIds.length ? Prisma.sql`AND ${column} IN (${Prisma.join(clubIds)})` : Prisma.empty;
}

export type FillRateRow = {
  id: number;
  title: string;
  clubId: number;
  clubName: string;
  startsAt: Date;
  capacity: number;
  confirmed: number;
  waitlisted: number;
  checkedIn: number;
  fillRate: number;
  overallRank: number;
  rankInClub: number;
  vsClubAverage: number;
};

/**
 * Which events fill up? Two CTEs build per-event numbers; window functions then rank every event
 * overall (RANK), within its club (PARTITION BY club), and compare it to its club's average fill.
 */
export async function fillRateRanking({ clubIds, limit = 15 }: { clubIds?: number[]; limit?: number } = {}, client: Tx = prisma) {
  return client.$queryRaw<FillRateRow[]>`
    WITH event_stats AS (
      SELECT e.id, e.title, e.club_id, c.name AS club_name, e.starts_at, e.capacity, e.confirmed_count,
             COUNT(r.id) FILTER (WHERE r.status = 'WAITLISTED')       AS waitlisted,
             COUNT(r.id) FILTER (WHERE r.checked_in_at IS NOT NULL)   AS checked_in
      FROM events e
      JOIN clubs c ON c.id = e.club_id
      LEFT JOIN registrations r ON r.event_id = e.id
      WHERE e.status = 'PUBLISHED' ${clubFilter(Prisma.sql`e.club_id`, clubIds)}
      GROUP BY e.id, c.name
    ),
    rated AS (
      SELECT *, ROUND(100.0 * confirmed_count / capacity, 1) AS fill_rate
      FROM event_stats
    )
    SELECT id,
           title,
           club_id                                                              AS "clubId",
           club_name                                                            AS "clubName",
           starts_at                                                            AS "startsAt",
           capacity,
           confirmed_count                                                      AS confirmed,
           waitlisted::int                                                      AS waitlisted,
           checked_in::int                                                      AS "checkedIn",
           fill_rate::float8                                                    AS "fillRate",
           RANK() OVER (ORDER BY fill_rate DESC, waitlisted DESC)::int          AS "overallRank",
           RANK() OVER (PARTITION BY club_id ORDER BY fill_rate DESC, waitlisted DESC)::int AS "rankInClub",
           ROUND(fill_rate - AVG(fill_rate) OVER (PARTITION BY club_id), 1)::float8 AS "vsClubAverage"
    FROM rated
    ORDER BY "overallRank", id
    LIMIT ${limit}`;
}

export type DailySignupRow = { day: Date; signups: number; cumulative: number; movingAvg7d: number };

/**
 * Sign-ups per day for the last `days` days, with a running total and a 7-day moving average.
 * generate_series fills days with zero sign-ups so the chart has no gaps.
 */
export async function dailySignups(
  { eventId, clubIds, days = 21 }: { eventId?: number; clubIds?: number[]; days?: number } = {},
  client: Tx = prisma,
) {
  return client.$queryRaw<DailySignupRow[]>`
    WITH bounds AS (
      SELECT ((now() AT TIME ZONE ${CAMPUS_TZ})::date - ${days - 1}::int) AS start_day,
             (now() AT TIME ZONE ${CAMPUS_TZ})::date                      AS end_day
    ),
    calendar AS (
      SELECT generate_series(start_day, end_day, interval '1 day')::date AS day FROM bounds
    ),
    daily AS (
      SELECT (r.created_at AT TIME ZONE ${CAMPUS_TZ})::date AS day, COUNT(*) AS signups
      FROM registrations r
      JOIN events e ON e.id = r.event_id
      WHERE r.created_at >= (SELECT start_day FROM bounds)::timestamp AT TIME ZONE ${CAMPUS_TZ}
        ${eventId ? Prisma.sql`AND r.event_id = ${eventId}` : Prisma.empty}
        ${clubFilter(Prisma.sql`e.club_id`, clubIds)}
      GROUP BY 1
    )
    SELECT c.day,
           COALESCE(d.signups, 0)::int                                              AS signups,
           SUM(COALESCE(d.signups, 0)) OVER (ORDER BY c.day)::int                   AS cumulative,
           ROUND(AVG(COALESCE(d.signups, 0)) OVER (ORDER BY c.day
                 ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2)::float8               AS "movingAvg7d"
    FROM calendar c
    LEFT JOIN daily d ON d.day = c.day
    ORDER BY c.day`;
}

export type ClubLeaderboardRow = {
  clubId: number;
  clubName: string;
  events: number;
  seatsOffered: number;
  seatsFilled: number;
  fillRate: number | null;
  attendanceRate: number | null;
  rank: number;
  tier: number;
};

/**
 * Club leaderboard: CTEs aggregate events per club; DENSE_RANK orders clubs by fill rate and
 * NTILE(3) splits them into top / middle / bottom thirds. Attendance only counts past events.
 */
export async function clubLeaderboard(client: Tx = prisma) {
  return client.$queryRaw<ClubLeaderboardRow[]>`
    WITH club_events AS (
      SELECT c.id AS club_id, c.name AS club_name, e.id AS event_id, e.capacity, e.confirmed_count, e.starts_at,
             COUNT(r.id) FILTER (WHERE r.checked_in_at IS NOT NULL) AS checked_in
      FROM clubs c
      JOIN events e ON e.club_id = c.id AND e.status = 'PUBLISHED'
      LEFT JOIN registrations r ON r.event_id = e.id
      GROUP BY c.id, c.name, e.id
    ),
    per_club AS (
      SELECT club_id, club_name,
             COUNT(*)                                                         AS events,
             SUM(capacity)                                                    AS seats_offered,
             SUM(confirmed_count)                                             AS seats_filled,
             ROUND(100.0 * SUM(confirmed_count) / NULLIF(SUM(capacity), 0), 1) AS fill_rate,
             ROUND(100.0 * SUM(checked_in) FILTER (WHERE starts_at < now())
                   / NULLIF(SUM(confirmed_count) FILTER (WHERE starts_at < now()), 0), 1) AS attendance_rate
      FROM club_events
      GROUP BY club_id, club_name
    )
    SELECT club_id                                                   AS "clubId",
           club_name                                                 AS "clubName",
           events::int,
           seats_offered::int                                        AS "seatsOffered",
           seats_filled::int                                         AS "seatsFilled",
           fill_rate::float8                                         AS "fillRate",
           attendance_rate::float8                                   AS "attendanceRate",
           DENSE_RANK() OVER (ORDER BY fill_rate DESC NULLS LAST)::int AS rank,
           NTILE(3)    OVER (ORDER BY fill_rate DESC NULLS LAST)::int AS tier
    FROM per_club
    ORDER BY rank, club_name`;
}
