import { http, unwrap } from './http.js';

export const passportApi = {
  async getMyPassport(token) {
    const result = await http.get('/passport/me', { token });
    return unwrap(result);
  },

  async updateEntry(entryId, body, token) {
    const result = await http.patch(`/passport/entries/${entryId}`, body, { token });
    return unwrap(result);
  },

  async getPublicPassport(slug) {
    const result = await http.get(`/passport/${slug}`);
    return unwrap(result);
  },

  async verifyPassport(slug) {
    const result = await http.get(`/passport/${slug}/verify`);
    return unwrap(result);
  },

  async getPassportQr(slug) {
    const result = await http.get(`/passport/${slug}/qr`);
    return unwrap(result);
  },

  async tamperEntry(workerId, seq) {
    const result = await http.post('/dev/tamper-passport', { workerId, seq });
    return unwrap(result);
  },
};
