// src/delivery.ts

/**
 * Returns the delivery fee (TZS) for an in-Dar delivery
 * based on the actual distance in kilometers.
 *
 * Pricing model:
 *   - Linear rate: 680 TZS per km (tuned so ~11.7km → ~8,000 TZS)
 *   - Rounded to the nearest 500 TZS
 *   - If distance == 0 → 0 TZS
 *   - If distance > 0 but rounds below 500 → floor to 500 TZS
 *
 * Examples:
 *   feeForDarDistance(0)      => 0
 *   feeForDarDistance(0.4)    => 500   (0.4 * 680 = 272 → rounds to 0 → min 500)
 *   feeForDarDistance(8.2)    => 6,000 (8.2 * 680 = 5,576 → ≈ 5,500 → rounds 5,500; min rule not needed)
 *   feeForDarDistance(11.7)   => 8,000 (11.7 * 680 = 7,956 → rounds 8,000)
 *   feeForDarDistance(18.4)   => 12,500 (18.4 * 680 = 12,512 → rounds 12,500)
 */

export function feeForDarDistance(km: number): number {
  const ratePerKm = 680; // TZS per km (keep in sync with webhook expectations)

  // Sanitize input
  const d = Number.isFinite(km) ? Math.max(0, km) : 0;

  // If exactly zero, don't charge
  if (d === 0) return 0;

  // Linear pricing
  const raw = d * ratePerKm;

  // Round to nearest 500
  const rounded = roundToNearest500(raw);

  // Never charge zero for non-zero distance
  return Math.max(500, rounded);
}

/** Rounds a number to the nearest 500 TZS. */
function roundToNearest500(n: number): number {
  // e.g., 7956 → Math.round(7956 / 500) * 500 = 16 * 500 = 8000
  return Math.round(n / 500) * 500;
}
