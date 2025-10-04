// src/wards.ts
// Lazy CSV loader + helpers to resolve Ward/District from free-text,
// and get distance (km) from Keko Furniture reference.

import fs from 'node:fs';
import path from 'node:path';

type Row = { region: string; district: string; ward: string; distance: number };

let WARDS: Row[] | null = null;

function findCsv(): string | null {
  const candidates = [
    path.join(process.cwd(), 'data', 'dar_wards_distance_clean.csv'),
    path.join(process.cwd(), 'assets', 'dar_wards_distance_clean.csv'),
    path.join(process.cwd(), 'dar_wards_distance_clean.csv'),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return p;
  return null;
}

function load(): Row[] {
  if (WARDS) return WARDS;
  const p = findCsv();
  if (!p) {
    console.warn('[wards] CSV not found — delivery-fee by ward will be disabled.');
    WARDS = [];
    return WARDS;
  }
  const raw = fs.readFileSync(p, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  lines.shift(); // header: region,district,ward,distance
  WARDS = lines.map((ln) => {
    const [region, district, ward, dist] = ln.split(',').map((s) => s.trim());
    return { region, district, ward, distance: Number(dist) || 0 };
  });
  return WARDS!;
}

function norm(s: string) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve free text like "tabata kimanga ilala" → { ward: "Kimanga", district: "Ilala" } */
export function resolveWardDistrictFromFreeText(text: string): { ward: string; district: string } | null {
  const rows = load();
  if (!rows.length) return null;

  const t = norm(text);
  const byWard = rows.filter((r) => t.includes(norm(r.ward)));
  if (byWard.length === 1) return { ward: byWard[0].ward, district: byWard[0].district };
  if (byWard.length > 1) {
    // Prefer candidates whose district is also present
    const narrowed = byWard.filter((r) => t.includes(norm(r.district)));
    if (narrowed.length === 1) return { ward: narrowed[0].ward, district: narrowed[0].district };
    // Fallback to the longest ward name
    narrowed.sort((a, b) => b.ward.length - a.ward.length);
    return { ward: narrowed[0].ward, district: narrowed[0].district };
  }

  // No ward hit — try district first and pick any ward included
  const byDistrict = rows.filter((r) => t.includes(norm(r.district)));
  if (byDistrict.length === 1) return { ward: byDistrict[0].ward, district: byDistrict[0].district };

  return null;
}

/** Distance in km for exact district+ward pair (or null if not found). */
export function getDistanceKm(district: string, ward: string): number | null {
  const rows = load();
  const r = rows.find((x) => norm(x.district) === norm(district) && norm(x.ward) === norm(ward));
  return r ? r.distance : null;
}
