import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePayToHourly,
  medianAndQuartiles,
  verdict,
  computeCompassLevel,
} from '../../shared/compass.js';

describe('shared/compass', () => {
  it('normalizes pay rates to hourly rupees', () => {
    assert.equal(normalizePayToHourly(800, 'day'), 100);
    assert.equal(normalizePayToHourly(120, 'hour'), 120);
  });

  it('calculates median and quartiles accurately', () => {
    const rates = [60, 70, 80, 90, 100, 110, 120];
    const stats = medianAndQuartiles(rates);
    assert.equal(stats.median, 90);
    assert.equal(stats.p25, 75);
    assert.equal(stats.p75, 105);
  });

  it('returns appropriate wage verdict (low, fair, high)', () => {
    const range = { p25: 75, median: 95, p75: 120 };
    assert.equal(verdict(50, range), 'low');
    assert.equal(verdict(90, range), 'fair');
    assert.equal(verdict(150, range), 'high');
  });

  it('evaluates fallback levels (locality -> city -> seed)', () => {
    const loc = { sampleSize: 6, p25: 80, median: 100, p75: 120 };
    const city = { sampleSize: 20, p25: 70, median: 90, p75: 110 };
    const seed = { sampleSize: 100, p25: 75, median: 95, p75: 125 };

    assert.equal(computeCompassLevel({ localityStats: loc, cityStats: city, seedStats: seed }).level, 'locality');
    assert.equal(computeCompassLevel({ localityStats: { sampleSize: 2 }, cityStats: city, seedStats: seed }).level, 'city');
    assert.equal(computeCompassLevel({ localityStats: null, cityStats: null, seedStats: seed }).level, 'seed');
  });
});
