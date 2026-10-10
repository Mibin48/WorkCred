/**
 * WorkCred Booking Module Controller
 */

import {
  createBooking,
  confirmBooking,
  startBooking,
  finishBooking,
  cancelBooking,
  getBookings,
  getBookingById,
} from './booking.service.js';
import { ok } from '../../utils/response.js';

export async function handleCreateBooking(req, res) {
  const result = await createBooking(req.user.id, req.body);
  return ok(res, result, 'Booking created successfully');
}

export async function handleConfirmBooking(req, res) {
  const result = await confirmBooking(req.user.id, req.params.id);
  return ok(res, result, 'Booking confirmed');
}

export async function handleStartBooking(req, res) {
  const result = await startBooking(req.user.id, req.params.id, req.body);
  return ok(res, result, 'Booking started');
}

export async function handleFinishBooking(req, res) {
  const result = await finishBooking(req.user.id, req.params.id, req.body);
  return ok(res, result, 'Booking completed and recorded to Work Passport');
}

export async function handleCancelBooking(req, res) {
  const result = await cancelBooking(req.user.id, req.user.role, req.params.id, req.body);
  return ok(res, result, 'Booking cancelled');
}

export async function handleGetBookings(req, res) {
  const result = await getBookings(req.user.id, req.user.role, req.query);
  return ok(res, result);
}

export async function handleGetBookingById(req, res) {
  const result = await getBookingById(req.params.id, req.user.id, req.user.role);
  return ok(res, result);
}
