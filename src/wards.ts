// src/wards.ts
// Loads Dar wards/districts from CSV and exposes:
// - listDistricts()
// - listWardsByDistrict(district)
// - getDistanceKm(district, ward)
//
// CSV columns supported (case-insensitive): district, ward, km | distance_km
// You can override the file path via env DAR_WARDS_CSV.

import fs from 'node:fs';
import path from 'node:path';

type Row = { district: string; ward: string; km: number };

const CSV_PATH = process.env.DAR_WARDS_CSV
  ? path.resolve(process.env.DAR_WARDS_CSV)
  : path.resolve(process.cwd(), 'dar_wards_distance_clean.csv');

const rows: Row[] = [];
const byDistrict = new Map<string, string[]>();
const kmIndex = new Map<string, number>(); // key `${district}::${ward}`

function parseCSVLine(line: string): string[] {
  // simple CSV splitter (dataset shouldn't include quoted commas)
  return line.split(',').map(s => s.trim());
}

(function load() {
  if (!fs.existsSync(CSV_PATH)) {
    console.warn(`[wards] CSV not found at ${CSV_PATH}`);
    return;
  }
  const raw = fs.readFileSync(CSV_PATH, 'utf8');
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) return;

  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase());
  const di = header.findIndex(h => h === 'district');
  const wi = header.findIndex(h => h === 'ward');
  let ki = header.findIndex(h => h === 'km' || h === 'distance_km');
  if (ki < 0) ki = header.findIndex(h => h.includes('km')); // fallback to any km-like column

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const district = (cols[di] || '').trim();
    const ward = (cols[wi] || '').trim();
    const kmRaw = (cols[ki] || '').replace(/[^\d.]/g, '');
    const km = kmRaw ? parseFloat(kRawSafe(kmRaw)) : 0;

    if (!district || !ward) continue;

    rows.push({ district, ward, km: isFinite(km) ? km : 0 });

    const key = `${district.toLowerCase()}::${ward.toLowerCase()}`;
    kmIndex.set(key, isFinite(km) ? km : 0);

    const list = byDistrict.get(district) || [];
    list.push(ward);
    byDistrict.set(district, list);
  }

  // sort ward lists alphabetically for UX
  for (const [d, list] of byDistrict) {
    list.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    byDistrict.set(d, list);
  }
})();

function kRawSafe(x: string): string {
  // Allow "12.3", "12", "12,3"
  return x.replace(',', '.');
}

export function listDistricts(): string[] {
  return Array.from(byDistrict.keys()).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

export function listWardsByDistrict(district: string): string[] {
  return byDistrict.get(district) ?? [];
}

export function getDistanceKm(district: string, ward: string): number | undefined {
  const key = `${district.toLowerCase()}::${ward.toLowerCase()}`;
  return kmIndex.get(key);
}
