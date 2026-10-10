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

  /** Toggle save (heart) for a worker. type='save'. Returns { active } */
  async saveWorker(workerId, token) {
    const result = await http.post('/follows', { toUserId: workerId, type: 'save' }, { token });
    return unwrap(result);
  },

  /** Toggle follow for a worker. type='follow'. Returns { active } */
  async followWorker(workerId, token) {
    const result = await http.post('/follows', { toUserId: workerId, type: 'follow' }, { token });
    return unwrap(result);
  },

  /** Get saved workers (follows with type=save) */
  async getSavedWorkers(token) {
    const result = await http.get('/follows', { query: { type: 'save' }, token });
    return unwrap(result);
  },

  /** Get followed workers */
  async getFollowedWorkers(token) {
    const result = await http.get('/follows', { query: { type: 'follow' }, token });
    return unwrap(result);
  },
};
