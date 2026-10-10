import { http, unwrap } from './http.js';

export const radarApi = {
  async setAvailability(body, token) {
    const result = await http.post('/availability', body, { token });
    return unwrap(result);
  },

  async clearAvailability(token) {
    const result = await http.delete('/availability', { token });
    return unwrap(result);
  },

  async getMyAvailability(token) {
    const result = await http.get('/availability/status', { token });
    return unwrap(result);
  },

  async getNearbyAvailability(query = {}, token) {
    const result = await http.get('/availability/nearby', { query, token });
    return unwrap(result);
  },
};
