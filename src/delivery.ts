// src/delivery.ts
// Delivery fee rules.

export function feeForDarDistance(distanceKm: number): number {
  if (distanceKm <= 3) return 3_000;
  if (distanceKm <= 7) return 5_000;
  if (distanceKm <= 12) return 7_000;
  if (distanceKm <= 20) return 10_000;
  return 15_000; // cap
}

export const OUTSIDE_DAR_FLAT = 10_000;
