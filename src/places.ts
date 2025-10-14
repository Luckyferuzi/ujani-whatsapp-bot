import fs from 'node:fs';
import path from 'node:path';
import { env } from './config.js';

type Row = {
  REGION: string;
  REGIONCODE: number;
  DISTRICT: string;
  DISTRICTCODE: number;
  WARD: string;
  WARDCODE: number;
  STREET: string; // place / mtaa
  PLACES: string;
  DISTANCE_FROM_KEKO_MAGURUMBASI_KM: number;
};

let CACHE: { rows: Row[] } | null = null;

function normalize(s: string): string {
  return (s || '')
    .normalize('NFD')
    // @ts-ignore Unicode property escapes in Node 18+
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[’'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadRows(): Row[] {
  if (CACHE) return CACHE.rows;
  const file = path.resolve('src/data/dar_location.json');
  const raw = fs.readFileSync(file, 'utf8');
  CACHE = { rows: JSON.parse(raw) as Row[] };
  return CACHE.rows;
}

/** exact (district, street) match → km; else null */
function lookupExactKm(district: string, place: string): number | null {
  const rows = loadRows();
  const nd = normalize(district);
  const np = normalize(place);
  const inDistrict = rows.filter(r => normalize(r.DISTRICT) === nd);
  const hit = inDistrict.find(r => normalize(r.STREET) === np);
  return hit ? hit.DISTANCE_FROM_KEKO_MAGURUMBASI_KM : null;
}

/** district average → km; else null */
function districtAverageKm(district: string): number | null {
  const rows = loadRows();
  const nd = normalize(district);
  const inDistrict = rows.filter(r => normalize(r.DISTRICT) === nd);
  if (!inDistrict.length) return null;
  const avg = inDistrict.reduce((s, r) => s + (r.DISTANCE_FROM_KEKO_MAGURUMBASI_KM || 0), 0) / inDistrict.length;
  return +avg.toFixed(2);
}

/** Resolve km: exact → district_avg → DEFAULT_DISTANCE_KM */
export function resolveDistanceKm(
  district: string,
  place?: string
): { km: number; from: 'place' | 'district_avg' | 'default' } {
  if (place) {
    const ex = lookupExactKm(district, place);
    if (typeof ex === 'number') return { km: ex, from: 'place' };
  }
  const avg = districtAverageKm(district);
  if (typeof avg === 'number') return { km: avg, from: 'district_avg' };
  return { km: env.DEFAULT_DISTANCE_KM, from: 'default' };
}
