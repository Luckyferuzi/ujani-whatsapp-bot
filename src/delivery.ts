// src/delivery.ts
// Distance → fare (Bolt-like), tuned cheaper for business use.
// - base + per-km + minimum fare
// - gentle long-distance discounts
// - optional surge
// - **rounds to nearest 500 TSh by default** (matches: 2900→3000, 11800→12000, 15100→15000)

export type Service = "standard" | "express";
export type RoundingMode = "nearest" | "ceil" | "floor";

export type PriceOptions = {
  service?: Service;         // default: "standard"
  surge?: number;            // 1.0 = no surge; e.g., 1.15 = +15%
  baseOverride?: number;     // override base
  perKmOverride?: number;    // override per-km
  minFareOverride?: number;  // override minimum fare
  roundTo?: number;          // rounding step (TZS). default 500
  roundMode?: RoundingMode;  // "nearest" | "ceil" | "floor" (default: "nearest")
};

// Cheaper defaults
const PRICING: Record<Service, { base: number; perKm: number; minFare: number }> = {
  // ~2.4 km ≈ 2,900 → rounds to 3,000; 6 km ≈ 5,800; 10 km ≈ 9,000
  standard: { base: 1000, perKm: 800,  minFare: 2500 },
  // Slightly higher but still affordable
  express:  { base: 1500, perKm: 1000, minFare: 3500 },
};

// Long-distance relief (cheaper per-km as trips get longer)
const RELIEF_1_KM = 12;      // after 12 km
const RELIEF_2_KM = 25;      // after 25 km
const RELIEF_1_FACTOR = 0.75; // -25%
const RELIEF_2_FACTOR = 0.55; // -45%

function roundStep(value: number, step = 500, mode: RoundingMode = "nearest") {
  const s = Math.max(1, Math.floor(step));
  if (mode === "ceil")  return Math.ceil(value / s) * s;
  if (mode === "floor") return Math.floor(value / s) * s;
  return Math.round(value / s) * s; // nearest
}

export function quoteFare(kmInput: number, opts: PriceOptions = {}) {
  const service: Service = opts.service ?? "standard";
  const cfg = PRICING[service];

  // sanitize distance (round up to 0.1 km like a meter)
  const km = Math.max(0, Math.ceil((kmInput ?? 0) * 10) / 10);

  // defaults (overridable)
  let base    = opts.baseOverride    ?? cfg.base;
  let perKm   = opts.perKmOverride   ?? cfg.perKm;
  let minFare = opts.minFareOverride ?? cfg.minFare;

  // apply long-distance relief
  let perKmEffective = perKm;
  if (km > RELIEF_2_KM) perKmEffective = perKm * RELIEF_2_FACTOR;
  else if (km > RELIEF_1_KM) perKmEffective = perKm * RELIEF_1_FACTOR;

  const distanceCharge = perKmEffective * km;
  let subtotal = base + distanceCharge;

  // minimum fare guard
  if (subtotal < minFare) subtotal = minFare;

  // surge (safe clamp)
  const surge = Math.min(Math.max(opts.surge ?? 1.0, 1.0), 2.0);
  let total = subtotal * surge;

  // rounding (default nearest 500 TSh)
  const step = Math.max(1, Math.floor(opts.roundTo ?? 500));
  const mode = (opts.roundMode ?? "nearest") as RoundingMode;
  total = roundStep(total, step, mode);

  return {
    service,
    km,
    base,
    perKm,
    perKmEffective,
    distanceCharge: Math.round(distanceCharge),
    minFare,
    surge,
    subtotal,
    total,
    rounding: { step, mode },
  };
}

// Backward-compatible facade
export function calcDeliveryFareTZS(km: number, opts?: PriceOptions): number {
  return quoteFare(km, opts).total;
}

// Formatting helpers
export function formatTZS(n: number): string {
  return n.toLocaleString("en-TZ");
}

export function buildQuoteLine(
  place: string,
  km: number,
  fee: number,
  i18nLine: (params: Record<string, string | number>) => string
) {
  return i18nLine({
    place,
    km: km.toFixed(1),
    fee: formatTZS(fee),
  });
}
