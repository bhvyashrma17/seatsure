// [DATABASE M3.8: Embedding vs referencing]
//  - `event` and `actor` are EMBEDDED snapshots: they are always read together with the activity,
//    are small, and must show what was true at that moment (a later title change must not
//    rewrite history). One read renders a whole feed, with no joins.
//  - The ids inside them are REFERENCES back to PostgreSQL rows for anything that needs current data.
// [DATABASE M3.4: Mongoose schema + validators]
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { ACTIVITY_ACTIONS } from '../jsonSchemas';

export const ACTIVITY_TTL_DAYS = 180;

const snapshotOptions = { _id: false } as const;

const activitySchema = new Schema(
  {
    outboxId: { type: String, required: true },
    action: { type: String, required: true, enum: [...ACTIVITY_ACTIONS] },
    actor: new Schema({ id: { type: Number, required: true }, name: { type: String, required: true } }, snapshotOptions),
    event: new Schema(
      {
        id: { type: Number, required: true },
        title: { type: String, required: true },
        clubId: { type: Number, required: true },
        clubName: { type: String },
      },
      snapshotOptions,
    ),
    meta: { type: Schema.Types.Mixed, default: () => ({}) },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { collection: 'activity_logs', versionKey: false, minimize: false },
);

activitySchema.index({ outboxId: 1 }, { unique: true });
// [DATABASE M3.20: Index design] Supports the two feed queries: one event's feed and one club's feed.
activitySchema.index({ 'event.id': 1, at: -1 });
activitySchema.index({ 'event.clubId': 1, at: -1 });
// [DATABASE M3.19: TTL index] Activity older than 180 days is removed automatically.
activitySchema.index({ at: 1 }, { expireAfterSeconds: ACTIVITY_TTL_DAYS * 24 * 60 * 60 });

export type ActivityLogDoc = InferSchemaType<typeof activitySchema>;

export const ActivityLog: Model<ActivityLogDoc> =
  (mongoose.models.ActivityLog as Model<ActivityLogDoc>) ?? mongoose.model<ActivityLogDoc>('ActivityLog', activitySchema);
