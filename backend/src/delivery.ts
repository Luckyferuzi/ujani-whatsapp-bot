// src/delivery.ts
import { env } from "./config.js";

/**
 * Returns the delivery fee (TZS) for an in-Dar delivery
 * based on the actual distance in kilometers.
 *
 * Pricing model:
 *   - Linear rate: env.DELIVERY_RATE_PER_KM TZS per km
 *   - Rounded to env.DELIVERY_ROUND_TO (e.g. 500)
 *   - If distance == 0 → 0 TZS
 *   - If distance > 0 but rounds below 500 → floor to 500 TZS
 */
export function feeForDarDistance(km: number): number {
  const ratePerKm = env.DELIVERY_RATE_PER_KM;
  const roundTo = env.DELIVERY_ROUND_TO;

  const d = Number.isFinite(km) ? Math.max(0, km) : 0;

  if (d === 0) return 0;

  const raw = d * ratePerKm;
  const rounded = roundToStep(raw, roundTo);

  return Math.max(500, rounded);
}

function roundToStep(n: number, step: number): number {
  if (step <= 0) return n;
  return Math.round(n / step) * step;
}

/**
 * Returns true if a distance is outside the configured service radius.
 * SERVICE_RADIUS_KM <= 0 means "no radius restriction".
 */
export function isOutsideServiceRadius(km: number): boolean {
  const radius = env.SERVICE_RADIUS_KM;
  if (radius <= 0) return false;
  const d = Number.isFinite(km) ? Math.max(0, km) : 0;
  return d > radius;
}
