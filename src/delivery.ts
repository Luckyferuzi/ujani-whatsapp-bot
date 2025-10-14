import { env } from './config.js';

function roundTo(amount: number, step: number): number {
  if (!Number.isFinite(amount) || step <= 0) return Math.round(amount || 0);
  return Math.round(amount / step) * step;
}

/** Dar fee = distance * rate, then rounded to nearest step (e.g., 500) */
export function feeForDarDistance(distanceKm: number): number {
  const raw = Math.max(0, distanceKm) * env.DELIVERY_RATE_PER_KM;
  return roundTo(raw, env.DELIVERY_ROUND_TO);
}
