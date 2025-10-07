import fs from "fs/promises";
import path from "path";

/** Data shapes */
export interface Street { name: string; distance_km?: number; lat?: number; lon?: number; }
export interface Ward   { name: string; km?: number; streets?: Street[] }
export interface District { name: string; wards: Ward[] }
export interface Locations { region?: string; districts: District[] }

export type MatchType = "street_exact" | "street_fuzzy" | "nearest_location" | "ward_only" | "derived_min_street";

/** Runtime cache */
let LOC: Locations | null = null;

/** Utility: canonicalize names for matching */
function canon(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Simple Levenshtein distance */
function lev(a: string, b: string) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}
function similarity(a: string, b: string) {
  const ca = canon(a), cb = canon(b);
  const dist = lev(ca, cb);
  const maxLen = Math.max(ca.length, cb.length) || 1;
  return 1 - dist / maxLen; // 0..1
}

/** Haversine (meters) */
function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Try multiple paths for a JSON */
async function tryReadJson<T = any>(...relPaths: string[]): Promise<T | null> {
  for (const p of relPaths) {
    try {
      const full = path.resolve(process.cwd(), p);
      const raw = await fs.readFile(full, "utf8");
      return JSON.parse(raw) as T;
    } catch {
      /* keep trying */
    }
  }
  return null;
}

/** Load locations
 * Priority:
 * 1) src/app/dar_wards_with_streets.json
 * 2) src/data/dar_wards_with_streets.json
 * 3) src/app/dar_wards.json (ward-only)
 * 4) src/data/dar_wards.json
 */
export async function loadLocations(): Promise<Locations> {
  if (LOC) return LOC;

  const withStreets = await tryReadJson<Locations>(
    "src/app/dar_wards_with_streets.json",
    "src/data/dar_wards_with_streets.json",
    "dar_wards_with_streets.json"
  );
  if (withStreets?.districts?.length) {
    LOC = normalize(withStreets);
    return LOC;
  }

  const wardOnly = await tryReadJson<{ districts: District[] }>(
    "src/app/dar_wards.json",
    "src/data/dar_wards.json",
    "dar_wards.json"
  );
  if (wardOnly?.districts?.length) {
    LOC = normalize({ region: "Dar es Salaam", districts: wardOnly.districts });
    return LOC;
  }

  throw new Error("No location data found. Provide dar_wards_with_streets.json or dar_wards.json.");
}

/** Normalize: ensure arrays/fields exist */
function normalize(src: Locations): Locations {
  for (const d of src.districts) {
    d.wards ||= [];
    for (const w of d.wards) {
      w.streets ||= [];
    }
  }
  return src;
}

/** Getters */
export function listDistricts(): string[] {
  if (!LOC) throw new Error("Locations not loaded");
  return LOC.districts.map(d => d.name);
}
export function listWards(district: string): string[] {
  if (!LOC) throw new Error("Locations not loaded");
  const d = LOC.districts.find(x => canon(x.name) === canon(district));
  return d ? d.wards.map(w => w.name) : [];
}
export function listStreets(district: string, ward: string): string[] {
  if (!LOC) throw new Error("Locations not loaded");
  const d = LOC.districts.find(x => canon(x.name) === canon(district));
  const w = d?.wards.find(x => canon(x.name) === canon(ward));
  return w ? (w.streets || []).map(s => s.name) : [];
}

/** Core resolution + distance */
export function resolveDistanceKm(params: {
  district: string;
  ward: string;
  streetName?: string | null;
  pin?: { lat: number; lon: number } | null;
  fuzzyThreshold?: number; // default 0.9
}): {
  km: number | null;
  used: MatchType;
  confidence: number;
  resolvedStreet?: string;
} {
  if (!LOC) throw new Error("Locations not loaded");
  const { district, ward, streetName, pin } = params;
  const fuzzyThreshold = params.fuzzyThreshold ?? 0.9;

  const d = LOC.districts.find(x => canon(x.name) === canon(district));
  const w = d?.wards.find(x => canon(x.name) === canon(ward));

  if (!d || !w) return { km: null, used: "ward_only", confidence: 0 };

  // 1) If a street was provided, try exact then fuzzy
  if (streetName && w.streets && w.streets.length) {
    const exact = w.streets.find(s => canon(s.name) === canon(streetName));
    if (exact?.distance_km != null) {
      return { km: exact.distance_km, used: "street_exact", confidence: 1, resolvedStreet: exact.name };
    }
    // fuzzy
    let best: { s: Street; sim: number } | null = null;
    for (const s of w.streets) {
      const sim = similarity(s.name, streetName);
      if (!best || sim > best.sim) best = { s, sim };
    }
    if (best && best.sim >= fuzzyThreshold && best.s.distance_km != null) {
      return { km: best.s.distance_km, used: "street_fuzzy", confidence: best.sim, resolvedStreet: best.s.name };
    }
  }

  // 2) If a pin is provided and we have coords on streets, pick nearest within ~400m
  if (pin && w.streets && w.streets.length) {
    let nearest: { s: Street; m: number } | null = null;
    for (const s of w.streets) {
      if (s.lat == null || s.lon == null) continue;
      const m = haversine(pin.lat, pin.lon, s.lat, s.lon);
      if (!nearest || m < nearest.m) nearest = { s, m };
    }
    if (nearest && nearest.s.distance_km != null) {
      // Consider within 400m "confident"
      const conf = Math.max(0, Math.min(1, 1 - nearest.m / 400));
      return {
        km: nearest.s.distance_km,
        used: "nearest_location",
        confidence: conf,
        resolvedStreet: nearest.s.name
      };
    }
  }

  // 3) Fall back to ward.km, else derive min(street.distance_km)
  if (w.km != null) return { km: w.km, used: "ward_only", confidence: 0.75 };
  if (w.streets?.length) {
    const dists = w.streets.map(s => s.distance_km).filter((x): x is number => x != null);
    if (dists.length) {
      const min = Math.min(...dists);
      return { km: min, used: "derived_min_street", confidence: 0.6 };
    }
  }
  return { km: null, used: "ward_only", confidence: 0 };
}
