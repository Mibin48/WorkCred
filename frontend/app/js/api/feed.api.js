import { http, unwrap } from './http.js';

export const feedApi = {
  async getFeed(query = {}, token) {
    const result = await http.get('/feed', { query, token });
    return unwrap(result);
  },

  async createPost(body, idempotencyKey, token) {
    const result = await http.post('/posts', body, { token, headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {} });
    return unwrap(result);
  },

  async followUser(toUserId, idempotencyKey, token) {
    const result = await http.post('/follows', { toUserId, type: 'follow' }, { token, headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {} });
    return unwrap(result);
  },

  async unfollowUser(toUserId, token) {
    const result = await http.delete(`/follows/${toUserId}`, { token });
    return unwrap(result);
  },

  async saveWorker(toUserId, idempotencyKey, token) {
    const result = await http.post('/follows', { toUserId, type: 'save' }, { token, headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {} });
    return unwrap(result);
  },

  async addEndorsement(body, idempotencyKey, token) {
    const result = await http.post('/endorsements', body, { token, headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {} });
    return unwrap(result);
  },
};
