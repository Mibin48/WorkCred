import { http, unwrap } from './http.js';

export const jobsApi = {
  async createJob(body, idempotencyKey, token) {
    const key = idempotencyKey || crypto.randomUUID?.() || `job-${Date.now()}`;
    const result = await http.post('/jobs', body, {
      token,
      headers: { 'Idempotency-Key': key },
    });
    const unwrapped = unwrap(result);
    const job = unwrapped.job || unwrapped;
    return { ...job, job, compass: unwrapped.compass };
  },

  async getOpenJobs(query = {}, token) {
    const result = await http.get('/jobs', { query, token });
    const unwrapped = unwrap(result);
    return { jobs: unwrapped.jobs || [] };
  },

  async getCustomerJobs(token) {
    const result = await http.get('/jobs/mine', { token });
    const unwrapped = unwrap(result);
    return { jobs: unwrapped.jobs || [] };
  },

  async acceptJob(jobId, idempotencyKey, token) {
    let key = idempotencyKey;
    let t = token;
    if (!token && typeof idempotencyKey === 'string' && (idempotencyKey.startsWith('ey') || idempotencyKey.length > 50)) {
      t = idempotencyKey;
      key = null;
    }
    key = key || crypto.randomUUID?.() || `job-accept-${Date.now()}`;

    const result = await http.post(`/jobs/${jobId}/accept`, {}, {
      token: t,
      headers: { 'Idempotency-Key': key },
    });
    const unwrapped = unwrap(result);
    const booking = unwrapped.booking || unwrapped;
    return { ...booking, booking };
  },

  async cancelJob(jobId, token) {
    const result = await http.post(`/jobs/${jobId}/cancel`, {}, { token });
    const unwrapped = unwrap(result);
    const job = unwrapped.job || unwrapped;
    return { ...job, job };
  },
};
