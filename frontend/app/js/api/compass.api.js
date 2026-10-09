import { http, unwrap } from './http.js';

export const compassApi = {
  async getCompass(query = {}) {
    const result = await http.get('/compass', { query });
    return unwrap(result);
  },
};
