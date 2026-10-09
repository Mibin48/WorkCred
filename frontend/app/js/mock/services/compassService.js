/**
 * WorkCred Compass Mock Service
 */

import { readDb } from '../db.js';
import {
  normalizePayToHourly,
  medianAndQuartiles,
  verdict,
  computeCompassLevel,
} from '../../../../shared/compass.js';
import { localityKey } from '../../../../shared/geo.js';

export function getCompassStats(params = {}) {
  const { skill = 'helper', area = 'Shivajinagar', city = 'Pune', lat = 18.5204, lng = 73.8567, rate, rateUnit = 'day' } = params;
  const db = readDb();
  const NinetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString();
  const currentLocKey = localityKey(lat, lng);

  // 1. Locality level stats from completed bookings
  const locBookings = db.bookings.filter((b) => {
    if (b.status !== 'completed' || b.skill !== skill || b.finishedAt < NinetyDaysAgo) return false;
    const worker = db.users.find((u) => u.id === b.workerId);
    return worker && worker.area === area;
  });

  const locHourlyRates = locBookings.map((b) => normalizePayToHourly(b.rate, b.rateUnit));
  const localityStats = locHourlyRates.length >= 5 ? { ...medianAndQuartiles(locHourlyRates), sampleSize: locHourlyRates.length } : null;

  // 2. City level stats
  const cityBookings = db.bookings.filter((b) => {
    if (b.status !== 'completed' || b.skill !== skill || b.finishedAt < NinetyDaysAgo) return false;
    const worker = db.users.find((u) => u.id === b.workerId);
    return worker && worker.city === city;
  });
  const cityHourlyRates = cityBookings.map((b) => normalizePayToHourly(b.rate, b.rateUnit));
  const cityStats = cityHourlyRates.length >= 5 ? { ...medianAndQuartiles(cityHourlyRates), sampleSize: cityHourlyRates.length } : null;

  // 3. Seed stats
  const seedStatRow = db.rateStats.find((r) => r.skill === skill && r.locality === area) ||
    db.rateStats.find((r) => r.skill === skill) ||
    { p25: 75, median: 95, p75: 125, sampleSize: 100, isSeed: true };

  const levelInfo = computeCompassLevel({ localityStats, cityStats, seedStats: seedStatRow });

  let resultVerdict = null;
  if (rate) {
    const hourly = normalizePayToHourly(rate, rateUnit);
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
