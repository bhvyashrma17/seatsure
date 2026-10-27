// [FULLSTACK M1.13: services/ layer] Components and hooks never call axios directly; they call these
// functions, so the transport could change without touching any UI code.
import { apiClient, unwrap } from './apiClient.js';

export const eventsApi = {
  // [FULLSTACK M2.5: Query params] Filters travel as Axios `params`, which builds ?q=...&clubId=...
  list: (filters, cursor) => apiClient.get('/events', { params: { ...filters, cursor } }).then(unwrap),
  get: (id) => apiClient.get(`/events/${id}`).then(unwrap),
  mine: (params) => apiClient.get('/events/mine', { params }).then(unwrap),
  create: (body) => apiClient.post('/events', body).then(unwrap),
  update: (id, body) => apiClient.patch(`/events/${id}`, body).then(unwrap),
  remove: (id) => apiClient.delete(`/events/${id}`),
  activity: (id) => apiClient.get(`/events/${id}/activity`).then(unwrap),
  attendees: (id, params) => apiClient.get(`/events/${id}/registrations`, { params }).then(unwrap),
  exportUrl: (id) => `${apiClient.defaults.baseURL}/events/${id}/registrations/export`,
};
