import { http, unwrap } from './http.js';

export const jobsApi = {
  async createJob(body, idempotencyKey, token) {
    const result = await http.post('/jobs', body, { token, headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {} });
    return unwrap(result);
  },

  async getOpenJobs(query = {}, token) {
    const result = await http.get('/jobs', { query, token });
    return unwrap(result);
  },

  async getCustomerJobs(token) {
    const result = await http.get('/jobs/mine', { token });
    return unwrap(result);
  },

  async acceptJob(jobId, idempotencyKey, token) {
    const result = await http.post(`/jobs/${jobId}/accept`, {}, { token, headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {} });
    return unwrap(result);
  },

  async cancelJob(jobId, token) {
    const result = await http.post(`/jobs/${jobId}/cancel`, {}, { token });
    return unwrap(result);
  },
};
