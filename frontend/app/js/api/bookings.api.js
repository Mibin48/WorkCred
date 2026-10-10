import { http, unwrap } from './http.js';

export const bookingsApi = {
  async createBooking(body, idempotencyKey, token) {
    const result = await http.post('/bookings', body, { token, headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {} });
    return unwrap(result);
  },

  async confirmBooking(bookingId, token) {
    const result = await http.post(`/bookings/${bookingId}/confirm`, {}, { token });
    return unwrap(result);
  },

  async getBookings(status, token) {
    const result = await http.get('/bookings', { query: status ? { status } : {}, token });
    return unwrap(result);
  },

  async getBookingById(bookingId, token) {
    const result = await http.get(`/bookings/${bookingId}`, { token });
    return unwrap(result);
  },

  async startBooking(bookingId, body, token) {
    const result = await http.post(`/bookings/${bookingId}/start`, body, { token });
    return unwrap(result);
  },

  async finishBooking(bookingId, body, token) {
    const result = await http.post(`/bookings/${bookingId}/finish`, body, { token });
    return unwrap(result);
  },

  async cancelBooking(bookingId, token) {
    const result = await http.post(`/bookings/${bookingId}/cancel`, {}, { token });
    return unwrap(result);
  },

  async reportBooking(bookingId, body, token) {
    const result = await http.post(`/bookings/${bookingId}/report`, body, { token });
    return unwrap(result);
  },
};
