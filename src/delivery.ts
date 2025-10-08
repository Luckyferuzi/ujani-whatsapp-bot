// src/delivery.ts
// Delivery math + dataset access for Dar es Salaam flows.
// - Affordable tariff with clear rounding rules.
// - Reads streets data from src/data/dar_location.json (if present).
// - Exposes both the new helpers your webhook uses (feeForDarDistance, OUTSIDE_DAR_FLAT)
//   and the higher-level quote helpers used earlier (quoteDelivery, fallbackQuote).

import fs from "node:fs";
import path from "node:path";

/* -------------------------------- Types -------------------------------- */

export type QuoteSource = "dataset" | "fallback";

export interface DeliveryQuote {
  source: QuoteSource;
  district?: string;
  ward?: string;
  street?: string;
  // distance
  distance_m: number;             // raw meters (may be 0 in fallback)
  distance_m_rounded: number;     // meters rounded up to next 100 m
  distance_km_display: number;    // e.g., 1.2 (derived from rounded meters)
  // fee
  fee_tzs: number;                // pre-rounded fee from tariff
  fee_tzs_rounded: number;        // rounded up to next 500 TSh
  // meta
  tariffVersion: string;
}

export interface QuoteInput {
  district?: string;
  ward?: string;
  street?: string;
}

/* ------------------------------ Constants ------------------------------ */

// Flat fee used for outside Dar routes (if ever needed by other modules)
export const OUTSIDE_DAR_FLAT = Number(process.env.OUTSIDE_DAR_FLAT || 8000);

// Central tariff definition (affordable & easy to reason about).
// You can tweak these tiers later without touching webhook/session.
export const AFFORDABLE_TARIFF_VERSION = "affordable_v1";
const TIERS: Array<{ upToKm: number; fee: number }> = [
  // Very short hops
  { upToKm: 2,  fee: 2500 },
  { upToKm: 5,  fee: 3500 },
  { upToKm: 8,  fee: 4500 },
  { upToKm: 12, fee: 5500 },
  { upToKm: 18, fee: 7000 },
  { upToKm: 25, fee: 8500 },
];
// Beyond the last tier, add +500 per extra km (capped to 500 steps later)
const BEYOND_BASE_KM = TIERS[TIERS.length - 1].upToKm;
const BEYOND_BASE_FEE = TIERS[TIERS.length - 1].fee;

/* ------------------------------ Rounding ------------------------------- */

function roundUpTo(value: number, step: number): number {
  if (!isFinite(value) || value <= 0) return 0;
  const n = Math.ceil(value / step);
  return n * step;
}

/** Round meters up to the next 100 meters (e.g., 1180 → 1200). */
export function roundMetersUp100(meters: number): number {
  return roundUpTo(meters, 100);
}

/** Round fee to the next 500 TSh (e.g., 3300 → 3500). */
export function roundFeeTo500(fee: number): number {
  return roundUpTo(fee, 500);
}

/* --------------------------- Fee computation --------------------------- */

/**
 * Affordable tariff for Dar delivery:
 * - Uses simple tiers for the first 25 km
 * - Beyond that, adds +500 per extra km
 * - Final fee is rounded up to the next 500 TSh
 */
export function feeForDarDistance(distanceKm: number): number {
  const km = Math.max(0, Number(distanceKm) || 0);

  // Tiered part
  for (const t of TIERS) {
    if (km <= t.upToKm) {
      return roundFeeTo500(t.fee);
    }
  }

  // Beyond last tier
  const extraKm = Math.ceil(km - BEYOND_BASE_KM);
  const fee = BEYOND_BASE_FEE + extraKm * 500;
  return roundFeeTo500(fee);
}

/* ------------------------------ Dataset -------------------------------- */

type StreetRowRaw = {
  REGION?: string;
  DISTRICT?: string;
  WARD?: string;
  STREET?: string;
  PLACES?: string;
  DISTANCE_FROM_KEKO_MAGURUMBASI_KM?: number;
};

export interface StreetRow {
  region: string;
  district: string;
  ward: string;
  street: string;
  places?: string;
  kmFromKeko: number; // numeric (>=0)
}

let __dbCache: StreetRow[] | null = null;

function candidateStreetPaths(): string[] {
  return [
    path.resolve(process.cwd(), "src/data/dar_location.json"),
    path.resolve(process.cwd(), "data/dar_location.json"),
    path.resolve(process.cwd(), "dar_location.json"),
  ];
}

/** Load and normalize the streets DB if present; otherwise an empty array. */
function loadStreetDB(): StreetRow[] {
  if (__dbCache) return __dbCache;
  for (const p of candidateStreetPaths()) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const arr = JSON.parse(raw) as StreetRowRaw[];
        if (Array.isArray(arr)) {
          __dbCache = arr
            .filter((r) => typeof r?.DISTANCE_FROM_KEKO_MAGURUMBASI_KM === "number")
            .map((r) => ({
              region: (r.REGION || "").toString().trim(),
              district: (r.DISTRICT || "").toString().trim(),
              ward: (r.WARD || "").toString().trim(),
              street: (r.STREET || "").toString().trim(),
              places: (r.PLACES || "")?.toString().trim() || undefined,
              kmFromKeko: Math.max(0, Number(r.DISTANCE_FROM_KEKO_MAGURUMBASI_KM) || 0),
            }));
          return __dbCache;
        }
      }
    } catch {
      // ignore and try next path
    }
  }
  __dbCache = [];
  return __dbCache;
}

/** Export all known rows (normalized). */
export async function getAllKnownStreets(): Promise<StreetRow[]> {
  return loadStreetDB();
}

/* ---------------------------- Quote helpers ---------------------------- */

function norm(s?: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function findStreetKm(district?: string, ward?: string, street?: string): number | undefined {
  if (!district || !ward || !street) return undefined;
  const d = norm(district), w = norm(ward), st = norm(street);
  const db = loadStreetDB();

  // Exact
  let row = db.find(
    (r) => norm(r.district) === d && norm(r.ward) === w && norm(r.street) === st
  );
  if (!row) {
    // StartsWith on street within district+ward
    row = db.find(
      (r) =>
        norm(r.district) === d &&
        norm(r.ward) === w &&
        norm(r.street).startsWith(st)
    );
  }
  if (!row) {
    // Contains
    row = db.find(
      (r) =>
        norm(r.district) === d &&
        norm(r.ward) === w &&
        norm(r.street).includes(st)
    );
  }
  return row?.kmFromKeko;
}

/**
 * Produce a DeliveryQuote using the dataset if possible.
 * - Rounds distance up to the next 100 m
 * - Fee is computed by the affordable tariff and rounded to 500
 */
export async function quoteDelivery(input: QuoteInput): Promise<DeliveryQuote | null> {
  const km = findStreetKm(input.district, input.ward, input.street);
  if (typeof km !== "number") return null;

  const metersRaw = Math.max(0, km * 1000);
  const metersRounded = roundMetersUp100(metersRaw);
  const kmDisplay = metersRounded / 1000;

  const fee = feeForDarDistance(kmDisplay);
  const feeRounded = roundFeeTo500(fee);

  return {
    source: "dataset",
    district: input.district,
    ward: input.ward,
    street: input.street,
    distance_m: Math.round(metersRaw),
    distance_m_rounded: metersRounded,
    distance_km_display: kmDisplay,
    fee_tzs: fee,
    fee_tzs_rounded: feeRounded,
    tariffVersion: AFFORDABLE_TARIFF_VERSION,
  };
}

/**
 * Fallback quote when a street isn’t in the dataset.
 * - Uses a provided defaultKm (e.g., 3 km) or 3 km if not provided
 * - Applies the same rounding rules & tariff
 */
export function fallbackQuote(input: QuoteInput & { defaultKm?: number }): DeliveryQuote {
  const km = Math.max(0, Number(input.defaultKm ?? 3) || 3);
  const metersRaw = km * 1000;
  const metersRounded = roundMetersUp100(metersRaw);
  const kmDisplay = metersRounded / 1000;

  const fee = feeForDarDistance(kmDisplay);
  const feeRounded = roundFeeTo500(fee);

  return {
    source: "fallback",
    district: input.district,
    ward: input.ward,
    street: input.street,
    distance_m: Math.round(metersRaw),
    distance_m_rounded: metersRounded,
    distance_km_display: kmDisplay,
    fee_tzs: fee,
    fee_tzs_rounded: feeRounded,
    tariffVersion: AFFORDABLE_TARIFF_VERSION,
  };
}

/* ------------------------------ Default -------------------------------- */

export default {
  OUTSIDE_DAR_FLAT,
  AFFORDABLE_TARIFF_VERSION,
  feeForDarDistance,
  roundMetersUp100,
  roundFeeTo500,
  getAllKnownStreets,
  quoteDelivery,
  fallbackQuote,
};
