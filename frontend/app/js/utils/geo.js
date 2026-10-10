/**
 * Client-side geolocation helper.
 * Wraps navigator.geolocation with graceful fallback.
 */

/**
 * Request the user's current position.
 * Resolves with { lat, lng } or rejects with 'denied' | 'unavailable' | 'timeout'.
 */
export function requestLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unavailable'));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ lat: coords.latitude, lng: coords.longitude }),
      (err) => {
        if (err.code === 1) reject(new Error('denied'));
        else if (err.code === 3) reject(new Error('timeout'));
        else reject(new Error('unavailable'));
      },
      { timeout: 8000, maximumAge: 60000 },
    );
  });
}

/** Backward-compat alias */
export function getCurrentArea() {
  return requestLocation().then(({ lat, lng }) => ({ latitude: lat, longitude: lng }));
}

/**
 * Convert a lat/lng to an approximate locality name using a 0.05-degree grid.
 * Returns a label like "Shivajinagar" if found in the PUNE_LOCALITIES lookup,
 * or "Near your location" as a fallback.
 */
export const PUNE_LOCALITIES = [
  { name: 'Shivajinagar', lat: 18.5304, lng: 73.8467 },
  { name: 'Kothrud', lat: 18.5074, lng: 73.8077 },
  { name: 'Deccan', lat: 18.5158, lng: 73.8418 },
  { name: 'Aundh', lat: 18.5602, lng: 73.8031 },
  { name: 'Baner', lat: 18.5590, lng: 73.7868 },
  { name: 'Viman Nagar', lat: 18.5679, lng: 73.9143 },
  { name: 'Hadapsar', lat: 18.5089, lng: 73.9259 },
  { name: 'Swargate', lat: 18.5018, lng: 73.8636 },
  { name: 'FC Road', lat: 18.5236, lng: 73.8411 },
  { name: 'Wakad', lat: 18.5987, lng: 73.7689 },
];

export function coordinatesForLocality(name) {
  const locality = PUNE_LOCALITIES.find((entry) => entry.name === name);
  return locality ? { lat: locality.lat, lng: locality.lng } : null;
}

export function localityFromCoords(lat, lng) {
  let best = null;
  let bestDist = Infinity;
  for (const loc of PUNE_LOCALITIES) {
    const dLat = lat - loc.lat;
    const dLng = lng - loc.lng;
    const dist = Math.sqrt(dLat * dLat + dLng * dLng);
    if (dist < bestDist) { bestDist = dist; best = loc.name; }
  }
  return best ?? 'Near your location';
}
