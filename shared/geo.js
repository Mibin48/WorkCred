/**
 * WorkCred Isomorphic Geographic Calculations
 * Pure ES module for browser and Node 20.
 */

export function haversineKm(lat1, lng1, lat2, lng2) {
  const p1 = Number(lat1);
  const l1 = Number(lng1);
  const p2 = Number(lat2);
  const l2 = Number(lng2);

  if (!Number.isFinite(p1) || !Number.isFinite(l1) || !Number.isFinite(p2) || !Number.isFinite(l2)) {
    return 0;
  }

  const R = 6371; // Earth radius in km
  const dLat = ((p2 - p1) * Math.PI) / 180;
  const dLng = ((l2 - l1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((p1 * Math.PI) / 180) *
      Math.cos((p2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 100) / 100;
}

export function roundedDistanceLabel(km) {
  const distance = Number(km) || 0;
  if (distance < 0.1) return 'very close by';
  if (distance < 1) {
    const meters = Math.max(100, Math.round((distance * 1000) / 100) * 100);
    return `about ${meters} m`;
  }
  return `about ${distance.toFixed(1)} km`;
}

export function roundToCell(val, cellSize = 0.05) {
  return (Math.round(val / cellSize) * cellSize).toFixed(2);
}

export function localityKey(lat, lng) {
  const rLat = roundToCell(Number(lat));
  const rLng = roundToCell(Number(lng));
  return `cell_${rLat}_${rLng}`;
}

export function areaCellsAround(lat, lng, radiusKm = 3) {
  const pLat = Number(lat);
  const pLng = Number(lng);
  const cellSize = 0.05;
  const degreesPerKmLat = 1 / 111;
  const degreesPerKmLng = 1 / (111 * Math.cos((pLat * Math.PI) / 180));

  const latSpan = Math.ceil((radiusKm * degreesPerKmLat) / cellSize);
  const lngSpan = Math.ceil((radiusKm * degreesPerKmLng) / cellSize);

  const cells = new Set();
  const baseLat = Math.round(pLat / cellSize) * cellSize;
  const baseLng = Math.round(pLng / cellSize) * cellSize;

  for (let dLat = -latSpan; dLat <= latSpan; dLat++) {
    for (let dLng = -lngSpan; dLng <= lngSpan; dLng++) {
      const cLat = (baseLat + dLat * cellSize).toFixed(2);
      const cLng = (baseLng + dLng * cellSize).toFixed(2);
      cells.add(`cell_${cLat}_${cLng}`);
    }
  }

  return Array.from(cells);
}
