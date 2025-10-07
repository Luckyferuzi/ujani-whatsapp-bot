// src/wards.ts
// Smart lookup for Dar es Salaam delivery distances.
// Works with flexible JSON at: src/data/dar_location.json
//
// Supported shapes:
//
// 1) Object style (recommended)
// {
//   "Kariakoo": 2.45,
//   "Mabibo": { "distance_km": 6.1, "aliases": ["Mabibo Hostel"],
//               "streets": {
//                 "Swahili": 2.9,
//                 "Msimbazi": { "distance_km": 2.7, "aliases": ["Msimbazi St"] }
//               }
//   }
// }
//
// 2) Array style
// [
//   { "ward": "Kariakoo", "km": 2.45,
//     "streets": [ { "name": "Swahili", "km": 2.9 },
//                  { "name": "Msimbazi", "distance_km": 2.7, "aliases": ["Msimbazi St"] } ],
//     "aliases": ["Kariako"]
//   }
// ]
//
// Public API:
// - loadLocations(): Promise<void>   // optional; preloads the JSON
// - resolveDarLocation(input: string): ResolveResult
// - lookupWardAndStreet(ward: string, street?: string): ResolveResult
// - getDistanceKm(query: string): number | null        // backward-compatible
// - listWards(): string[]
// - listStreets(ward: string): string[]
// - isLoaded(): boolean
//
// The helpers are synchronous to call; they lazy-load the JSON on first use.
// If you want to guarantee data is loaded at boot, call loadLocations() once.

import * as fsSync from "node:fs";
import * as fs from "node:fs/promises";
import * as path from "node:path";

/* ------------------------------- Types ----------------------------------- */

export type ResolveResult = {
  km: number | null;
  used: "street_exact" | "ward_only" | "nearest_location" | "unknown";
  confidence: number;
  resolvedStreet?: string | null;
  ward?: string | null;
  district?: string | null; // optional free text (e.g., "Ilala")
};

type AnyRec = Record<string, any>;
type DarRoot = AnyRec | AnyRec[];

/* ----------------------------- Module state ------------------------------ */

let DB: DarRoot | null = null;
let LOADED = false;

const CANDIDATES = [
  "src/data/dar_location.json",
  "src/app/dar_location.json",
  "dar_location.json",
].map((p) => path.resolve(process.cwd(), p));

/* ------------------------------- Utils ----------------------------------- */

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const isObj = (v: any): v is Record<string, any> =>
  v != null && typeof v === "object" && !Array.isArray(v);

function readWardName(w: any): string {
  if (typeof w === "string") return w;
  return w?.ward ?? w?.name ?? w?.ward_name ?? "";
}

function readWardKm(entry: any): number | null {
  if (typeof entry === "number") return entry;
  if (isObj(entry)) {
    if (typeof entry.km === "number") return entry.km;
    if (typeof entry.distance_km === "number") return entry.distance_km;
  }
  return null;
}

function readStreetName(st: any, keyName?: string): string {
  if (typeof st === "string") return st;
  return st?.name ?? keyName ?? "";
}

function readStreetKm(wardEntry: any, streetEntry: any, wardKm: number | null): number | null {
  if (typeof streetEntry === "number") return streetEntry;
  if (isObj(streetEntry)) {
    if (typeof streetEntry.km === "number") return streetEntry.km;
    if (typeof streetEntry.distance_km === "number") return streetEntry.distance_km;
    if (typeof streetEntry.extra_km === "number" && typeof wardKm === "number") {
      return wardKm + streetEntry.extra_km;
    }
  }
  return wardKm;
}

/* ------------------------------ Loading ---------------------------------- */

function tryLoadSync(): boolean {
  for (const p of CANDIDATES) {
    try {
      if (fsSync.existsSync(p)) {
        const raw = fsSync.readFileSync(p, "utf8");
        DB = JSON.parse(raw);
        LOADED = true;
        return true;
      }
    } catch {
      // try next candidate
    }
  }
  return false;
}

export async function loadLocations(): Promise<void> {
  if (LOADED && DB) return;
  for (const p of CANDIDATES) {
    try {
      const raw = await fs.readFile(p, "utf8");
      DB = JSON.parse(raw);
      LOADED = true;
      return;
    } catch {
      // try next
    }
  }
  // final attempt sync (for environments that dislike async fs in cold start)
  tryLoadSync();
}

export function isLoaded() {
  return LOADED && !!DB;
}

/* ------------------------------ Iterators -------------------------------- */

function* iterateWards(): Generator<{ wardName: string; wardEntry: any }> {
  if (!DB) return;

  // Object style
  if (isObj(DB) && !Array.isArray(DB)) {
    for (const [wardName, wardEntry] of Object.entries(DB)) {
      yield { wardName, wardEntry };
    }
    return;
  }

  // Array style
  if (Array.isArray(DB)) {
    for (const w of DB) {
      const wardName = readWardName(w);
      if (!wardName) continue;
      yield { wardName, wardEntry: w };
    }
  }
}

function getWardAliases(w: any): string[] {
  if (!isObj(w)) return [];
  const a = w.aliases;
  return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
}

function getWardStreetsArray(w: any): any[] {
  if (!isObj(w)) return [];
  // allowed: array OR object map
  if (Array.isArray(w.streets)) return w.streets;
  if (isObj(w.streets)) {
    return Object.entries(w.streets).map(([name, v]) =>
      isObj(v) ? { ...v, name } : { name, km: v }
    );
  }
  return [];
}

function getStreetAliases(st: any): string[] {
  if (!isObj(st)) return [];
  const a = st.aliases;
  return Array.isArray(a) ? a.filter((x) => typeof x === "string") : [];
}

/* --------------------------- Public functions ---------------------------- */

/** High-level: resolve from a string like "Kariakoo, Ilala" or "Swahili, Ilala" or "Kariakoo" */
export function resolveDarLocation(input: string): ResolveResult {
  if (!isLoaded()) tryLoadSync();

  if (!DB) {
    return { km: null, used: "unknown", confidence: 0 };
  }

  // Split by comma: left = ward/street/area, right = district(wilaya) (optional)
  const parts = input.split(/[，,]/).map((s) => s?.trim()).filter(Boolean);
  const leftRaw = parts[0] ?? "";
  const rightRaw = parts[1] ?? "";
  const left = norm(leftRaw);
  const district = rightRaw || null;

  // 1) Try to match ward (by name or alias)
  for (const { wardName, wardEntry } of iterateWards()) {
    const wn = norm(wardName);
    const aliases = getWardAliases(wardEntry);
    const wardHit = left && (left === wn || aliases.some((a) => norm(a) === left));

    const wardKm = readWardKm(wardEntry);

    if (wardHit) {
      // If user actually typed a street as left, try streets
      const streets = getWardStreetsArray(wardEntry);
      for (const st of streets) {
        const stName = readStreetName(st);
        const stn = norm(stName);
        const als = getStreetAliases(st);
        if (left === stn || als.some((a) => norm(a) === left)) {
          const km = readStreetKm(wardEntry, st, wardKm);
          return {
            km,
            used: "street_exact",
            confidence: 0.98,
            resolvedStreet: stName,
            ward: wardName,
            district,
          };
        }
      }

      // Otherwise, ward-only
      return {
        km: wardKm,
        used: "ward_only",
        confidence: wardKm != null ? 0.9 : 0.2,
        resolvedStreet: null,
        ward: wardName,
        district,
      };
    }
  }

  // 2) If not a ward hit, try global street match (treat left as street)
  if (left) {
    for (const { wardName, wardEntry } of iterateWards()) {
      const wardKm = readWardKm(wardEntry);
      const streets = getWardStreetsArray(wardEntry);
      for (const st of streets) {
        const stName = readStreetName(st);
        const stn = norm(stName);
        const als = getStreetAliases(st);
        if (left === stn || als.some((a) => norm(a) === left)) {
          const km = readStreetKm(wardEntry, st, wardKm);
          return {
            km,
            used: "nearest_location",
            confidence: 0.7,
            resolvedStreet: stName,
            ward: wardName,
            district,
          };
        }
      }
    }
  }

  // 3) Unknown
  return { km: null, used: "unknown", confidence: 0, district };
}

/** Direct resolver when you already have them separated */
export function lookupWardAndStreet(
  wardInput: string,
  streetInput?: string
): ResolveResult {
  if (!isLoaded()) tryLoadSync();

  if (!DB) {
    return { km: null, used: "unknown", confidence: 0, resolvedStreet: null, ward: null };
  }

  const wKey = norm(wardInput || "");
  const sKey = streetInput ? norm(streetInput) : null;

  // 1) Find the ward
  for (const { wardName, wardEntry } of iterateWards()) {
    const wn = norm(wardName);
    const aliases = getWardAliases(wardEntry);
    const isWard = wKey && (wKey === wn || aliases.some((a) => norm(a) === wKey));

    const wardKm = readWardKm(wardEntry);

    if (isWard) {
      if (sKey) {
        // 1a) street inside this ward
        const streets = getWardStreetsArray(wardEntry);
        for (const st of streets) {
          const stName = readStreetName(st);
          const stn = norm(stName);
          const als = getStreetAliases(st);
          if (sKey === stn || als.some((a) => norm(a) === sKey)) {
            const km = readStreetKm(wardEntry, st, wardKm);
            return {
              km,
              used: "street_exact",
              confidence: 0.98,
              resolvedStreet: stName,
              ward: wardName,
            };
          }
        }
        // no street hit → ward-only
        return {
          km: wardKm,
          used: "ward_only",
          confidence: wardKm != null ? 0.9 : 0.2,
          resolvedStreet: null,
          ward: wardName,
        };
      }

      // 1b) no street provided → ward-only
      return {
        km: wardKm,
        used: "ward_only",
        confidence: wardKm != null ? 0.9 : 0.2,
        resolvedStreet: null,
        ward: wardName,
      };
    }
  }

  // 2) If ward not found but we have a street, try global street match
  if (sKey) {
    for (const { wardName, wardEntry } of iterateWards()) {
      const wardKm = readWardKm(wardEntry);
      const streets = getWardStreetsArray(wardEntry);
      for (const st of streets) {
        const stName = readStreetName(st);
        const stn = norm(stName);
        const als = getStreetAliases(st);
        if (sKey === stn || als.some((a) => norm(a) === sKey)) {
          const km = readStreetKm(wardEntry, st, wardKm);
          return {
            km,
            used: "nearest_location",
            confidence: 0.7,
            resolvedStreet: stName,
            ward: wardName,
          };
        }
      }
    }
  }

  // 3) unknown
  return { km: null, used: "unknown", confidence: 0, resolvedStreet: null, ward: null };
}

/** Backward-compatible helper: try to resolve a single free-form query to km */
export function getDistanceKm(query: string): number | null {
  const r = resolveDarLocation(query);
  return r?.km ?? null;
}

/** Convenience listings (for UI lists, optional) */
export function listWards(): string[] {
  if (!isLoaded()) tryLoadSync();
  const names: string[] = [];
  for (const { wardName } of iterateWards()) names.push(wardName);
  // natural sort
  return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

export function listStreets(ward: string): string[] {
  if (!isLoaded()) tryLoadSync();
  const out: string[] = [];
  const wKey = norm(ward);
  for (const { wardName, wardEntry } of iterateWards()) {
    const wn = norm(wardName);
    const aliases = getWardAliases(wardEntry);
    if (wKey === wn || aliases.some((a) => norm(a) === wKey)) {
      const streets = getWardStreetsArray(wardEntry);
      for (const st of streets) {
        const name = readStreetName(st);
        if (name) out.push(name);
      }
      break;
    }
  }
  return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}
