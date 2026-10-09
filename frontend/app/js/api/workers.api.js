import { http, unwrap } from './http.js';

export const workersApi = {
  async searchWorkers(query = {}, token) {
    const result = await http.get('/workers', { query, token });
    return unwrap(result);
  },

  async getWorkerById(workerId, token) {
    const result = await http.get(`/workers/${workerId}`, { token });
    return unwrap(result);
  },
};
