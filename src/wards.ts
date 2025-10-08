// src/wards.ts
// District/Ward utilities for Dar es Salaam delivery flows.
// - JSON-first: src/data/dar_location.json (array of street rows)
// - CSV fallback (optional): src/data/ward_distance.csv (district,ward,km)
// - Exposes: listDistricts, listWardsByDistrict, getDistanceKm

import fs from "node:fs";
import path from "node:path";

/* ------------------------------- Types -------------------------------- */

type StreetRowRaw = {
  REGION?: string;
  DISTRICT?: string;
  WARD?: string;
  STREET?: string;
  PLACES?: string;
  DISTANCE_FROM_KEKO_MAGURUMBASI_KM?: number;
};

type StreetRow = {
  region: string;
  district: string;
  ward: string;
  street: string;
  km: number; // distance from Keko (km)
};

type WardKey = string; // `${district.toLowerCase()}|${ward.toLowerCase()}`

/* ------------------------------- Cache -------------------------------- */

let __loaded = false;

const districtsSet = new Set<string>();
const wardsByDistrict = new Map<string, Set<string>>(); // district -> wards
const wardKmSamples = new Map<WardKey, number[]>();     // wardKey -> km samples
const wardKmMedian = new Map<WardKey, number>();        // wardKey -> median km

/* ------------------------------ Helpers ------------------------------- */

function norm(s: string | undefined | null): string {
  return (s || "").toString().trim();
}
function lc(s: string | undefined | null): string {
  return norm(s).toLowerCase();
}
function wardKey(district: string, ward: string): WardKey {
  return `${lc(district)}|${lc(ward)}`;
}
function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const mid = Math.floor(a.length - 1) / 2;
  const lo = a[Math.floor(mid)];
  const hi = a[Math.ceil(mid)];
  return (lo + hi) / 2;
}
function addDistrict(d: string) {
  const dd = norm(d);
  if (!dd) return;
  districtsSet.add(dd);
}
function addWard(district: string, ward: string) {
  const dd = norm(district);
  const ww = norm(ward);
  if (!dd || !ww) return;
  if (!wardsByDistrict.has(dd)) wardsByDistrict.set(dd, new Set());
  wardsByDistrict.get(dd)!.add(ww);
}

/* ------------------------- Dataset: JSON-first ------------------------ */

function candidateJsonPaths(): string[] {
  return [
    path.resolve(process.cwd(), "src/data/dar_location.json"),
    path.resolve(process.cwd(), "data/dar_location.json"),
    path.resolve(process.cwd(), "dar_location.json"),
  ];
}

function loadStreetsJSON(): StreetRow[] {
  for (const p of candidateJsonPaths()) {
    try {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf8");
        const arr = JSON.parse(raw) as StreetRowRaw[];
        if (Array.isArray(arr)) {
          const rows: StreetRow[] = [];
          for (const r of arr) {
            const km = Number(r?.DISTANCE_FROM_KEKO_MAGURUMBASI_KM);
            if (!isFinite(km)) continue;
            rows.push({
              region: norm(r?.REGION),
              district: norm(r?.DISTRICT),
              ward: norm(r?.WARD),
              street: norm(r?.STREET),
              km: Math.max(0, km),
            });
          }
          return rows;
        }
      }
    } catch {
      // try next path
    }
  }
  return [];
}

/* ----------------------- Dataset: CSV (fallback) ---------------------- */

function candidateCsvPaths(): string[] {
  return [
    path.resolve(process.cwd(), "src/data/ward_distance.csv"),
    path.resolve(process.cwd(), "data/ward_distance.csv"),
    path.resolve(process.cwd(), "ward_distance.csv"),
  ];
}

/**
 * CSV expected columns (case-insensitive):
 *   district, ward, km
 */
function loadWardCSV(): Array<{ district: string; ward: string; km: number }> {
  for (const p of candidateCsvPaths()) {
    try {
      if (!fs.existsSync(p)) continue;
      const raw = fs.readFileSync(p, "utf8");
      const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
      if (!lines.length) continue;

      const header = lines[0].split(",").map((h) => lc(h));
      const idxDistrict = header.findIndex((h) => h === "district");
      const idxWard = header.findIndex((h) => h === "ward");
      const idxKm = header.findIndex((h) => h === "km");
      if (idxDistrict < 0 || idxWard < 0 || idxKm < 0) continue;

      const out: Array<{ district: string; ward: string; km: number }> = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",");
        const d = norm(cols[idxDistrict]);
        const w = norm(cols[idxWard]);
        const k = Number(cols[idxKm]);
        if (!d || !w || !isFinite(k)) continue;
        out.push({ district: d, ward: w, km: Math.max(0, k) });
      }
      if (out.length) return out;
    } catch {
      // ignore and try next file
    }
  }
  return [];
}

/* ------------------------------ Loader -------------------------------- */

function ensureLoaded() {
  if (__loaded) return;

  // 1) JSON streets → aggregate by ward (median km)
  const streets = loadStreetsJSON();
  for (const r of streets) {
    if (!r.district || !r.ward) continue;
    addDistrict(r.district);
    addWard(r.district, r.ward);
    const key = wardKey(r.district, r.ward);
    if (!wardKmSamples.has(key)) wardKmSamples.set(key, []);
    wardKmSamples.get(key)!.push(r.km);
  }

  // 2) If no JSON rows, or to supplement missing wards, load CSV fallback
  const csv = loadWardCSV();
  for (const row of csv) {
    addDistrict(row.district);
    addWard(row.district, row.ward);
    const key = wardKey(row.district, row.ward);
    if (!wardKmSamples.has(key)) wardKmSamples.set(key, []);
    wardKmSamples.get(key)!.push(row.km);
  }

  // 3) Compute per-ward median
  for (const [key, samples] of wardKmSamples.entries()) {
    wardKmMedian.set(key, median(samples));
  }

  __loaded = true;
}

/* ------------------------------- API ---------------------------------- */

/**
 * Return all districts (sorted, unique, case-preserved from source).
 */
export function listDistricts(): string[] {
  ensureLoaded();
  return Array.from(districtsSet.values()).sort((a, b) => a.localeCompare(b));
}

/**
 * Return wards for a given district (sorted). Case-insensitive district match.
 */
export function listWardsByDistrict(district: string): string[] {
  ensureLoaded();
  if (!district) return [];
  // try exact district first
  if (wardsByDistrict.has(district)) {
    return Array.from(wardsByDistrict.get(district)!).sort((a, b) => a.localeCompare(b));
  }
  // case-insensitive match
  const dLow = lc(district);
  for (const d of wardsByDistrict.keys()) {
    if (lc(d) === dLow) {
      return Array.from(wardsByDistrict.get(d)!).sort((a, b) => a.localeCompare(b));
    }
  }
  return [];
}

/**
 * Get a typical distance (km) from Keko → {district, ward}.
 * Uses the median of street distances in that ward (or CSV value).
 * Returns undefined if no info is found.
 */
export function getDistanceKm(district: string, ward: string): number | undefined {
  ensureLoaded();
  if (!district || !ward) return undefined;

  // direct
  let key = wardKey(district, ward);
  if (wardKmMedian.has(key)) return wardKmMedian.get(key);

  // case-insensitive search
  const dLow = lc(district);
  const wLow = lc(ward);

  for (const [k, v] of wardKmMedian.entries()) {
    const [kd, kw] = k.split("|");
    if (kd === dLow && kw === wLow) return v;
  }

  // last resort: district matched + ward "startsWith" or "includes"
  for (const [k, v] of wardKmMedian.entries()) {
    const [kd, kw] = k.split("|");
    if (kd !== dLow) continue;
    if (kw.startsWith(wLow) || kw.includes(wLow)) return v;
  }

  return undefined;
}

/**
 * Development-only: clear and reload caches (hot reload).
 */
export function __reloadWards(): void {
  __loaded = false;
  districtsSet.clear();
  wardsByDistrict.clear();
  wardKmSamples.clear();
  wardKmMedian.clear();
  ensureLoaded();
}

/**
 * Debug snapshot (for troubleshooting).
 */
export function __debugSnapshot(): {
  districtCount: number;
  wardCount: number;
  withKmCount: number;
} {
  ensureLoaded();
  let wardCount = 0;
  for (const set of wardsByDistrict.values()) wardCount += set.size;
  return {
    districtCount: districtsSet.size,
    wardCount,
    withKmCount: wardKmMedian.size,
  };
}

export default {
  listDistricts,
  listWardsByDistrict,
  getDistanceKm,
  __reloadWards,
  __debugSnapshot,
};
