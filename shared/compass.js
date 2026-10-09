/**
 * WorkCred Isomorphic Wage Compass Logic
 * Pure ES module for browser and Node 20.
 */

export function normalizePayToHourly(amount, unit = 'day') {
  const numeric = Number(amount) || 0;
  if (unit === 'hour') return numeric;
  if (unit === 'day') return Math.round(numeric / 8);
  return numeric;
}

export function medianAndQuartiles(numbers = []) {
  if (!numbers || numbers.length === 0) {
    return { p25: 75, median: 95, p75: 120 }; // default baseline fallback (₹75-120/hr)
  }

  const sorted = [...numbers].sort((a, b) => a - b);
  const percentile = (p) => {
    const idx = (sorted.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    const weight = idx - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };

  return {
    p25: Math.round(percentile(0.25)),
    median: Math.round(percentile(0.5)),
    p75: Math.round(percentile(0.75)),
  };
}

export function verdict(priceHourly, range) {
  const price = Number(priceHourly) || 0;
  const p25 = Number(range?.p25) || 75;
  const p75 = Number(range?.p75) || 120;

  if (price < p25) return 'low';
  if (price > p75) return 'high';
  return 'fair';
}

export function computeCompassLevel({ localityStats, cityStats, seedStats }) {
  if (localityStats && localityStats.sampleSize >= 5) {
    return {
      p25: localityStats.p25,
      median: localityStats.median,
      p75: localityStats.p75,
      sampleSize: localityStats.sampleSize,
      level: 'locality',
      isSeed: Boolean(localityStats.isSeed),
    };
  }

  if (cityStats && cityStats.sampleSize >= 5) {
    return {
      p25: cityStats.p25,
      median: cityStats.median,
      p75: cityStats.p75,
      sampleSize: cityStats.sampleSize,
      level: 'city',
      isSeed: Boolean(cityStats.isSeed),
    };
  }

  const defaultSeed = seedStats || { p25: 75, median: 95, p75: 120, sampleSize: 100 };
  return {
    p25: defaultSeed.p25,
    median: defaultSeed.median,
    p75: defaultSeed.p75,
    sampleSize: defaultSeed.sampleSize,
    level: 'seed',
    isSeed: true,
  };
}
