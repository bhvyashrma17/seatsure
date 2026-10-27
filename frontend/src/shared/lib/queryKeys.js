// [FULLSTACK M2.11: Centralised query keys] One factory for every cache key, so invalidation is precise
// and typo-proof. Keys that depend on "who is asking" include the user id, so switching the demo
// user never shows another person's cached data.
export const queryKeys = {
  events: {
    all: ['events'],
    lists: () => ['events', 'list'],
    list: (filters) => ['events', 'list', filters],
    detail: (id, userId) => ['events', 'detail', Number(id), userId ?? 'anonymous'],
    activity: (id) => ['events', 'activity', Number(id)],
    attendeesOf: (id) => ['events', 'attendees', Number(id)],
    attendees: (id, params) => ['events', 'attendees', Number(id), params],
    mine: (userId, params) => ['events', 'mine', userId, params],
  },
  me: {
    registrations: (userId) => ['me', userId, 'registrations'],
    tasks: (userId) => ['me', userId, 'tasks'],
    notifications: (userId) => ['me', userId, 'notifications'],
    profile: (userId) => ['me', userId, 'profile'],
  },
  users: ['users'],
  clubs: ['clubs'],
  venues: ['venues'],
  health: ['health'],
  analytics: {
    overview: (userId, scope) => ['analytics', 'overview', userId, scope],
    activity: (userId, scope) => ['analytics', 'activity', userId, scope],
  },
};
