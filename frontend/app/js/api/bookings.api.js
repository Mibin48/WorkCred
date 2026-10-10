import { http, unwrap } from './http.js';

export const bookingsApi = {
  async createBooking(body, idempotencyKey, token) {
    const key = idempotencyKey || crypto.randomUUID?.() || `booking-${Date.now()}`;
    const result = await http.post('/bookings', body, {
      token,
      headers: { 'Idempotency-Key': key },
    });
    const unwrapped = unwrap(result);
    const booking = unwrapped.booking || unwrapped;
    return { ...booking, booking };
  },

  async confirmBooking(bookingId, token) {
    const result = await http.post(`/bookings/${bookingId}/confirm`, {}, { token });
    const unwrapped = unwrap(result);
    const booking = unwrapped.booking || unwrapped;
    return { ...booking, booking };
  },

  async getBookings(status, token) {
    const result = await http.get('/bookings', { query: status ? { status } : {}, token });
    const unwrapped = unwrap(result);
    return { bookings: unwrapped.bookings || [] };
  },

  async getBookingById(bookingId, token) {
    const result = await http.get(`/bookings/${bookingId}`, { token });
    const unwrapped = unwrap(result);
    const booking = unwrapped.booking || unwrapped;
    return { ...booking, booking };
  },

  async startBooking(bookingId, body, token) {
    const result = await http.post(`/bookings/${bookingId}/start`, body, { token });
    const unwrapped = unwrap(result);
    const booking = unwrapped.booking || unwrapped;
    return { ...booking, booking };
  },

  async finishBooking(bookingId, body, token) {
    const result = await http.post(`/bookings/${bookingId}/finish`, body, { token });
    const unwrapped = unwrap(result);
    const booking = unwrapped.booking || unwrapped;
    return { ...booking, booking, passportEntry: unwrapped.passportEntry };
  },

  async cancelBooking(bookingId, token) {
    const result = await http.post(`/bookings/${bookingId}/cancel`, {}, { token });
    const unwrapped = unwrap(result);
    const booking = unwrapped.booking || unwrapped;
    return { ...booking, booking, penaltyMessage: unwrapped.penaltyMessage };
  },

  async reportBooking(bookingId, body, token) {
    const result = await http.post(`/bookings/${bookingId}/report`, body, { token });
    return unwrap(result);
  },
};
