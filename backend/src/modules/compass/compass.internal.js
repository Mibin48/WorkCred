/**
 * WorkCred Internal Compass & RateStats Calculation Service
 * Computes fair rate quartiles (p25, median, p75) with 3-tier fallback:
 * 1. Locality level (from completed bookings in the last 90 days)
 * 2. City level
 * 3. Seed / fallback level from RateStat collection
 * Also recomputes and upserts RateStat rows upon booking completion.
 */

import { RateStat } from '../../models/RateStat.js';
import { Booking } from '../../models/Booking.js';
import { User } from '../../models/User.js';
import { normalizePayToHourly, medianAndQuartiles, verdict, computeCompassLevel } from '../../../../shared/compass.js';
import { clock } from '../../utils/clock.js';
import { logger } from '../../utils/logger.js';

/**
 * Get internal compass stats and verdict for a skill and location.
 */
export async function getInternalCompassStats({ skill = 'helper', area = 'Shivajinagar', city = 'Pune', localityKey = null, rate = null, rateUnit = 'day' }) {
  const ninetyDaysAgo = new Date(clock.now() - 90 * 86400000);

  // 1. Locality level stats from completed bookings in last 90 days
  let localityStats = null;
  const locBookings = await Booking.find({
    status: 'completed',
    skill,
    finishedAt: { $gte: ninetyDaysAgo },
  }).select('workerId rate rateUnit');

  if (locBookings.length > 0) {
    const workerIds = locBookings.map((b) => b.workerId);
    const areaWorkers = await User.find({ _id: { $in: workerIds }, area }).select('_id');
    const areaWorkerIdSet = new Set(areaWorkers.map((w) => w.id));

    const locHourlyRates = locBookings
      .filter((b) => areaWorkerIdSet.has(b.workerId))
      .map((b) => normalizePayToHourly(b.rate, b.rateUnit))
      .filter((r) => Number.isFinite(r) && r > 0);

    if (locHourlyRates.length >= 5) {
      localityStats = {
        ...medianAndQuartiles(locHourlyRates),
        sampleSize: locHourlyRates.length,
      };
    }
  }

  // 2. City level stats
  let cityStats = null;
  if (!localityStats && locBookings.length > 0) {
    const workerIds = locBookings.map((b) => b.workerId);
    const cityWorkers = await User.find({ _id: { $in: workerIds }, city }).select('_id');
    const cityWorkerIdSet = new Set(cityWorkers.map((w) => w.id));

    const cityHourlyRates = locBookings
      .filter((b) => cityWorkerIdSet.has(b.workerId))
      .map((b) => normalizePayToHourly(b.rate, b.rateUnit))
      .filter((r) => Number.isFinite(r) && r > 0);

    if (cityHourlyRates.length >= 5) {
      cityStats = {
        ...medianAndQuartiles(cityHourlyRates),
        sampleSize: cityHourlyRates.length,
      };
    }
  }

  // 3. RateStat seed / baseline fallback
  let seedStatDoc = null;
  if (localityKey) {
    seedStatDoc = await RateStat.findOne({ skill, localityKey });
  }
  if (!seedStatDoc) {
    seedStatDoc = await RateStat.findOne({ skill, locality: area });
  }
  if (!seedStatDoc) {
    seedStatDoc = await RateStat.findOne({ skill, isSeed: true });
  }

  const seedStats = seedStatDoc
    ? {
        p25: seedStatDoc.p25,
        median: seedStatDoc.median,
        p75: seedStatDoc.p75,
        sampleSize: seedStatDoc.sampleSize || 100,
        isSeed: Boolean(seedStatDoc.isSeed),
      }
    : { p25: 75, median: 95, p75: 125, sampleSize: 100, isSeed: true };

  const levelInfo = computeCompassLevel({ localityStats, cityStats, seedStats });

  let resultVerdict = null;
  if (rate !== null && rate !== undefined) {
    const hourly = normalizePayToHourly(Number(rate), rateUnit);
    resultVerdict = verdict(hourly, levelInfo);
  }

  return {
    skill,
    area,
    city,
    ...levelInfo,
    verdict: resultVerdict,
  };
}

/**
 * Recompute and update RateStat record asynchronously after booking completion.
 * Failures are caught and logged; must never abort booking completion.
 */
export async function recomputeRateStatsAfterBooking({ skill, localityKey, locality, city }) {
  try {
    if (!skill || !localityKey) return;
    const ninetyDaysAgo = new Date(clock.now() - 90 * 86400000);

    const completedBookings = await Booking.find({
      status: 'completed',
      skill,
      finishedAt: { $gte: ninetyDaysAgo },
    }).select('rate rateUnit workerId');

    if (completedBookings.length === 0) return;

    const hourlyRates = completedBookings
      .map((b) => normalizePayToHourly(b.rate, b.rateUnit))
      .filter((r) => Number.isFinite(r) && r > 0);

    if (hourlyRates.length >= 3) {
      const { p25, median, p75 } = medianAndQuartiles(hourlyRates);
      await RateStat.findOneAndUpdate(
        { skill, localityKey },
        {
          skill,
          localityKey,
          locality: locality || 'Local',
          city: city || 'Pune',
          p25,
          median,
          p75,
          sampleSize: hourlyRates.length,
          isSeed: false,
        },
        { upsert: true, new: true }
      );

      logger.info({
        event: 'rate_stat_recomputed',
        skill,
        localityKey,
        sampleSize: hourlyRates.length,
        median,
      });
    }
  } catch (err) {
    logger.warn({
      event: 'rate_stat_recompute_failed',
      error: err.message,
      skill,
      localityKey,
    });
  }
}
