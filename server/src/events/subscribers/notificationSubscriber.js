// Subscriber: tells the affected student what happened to their registration.
// Each notification type stores a differently shaped `data` payload (a document-model strength).
import { OUTBOX } from '@seatsure/db';

const TTL_MS = 30 * 24 * 3_600_000;

const TEMPLATES = {
  [OUTBOX.REGISTRATION_CONFIRMED]: (m) => ({
    type: 'REGISTRATION_CONFIRMED',
    title: 'You are in!',
    message: `Your seat for "${m.eventTitle}" is confirmed.`,
    data: { eventId: m.eventId, registrationId: m.registrationId },
  }),
  [OUTBOX.REGISTRATION_WAITLISTED]: (m) => ({
    type: 'REGISTRATION_WAITLISTED',
    title: 'You are on the waitlist',
    message: `"${m.eventTitle}" is full. You are #${m.position ?? '?'} on the waitlist; we will move you up automatically if a seat frees up.`,
    data: { eventId: m.eventId, registrationId: m.registrationId, position: m.position ?? null },
  }),
  [OUTBOX.REGISTRATION_PROMOTED]: (m) => ({
    type: 'PROMOTED_FROM_WAITLIST',
    title: 'A seat opened up for you',
    message: `Good news: you moved off the waitlist and are now confirmed for "${m.eventTitle}".`,
    data: { eventId: m.eventId, registrationId: m.registrationId },
  }),
  [OUTBOX.REGISTRATION_CANCELLED]: (m) => ({
    type: 'REGISTRATION_CANCELLED',
    title: m.byOrganiser ? 'An organiser cancelled your registration' : 'Registration cancelled',
    message: `Your registration for "${m.eventTitle}" was cancelled.`,
    data: { eventId: m.eventId, registrationId: m.registrationId, byOrganiser: Boolean(m.byOrganiser) },
  }),
};

export function registerNotificationSubscriber(bus, { store }) {
  for (const [type, template] of Object.entries(TEMPLATES)) {
    bus.on(type, (msg) =>
      store.recordNotification({
        outboxId: msg.outboxId,
        userId: msg.userId,
        ...template(msg),
        // Expire 30 days after the fact happened (TTL index on expiresAt).
        expiresAt: new Date(new Date(msg.at).getTime() + TTL_MS),
      }),
    );
  }
}
