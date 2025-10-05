// src/wards.ts
// Auto-discovers the CSV without Render config.
// Looks in: src/app/, src/data/, data/, repo root (in that order).
// Still honors DAR_WARDS_CSV if set.

import fs from 'node:fs';
import path from 'node:path';

type Row = { district: string; ward: string; km: number };

const byDistrict = new Map<string, string[]>();
const kmIndex = new Map<string, number>(); // key `${district}::${ward}`

function findCsvPath(): string | null {
  const cwd = process.cwd();
  const candidates = [
    process.env.DAR_WARDS_CSV || '', // optional env override
    path.resolve(cwd, 'src', 'app',  'dar_wards_distance_clean.csv'), // <— your current location
    path.resolve(cwd, 'src', 'data', 'dar_wards_distance_clean.csv'),
    path.resolve(cwd, 'data',        'dar_wards_distance_clean.csv'),
    path.resolve(cwd,                'dar_wards_distance_clean.csv'),
  ].filter(Boolean);

  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch { /* ignore */ }
  }
  return null;
}

function parseCSVLine(line: string): string[] {
  return line.split(',').map(s => s.trim());
}

(function load() {
  const csvPath = findCsvPath();
  if (!csvPath) {
    console.warn('[wards] CSV not found in src/app, src/data, data, or repo root. Falling back to free-text flow.');
    return;
  }

  let raw = fs.readFileSync(csvPath, 'utf8');
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // strip BOM

  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (lines.length <= 1) {
    console.warn(`[wards] CSV at ${csvPath} has no data rows`);
    return;
  }

  const header = parseCSVLine(lines[0]).map(h => h.toLowerCase());
  const di = header.findIndex(h => h === 'district');
  const wi = header.findIndex(h => h === 'ward');
  let ki = header.findIndex(h => h === 'km' || h === 'distance_km');
  if (ki < 0) ki = header.findIndex(h => h.includes('km'));

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCSVLine(lines[i]);
    const district = (cols[di] || '').trim();
    const ward = (cols[wi] || '').trim();
    const kmRaw = (cols[ki] || '').replace(/[^\d.,]/g, '').replace(',', '.');
    const km = kmRaw ? parseFloat(kmRaw) : 0;
    if (!district || !ward) continue;

    const list = byDistrict.get(district) || [];
    list.push(ward);
    byDistrict.set(district, list);

    const key = `${district.toLowerCase()}::${ward.toLowerCase()}`;
    kmIndex.set(key, isFinite(km) ? km : 0);
  }

  for (const [d, list] of byDistrict) {
    list.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  }

  console.log(`[wards] Loaded CSV from: ${csvPath} (districts: ${byDistrict.size})`);
})();

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
