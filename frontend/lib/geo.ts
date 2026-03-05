export interface GeoCoords {
  lat: number;
  lng: number;
}

/**
 * Requests the current GPS position.
 * Returns null if the user denies permission or geolocation is unavailable.
 * Never throws — geo is optional for all actions.
 */
export async function getCurrentCoords(): Promise<GeoCoords | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 5000, maximumAge: 30000 }
    );
  });
}
