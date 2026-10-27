// [DATABASE M3.2: Documents vs rows] Each notification type carries a different payload in `data`
// (a waitlist notice has a position, a promotion does not). In SQL that means sparse nullable
// columns or an extra table per type; a document simply stores what that type needs.
// [DATABASE M3.4: Mongoose schema, validators, middleware hooks]
import mongoose, { Schema, type InferSchemaType, type Model } from 'mongoose';
import { NOTIFICATION_TYPES } from '../jsonSchemas';

export const NOTIFICATION_TTL_DAYS = 30;

const notificationSchema = new Schema(
  {
    // Idempotency key: the outbox message that produced this document. A unique index means a
    // retried delivery can never create a duplicate notification.
    outboxId: { type: String, required: true },
    // Reference (not embedding): the user lives in PostgreSQL, the source of truth for people.
    userId: { type: Number, required: true, min: [1, 'userId must be a positive integer'] },
    type: { type: String, required: true, enum: { values: [...NOTIFICATION_TYPES], message: '{VALUE} is not a notification type' } },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    message: { type: String, required: true, trim: true, maxlength: 500 },
    data: { type: Schema.Types.Mixed, default: () => ({}) },
    readAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
  },
  {
    collection: 'notifications',
    versionKey: false,
    timestamps: { createdAt: true, updatedAt: false },
    minimize: false,
  },
);

notificationSchema.index({ outboxId: 1 }, { unique: true });
// "My notifications, newest first" is the only read pattern, so index exactly that.
notificationSchema.index({ userId: 1, createdAt: -1 });
// [DATABASE M3.19: TTL index] MongoDB's TTL monitor deletes each document once `expiresAt` passes.
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Middleware hook: default the expiry before validation runs, so `required` passes.
notificationSchema.pre('validate', function () {
  if (!this.expiresAt) {
    this.expiresAt = new Date(Date.now() + NOTIFICATION_TTL_DAYS * 24 * 60 * 60 * 1000);
  }
});

export type NotificationDoc = InferSchemaType<typeof notificationSchema> & { createdAt: Date };

export const Notification: Model<NotificationDoc> =
  (mongoose.models.Notification as Model<NotificationDoc>) ?? mongoose.model<NotificationDoc>('Notification', notificationSchema);
