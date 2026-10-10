/**
 * WorkCred Booking Module Routes
 */

import express from 'express';
import {
  handleCreateBooking,
  handleConfirmBooking,
  handleStartBooking,
  handleFinishBooking,
  handleCancelBooking,
  handleGetBookings,
  handleGetBookingById,
} from './booking.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireRole } from '../../middleware/requireRole.js';
import { requireProfileComplete } from '../../middleware/requireProfileComplete.js';
import { validate } from '../../middleware/validate.js';
import {
  validateBookingCreate,
  validateStartBooking,
  validateFinishBooking,
} from '../../../../shared/validators.js';
import { idempotency } from '../../middleware/idempotency.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export const bookingRouter = express.Router();

// List bookings for current user (customer or worker)
bookingRouter.get(
  '/',
  authenticate,
  asyncHandler(handleGetBookings)
);

// Create direct or Free-Now booking (customer only)
bookingRouter.post(
  '/',
  authenticate,
  requireRole('customer'),
  requireProfileComplete,
  idempotency,
  validate(validateBookingCreate),
  asyncHandler(handleCreateBooking)
);

// Get single booking details (participant only)
bookingRouter.get(
  '/:id',
  authenticate,
  asyncHandler(handleGetBookingById)
);

// Worker confirms pending direct booking
bookingRouter.post(
  '/:id/confirm',
  authenticate,
  requireRole('worker'),
  requireProfileComplete,
  idempotency,
  asyncHandler(handleConfirmBooking)
);

// Support accept route as alias to confirm
bookingRouter.post(
  '/:id/accept',
  authenticate,
  requireRole('worker'),
  requireProfileComplete,
  idempotency,
  asyncHandler(handleConfirmBooking)
);

// Worker checks in with startCode & location
bookingRouter.post(
  '/:id/start',
  authenticate,
  requireRole('worker'),
  requireProfileComplete,
  idempotency,
  validate(validateStartBooking),
  asyncHandler(handleStartBooking)
);

// Customer completes booking with finishCode, paidCash, rating, comment
bookingRouter.post(
  '/:id/finish',
  authenticate,
  requireRole('customer'),
  requireProfileComplete,
  idempotency,
  validate(validateFinishBooking),
  asyncHandler(handleFinishBooking)
);

// Either participant cancels (or declines if pending worker)
bookingRouter.post(
  '/:id/cancel',
  authenticate,
  asyncHandler(handleCancelBooking)
);

// Support decline route as alias to cancel for workers
bookingRouter.post(
  '/:id/decline',
  authenticate,
  requireRole('worker'),
  asyncHandler(handleCancelBooking)
);
