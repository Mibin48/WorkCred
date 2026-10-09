/**
 * WorkCred Booking State Machine
 * Isomorphic pure ES module for browser and Node 20.
 */

import { BOOKING_STATUS, ROLES } from './constants.js';
import { AppError } from './errors.js';

export function transition(booking, action, actor) {
  const currentStatus = typeof booking === 'string' ? booking : booking.status;
  const isWorker = actor === ROLES.WORKER;
  const isCustomer = actor === ROLES.CUSTOMER;

  if (!isWorker && !isCustomer) {
    throw new AppError('INVALID_TRANSITION', `Invalid actor '${actor}'. Must be worker or customer.`, 403);
  }

  switch (action) {
    case 'confirm':
      if (currentStatus !== BOOKING_STATUS.PENDING) {
        throw new AppError('INVALID_TRANSITION', `Cannot confirm a booking with status '${currentStatus}'.`, 400);
      }
      if (!isWorker) {
        throw new AppError('INVALID_TRANSITION', 'Only workers can confirm a pending booking.', 403);
      }
      return BOOKING_STATUS.CONFIRMED;

    case 'start':
      if (currentStatus !== BOOKING_STATUS.CONFIRMED) {
        throw new AppError('INVALID_TRANSITION', `Cannot start a booking with status '${currentStatus}'. Must be confirmed.`, 400);
      }
      if (!isWorker) {
        throw new AppError('INVALID_TRANSITION', 'Only workers can start a booking.', 403);
      }
      return BOOKING_STATUS.IN_PROGRESS;

    case 'finish':
      if (currentStatus !== BOOKING_STATUS.IN_PROGRESS) {
        throw new AppError('INVALID_TRANSITION', `Cannot finish a booking with status '${currentStatus}'. Must be in_progress.`, 400);
      }
      if (!isCustomer) {
        throw new AppError('INVALID_TRANSITION', 'Only customers can finish a booking.', 403);
      }
      return BOOKING_STATUS.COMPLETED;

    case 'cancel':
      if (currentStatus !== BOOKING_STATUS.PENDING && currentStatus !== BOOKING_STATUS.CONFIRMED) {
        throw new AppError('INVALID_TRANSITION', `Cannot cancel a booking with status '${currentStatus}'.`, 400);
      }
      return BOOKING_STATUS.CANCELLED;

    case 'no_show':
      if (currentStatus !== BOOKING_STATUS.CONFIRMED) {
        throw new AppError('INVALID_TRANSITION', `Cannot mark no-show for a booking with status '${currentStatus}'.`, 400);
      }
      if (!isCustomer) {
        throw new AppError('INVALID_TRANSITION', 'Only customers can report a worker no-show.', 403);
      }
      return BOOKING_STATUS.NO_SHOW;

    default:
      throw new AppError('INVALID_TRANSITION', `Unknown state transition action '${action}'.`, 400);
  }
}
