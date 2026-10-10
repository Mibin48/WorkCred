import { http, unwrap } from './http.js';

export const reportsApi = {
  async submitReport(body, token) {
    const result = await http.post('/reports', body, { token });
    return unwrap(result);
  },
};
