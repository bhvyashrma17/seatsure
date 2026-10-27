export { connectMongo, disconnectMongo, ensureCollections, mongoState, type MongoState } from './connection';
export { recordNotification, recordActivity, listNotifications, markAllNotificationsRead, eventFeed } from './store';
export type { NewNotification, NewActivity } from './store';
export { activitySummary, activitySummaryPipeline, promotionReach, promotionReachPipeline } from './aggregations';
export { Notification, NOTIFICATION_TTL_DAYS } from './models/Notification';
export { ActivityLog, ACTIVITY_TTL_DAYS } from './models/ActivityLog';
export { NOTIFICATION_TYPES, ACTIVITY_ACTIONS, notificationJsonSchema, activityJsonSchema } from './jsonSchemas';
