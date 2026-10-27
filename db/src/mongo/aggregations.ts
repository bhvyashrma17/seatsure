// [DATABASE M3.7 / M3.12: Aggregation pipelines] [DATABASE M3.16: $lookup and $facet]
import type { PipelineStage } from 'mongoose';
import { ActivityLog } from './models/ActivityLog';

const CAMPUS_TZ = 'Asia/Kolkata';

export type ActivitySummary = {
  totals: { activities: number; uniqueEvents: number };
  byAction: { action: string; count: number }[];
  byDay: { day: string; count: number }[];
  topEvents: { eventId: number; title: string; club: string; activity: number; cancellations: number }[];
};

/**
 * Dashboard summary in ONE round trip: $match narrows to the period (and clubs), then $facet runs
 * four independent sub-pipelines over the same documents.
 */
export function activitySummaryPipeline({ since, clubIds }: { since: Date; clubIds?: number[] }): PipelineStage[] {
  return [
    { $match: { at: { $gte: since }, ...(clubIds?.length ? { 'event.clubId': { $in: clubIds } } : {}) } },
    {
      $facet: {
        totals: [
          { $group: { _id: null, activities: { $sum: 1 }, events: { $addToSet: '$event.id' } } },
          { $project: { _id: 0, activities: 1, uniqueEvents: { $size: '$events' } } },
        ],
        byAction: [
          { $group: { _id: '$action', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          { $project: { _id: 0, action: '$_id', count: 1 } },
        ],
        byDay: [
          { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: CAMPUS_TZ } }, count: { $sum: 1 } } },
          { $sort: { _id: 1 } },
          { $project: { _id: 0, day: '$_id', count: 1 } },
        ],
        topEvents: [
          {
            $group: {
              _id: '$event.id',
              title: { $last: '$event.title' },
              club: { $last: '$event.clubName' },
              activity: { $sum: 1 },
              cancellations: { $sum: { $cond: [{ $eq: ['$action', 'CANCELLED'] }, 1, 0] } },
            },
          },
          { $sort: { activity: -1, _id: 1 } },
          { $limit: 5 },
          { $project: { _id: 0, eventId: '$_id', title: 1, club: 1, activity: 1, cancellations: 1 } },
        ],
      },
    },
  ];
}

export async function activitySummary(args: { since: Date; clubIds?: number[] }): Promise<ActivitySummary> {
  const [result] = await ActivityLog.aggregate(activitySummaryPipeline(args));
  return {
    totals: result?.totals?.[0] ?? { activities: 0, uniqueEvents: 0 },
    byAction: result?.byAction ?? [],
    byDay: result?.byDay ?? [],
    topEvents: result?.topEvents ?? [],
  };
}

export type PromotionReach = { eventId: number; title: string; promotions: number; notified: number; unread: number };

/**
 * "Did promoted students notice?" Groups waitlist promotions per event, then $lookup joins the
 * notifications collection (a pipeline lookup on data.eventId) to count how many promotion
 * notices exist and how many are still unread.
 */
export function promotionReachPipeline(clubIds?: number[]): PipelineStage[] {
  return [
    { $match: { action: 'PROMOTED', ...(clubIds?.length ? { 'event.clubId': { $in: clubIds } } : {}) } },
    { $group: { _id: '$event.id', title: { $last: '$event.title' }, promotions: { $sum: 1 } } },
    {
      $lookup: {
        from: 'notifications',
        let: { eventId: '$_id' },
        pipeline: [
          { $match: { type: 'PROMOTED_FROM_WAITLIST', $expr: { $eq: ['$data.eventId', '$$eventId'] } } },
          { $project: { _id: 0, readAt: 1 } },
        ],
        as: 'notices',
      },
    },
    {
      $project: {
        _id: 0,
        eventId: '$_id',
        title: 1,
        promotions: 1,
        notified: { $size: '$notices' },
        unread: { $size: { $filter: { input: '$notices', as: 'n', cond: { $eq: ['$$n.readAt', null] } } } },
      },
    },
    { $sort: { promotions: -1, eventId: 1 } },
  ];
}

export async function promotionReach(clubIds?: number[]): Promise<PromotionReach[]> {
  return ActivityLog.aggregate(promotionReachPipeline(clubIds));
}
