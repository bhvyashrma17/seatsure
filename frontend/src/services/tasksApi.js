// [FULLSTACK M1.13: services/ layer] Every /tasks request. Components use the hooks in features/tasks instead.
import { apiClient, unwrap } from './apiClient.js';

export const tasksApi = {
  list: () => apiClient.get('/tasks').then(unwrap),
  create: (task) => apiClient.post('/tasks', task).then(unwrap),
  update: (id, changes) => apiClient.patch(`/tasks/${id}`, changes).then(unwrap),
  remove: (id) => apiClient.delete(`/tasks/${id}`).then(() => null),
};
