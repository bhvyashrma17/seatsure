// [DATABASE M3.19: $jsonSchema validation] Rules enforced by MongoDB itself.
// Mongoose validators only protect writes that go through Mongoose. These validators also reject
// bad documents written by any other client (mongosh, a script, another service).

export const NOTIFICATION_TYPES = [
  'REGISTRATION_CONFIRMED',
  'REGISTRATION_WAITLISTED',
  'PROMOTED_FROM_WAITLIST',
  'REGISTRATION_CANCELLED',
  'EVENT_UPDATED',
] as const;

export const ACTIVITY_ACTIONS = [
  'EVENT_PUBLISHED',
  'REGISTERED',
  'WAITLISTED',
  'PROMOTED',
  'CANCELLED',
  'CHECKED_IN',
  'CAPACITY_CHANGED',
] as const;

export const notificationJsonSchema = {
  bsonType: 'object',
  required: ['outboxId', 'userId', 'type', 'title', 'message', 'expiresAt', 'createdAt'],
  properties: {
    outboxId: { bsonType: 'string', minLength: 1 },
    userId: { bsonType: ['int', 'long', 'double'], minimum: 1 },
    type: { enum: [...NOTIFICATION_TYPES] },
    title: { bsonType: 'string', minLength: 1, maxLength: 120 },
    message: { bsonType: 'string', minLength: 1, maxLength: 500 },
    data: { bsonType: 'object' },
    readAt: { bsonType: ['date', 'null'] },
    expiresAt: { bsonType: 'date' },
    createdAt: { bsonType: 'date' },
  },
} as const;

export const activityJsonSchema = {
  bsonType: 'object',
  required: ['outboxId', 'action', 'event', 'at'],
  properties: {
    outboxId: { bsonType: 'string', minLength: 1 },
    action: { enum: [...ACTIVITY_ACTIONS] },
    actor: {
      bsonType: 'object',
      required: ['id', 'name'],
      properties: { id: { bsonType: ['int', 'long', 'double'] }, name: { bsonType: 'string' } },
    },
    event: {
      bsonType: 'object',
      required: ['id', 'title', 'clubId'],
      properties: {
        id: { bsonType: ['int', 'long', 'double'] },
        title: { bsonType: 'string' },
        clubId: { bsonType: ['int', 'long', 'double'] },
        clubName: { bsonType: 'string' },
      },
    },
    meta: { bsonType: 'object' },
    at: { bsonType: 'date' },
  },
} as const;
