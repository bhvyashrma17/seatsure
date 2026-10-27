import { apiClient, unwrap } from './apiClient.js';

export const registrationsApi = {
  register: (eventId, answers) => apiClient.post(`/events/${eventId}/registrations`, { answers }).then(unwrap),
  cancel: (registrationId) => apiClient.delete(`/registrations/${registrationId}`).then(unwrap),
  checkIn: (registrationId) => apiClient.patch(`/registrations/${registrationId}`, { checkedIn: true }).then(unwrap),
  mine: () => apiClient.get('/me/registrations').then(unwrap),
  /** Downloads the CSV through the client (so the X-User-Id header is sent) and saves it. */
  async downloadCsv(eventId) {
    const res = await apiClient.get(`/events/${eventId}/registrations/export`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = Object.assign(document.createElement('a'), { href: url, download: `event-${eventId}-attendees.csv` });
    a.click();
    URL.revokeObjectURL(url);
  },
};
