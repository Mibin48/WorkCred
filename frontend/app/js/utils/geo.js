export function getCurrentArea() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('unavailable'));
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
      () => reject(new Error('denied')),
      { timeout: 8000, maximumAge: 60000 },
    );
  });
}
