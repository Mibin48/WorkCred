import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  haversineKm,
  roundedDistanceLabel,
  localityKey,
  areaCellsAround,
} from '../../shared/geo.js';

describe('shared/geo', () => {
  it('calculates accurate Haversine distance in km', () => {
    // Shivajinagar to Kothrud Pune (~5.2 km)
    const distance = haversineKm(18.5304, 73.8467, 18.5074, 73.8077);
    assert.ok(distance > 4.5 && distance < 6.0);
  });

  it('formats distance into human-friendly approximate strings', () => {
    assert.equal(roundedDistanceLabel(0.42), 'about 400 m');
    assert.equal(roundedDistanceLabel(1.35), 'about 1.4 km');
    assert.equal(roundedDistanceLabel(0.05), 'very close by');
  });

  it('generates consistent 0.05-degree locality cell keys', () => {
    const key = localityKey(18.5204, 73.8567);
    assert.equal(typeof key, 'string');
    assert.ok(key.startsWith('cell_'));
  });

  it('computes grid cells around a center coordinate within radius', () => {
    const cells = areaCellsAround(18.5204, 73.8567, 3);
    assert.ok(Array.isArray(cells));
    assert.ok(cells.length >= 9);
  });
});
