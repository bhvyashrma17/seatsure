// Subscriber: turns registration/event facts into activity-feed documents in MongoDB.
import { OUTBOX } from '@seatsure/db';

const ACTION_BY_TYPE = {
  [OUTBOX.EVENT_PUBLISHED]: 'EVENT_PUBLISHED',
  [OUTBOX.EVENT_CAPACITY_CHANGED]: 'CAPACITY_CHANGED',
  [OUTBOX.REGISTRATION_CONFIRMED]: 'REGISTERED',
  [OUTBOX.REGISTRATION_WAITLISTED]: 'WAITLISTED',
  [OUTBOX.REGISTRATION_PROMOTED]: 'PROMOTED',
  [OUTBOX.REGISTRATION_CANCELLED]: 'CANCELLED',
  [OUTBOX.REGISTRATION_CHECKED_IN]: 'CHECKED_IN',
};

export function registerActivitySubscriber(bus, { store }) {
  for (const [type, action] of Object.entries(ACTION_BY_TYPE)) {
    bus.on(type, (msg) =>
      store.recordActivity({
        outboxId: msg.outboxId,
        action,
        actor: msg.userId ? { id: msg.userId, name: msg.userName } : { id: msg.actorId, name: msg.actorName },
        event: { id: msg.eventId, title: msg.eventTitle, clubId: msg.clubId, clubName: msg.clubName },
        meta: pickMeta(msg),
        at: new Date(msg.at),
      }),
    );
  }
}

function pickMeta(msg) {
  const meta = {};
  for (const key of ['registrationId', 'position', 'byOrganiser', 'fromCapacity', 'toCapacity', 'promoted']) {
    if (msg[key] !== undefined) meta[key] = msg[key];
  }
  return meta;
}
