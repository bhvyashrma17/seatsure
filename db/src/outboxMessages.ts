// The contract between the PostgreSQL outbox and its MongoDB consumers.
// Both the API services and the seed script build messages through these helpers.

export const OUTBOX = {
  EVENT_PUBLISHED: 'event.published',
  EVENT_CAPACITY_CHANGED: 'event.capacity_changed',
  REGISTRATION_CONFIRMED: 'registration.confirmed',
  REGISTRATION_WAITLISTED: 'registration.waitlisted',
  REGISTRATION_PROMOTED: 'registration.promoted',
  REGISTRATION_CANCELLED: 'registration.cancelled',
  REGISTRATION_CHECKED_IN: 'registration.checked_in',
} as const;

export type OutboxType = (typeof OUTBOX)[keyof typeof OUTBOX];

export type EventRef = { eventId: number; eventTitle: string; clubId: number; clubName: string };

export type RegistrationMessage = EventRef & {
  registrationId: number;
  userId: number;
  userName: string;
  /** ISO timestamp of the business change (not of delivery). */
  at: string;
  /** Waitlist position at the time of the change (waitlisted messages only). */
  position?: number;
  /** True when an organiser (not the student) made the change. */
  byOrganiser?: boolean;
};

export type EventMessage = EventRef & {
  actorId: number;
  actorName: string;
  at: string;
  fromCapacity?: number;
  toCapacity?: number;
  promoted?: number;
};

export function registrationMessage(event: EventRef, reg: { id: number; userId: number; userName: string }, at: Date, extra: Partial<RegistrationMessage> = {}): RegistrationMessage {
  return { ...event, registrationId: reg.id, userId: reg.userId, userName: reg.userName, at: at.toISOString(), ...extra };
}

export function eventMessage(event: EventRef, actor: { id: number; name: string }, at: Date, extra: Partial<EventMessage> = {}): EventMessage {
  return { ...event, actorId: actor.id, actorName: actor.name, at: at.toISOString(), ...extra };
}
