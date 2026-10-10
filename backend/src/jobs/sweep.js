/**
 * WorkCred Background Sweep Worker
 * Runs periodically to expire past-due open jobs and pending bookings.
 * 
 * Rules:
 * - Jobs with status === 'open' and scheduledAt < now -> status = 'expired'
 * - Bookings with status === 'pending' and scheduledAt < now -> status = 'cancelled', cancelledReason = 'auto_expired'
 * - Idempotent, safe across multi-instance restarts.
 */

import { Job } from '../models/Job.js';
import { Booking } from '../models/Booking.js';
import { clock } from '../utils/clock.js';
import { logger } from '../utils/logger.js';

let sweepTimer = null;

/**
 * Execute a single sweep pass.
 * @returns {Promise<{ expiredJobs: number, expiredBookings: number }>}
 */
export async function runSweepNow() {
  const now = clock.toDate();

  try {
    // 1. Expire past-due open jobs
    const jobResult = await Job.updateMany(
      {
        status: 'open',
        scheduledAt: { $lt: now, $ne: null },
      },
      {
        $set: { status: 'expired' },
      }
    );

    // 2. Expire past-due pending bookings
    const bookingResult = await Booking.updateMany(
      {
        status: 'pending',
        scheduledAt: { $lt: now, $ne: null },
      },
      {
        $set: {
          status: 'cancelled',
          cancelledAt: now,
          cancelledBy: 'system',
          cancellationReason: 'auto_expired',
        },
      }
    );

    if (jobResult.modifiedCount > 0 || bookingResult.modifiedCount > 0) {
      logger.info(
        `[Sweep] Cleaned up ${jobResult.modifiedCount} expired jobs and ${bookingResult.modifiedCount} expired pending bookings.`
      );
    }

    return {
      expiredJobs: jobResult.modifiedCount,
      expiredBookings: bookingResult.modifiedCount,
    };
  } catch (err) {
    logger.error('[Sweep] Error running cleanup sweep:', err);
    return { expiredJobs: 0, expiredBookings: 0 };
  }
}

/**
 * Start periodic sweep worker.
 * @param {number} intervalMs - interval in milliseconds (default: 60,000ms / 1 min)
 */
export function startSweep(intervalMs = 60000) {
  if (sweepTimer) {
    clearInterval(sweepTimer);
  }

  // Run initial sweep after small delay
  setTimeout(() => {
    runSweepNow().catch((err) => logger.error('[Sweep] Initial run failed:', err));
  }, 2000);

  sweepTimer = setInterval(() => {
    runSweepNow().catch((err) => logger.error('[Sweep] Periodic run failed:', err));
  }, intervalMs);

  logger.info(`[Sweep] Background sweep started with interval ${intervalMs}ms.`);
}

/**
 * Stop periodic sweep worker.
 */
export function stopSweep() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
    logger.info('[Sweep] Background sweep stopped.');
  }
}
