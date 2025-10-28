import { env } from './config.js';

/**
 * Round an amount to the nearest step.
 * Example: roundTo(3250, 500) = 3000; roundTo(3499, 500) = 3500
 */
export function roundTo(amount: number, step: number): number {
  if (!Number.isFinite(amount) || step <= 0) return Math.round(amount || 0);
  return Math.round(amount / step) * step;
}

/**
 * Great-circle distance in kilometers between two lat/lng points.
 * This is “as-the-crow-flies” (geodesic), fast and FREE.
 */
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const R = 6371; // Earth radius (km)
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Distance from configured Keko base (.env: BASE_LAT/BASE_LNG) to a user pin.
 */
export function distanceFromBaseKm(userLat: number, userLng: number): number {
  const baseLat = Number(env.BASE_LAT);
  const baseLng = Number(env.BASE_LNG);
  return haversineKm(baseLat, baseLng, Number(userLat), Number(userLng));
}

/**
 * Delivery fee (Dar): distance * rate, then rounded to DELIVERY_ROUND_TO.
 * - Rate (TZS/km) comes from env.DELIVERY_RATE_PER_KM
 * - Rounding step from env.DELIVERY_ROUND_TO (e.g., 500 TZS)
 */
export function feeForDarDistance(distanceKm: number): number {
  const raw = Math.max(0, distanceKm) * env.DELIVERY_RATE_PER_KM;
  return roundTo(raw, env.DELIVERY_ROUND_TO);
}

/**
 * Optional guard: check if a distance is beyond our service radius.
 * Returns true if the distance exceeds env.SERVICE_RADIUS_KM (only if > 0).
 */
export function isOutsideServiceRadius(distanceKm: number): boolean {
  const limit = Number(env.SERVICE_RADIUS_KM || 0);
  return limit > 0 && distanceKm > limit;
}

/**
 * Convenience: given a user lat/lng, returns
 * { km, fee, outsideRadius }
 * This is useful if you want a single call to do the common math.
 */
export function quoteFromLatLng(userLat: number, userLng: number) {
  const km = distanceFromBaseKm(userLat, userLng);
  const fee = feeForDarDistance(km);
  const outsideRadius = isOutsideServiceRadius(km);
  return { km, fee, outsideRadius };
}
