import { apiClient, unwrap } from './apiClient.js';

export const catalogApi = {
  users: () => apiClient.get('/users').then(unwrap),
  me: () => apiClient.get('/me').then(unwrap),
  clubs: () => apiClient.get('/clubs').then(unwrap),
  venues: () => apiClient.get('/venues').then(unwrap),
  health: () => apiClient.get('/health').then(unwrap),
  notifications: () => apiClient.get('/me/notifications').then(unwrap),
  markNotificationsRead: () => apiClient.patch('/me/notifications', { read: true }).then(unwrap),
  analyticsOverview: (params) => apiClient.get('/analytics/overview', { params }).then(unwrap),
  analyticsActivity: (params) => apiClient.get('/analytics/activity', { params }).then(unwrap),
  simulateMongoOutage: () => apiClient.post('/dev/mongo/outage').then(unwrap),
  restoreMongo: () => apiClient.post('/dev/mongo/restore').then(unwrap),
};
