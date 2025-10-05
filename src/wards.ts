// src/wards.ts
// JSON-first, CSV-fallback ward/district loader.
// Always works on Render without extra config.
// Looks for dar_wards.json in: src/app/, src/data/, data/, repo root (in that order).
// If not found, tries dar_wards_distance_clean.csv in same places.
// Exposes:
//   - listDistricts(): string[]
//   - listWardsByDistrict(district: string): string[]
//   - getDistanceKm(district: string, ward: string): number | undefined

import fs from 'node:fs';
import path from 'node:path';

type WardJson = { name: string; km: number };
type DistrictJson = { name: string; wards: WardJson[] };
type WardsJson = { districts: DistrictJson[] };

const byDistrict = new Map<string, string[]>();      // district -> [ward names]
const kmIndex = new Map<string, number>();           // `${district}::${ward}` -> km

const CANDIDATE_JSON = [
  process.env.DAR_WARDS_JSON || '', // optional override (not required)
  path.resolve(process.cwd(), 'src', 'app',  'dar_wards.json'),
  path.resolve(process.cwd(), 'src', 'data', 'dar_wards.json'),
  path.resolve(process.cwd(), 'data',        'dar_wards.json'),
  path.resolve(process.cwd(),                'dar_wards.json'),
].filter(Boolean);

const CANDIDATE_CSV = [
  process.env.DAR_WARDS_CSV || '', // optional override (not required)
  path.resolve(process.cwd(), 'src', 'app',  'dar_wards_distance_clean.csv'),
  path.resolve(process.cwd(), 'src', 'data', 'dar_wards_distance_clean.csv'),
  path.resolve(process.cwd(), 'data',        'dar_wards_distance_clean.csv'),
  path.resolve(process.cwd(),                'dar_wards_distance_clean.csv'),
].filter(Boolean);

function tryLoadJson(): string | null {
  for (const p of CANDIDATE_JSON) {
    try { if (p && fs.existsSync(p)) return p; } catch { /* ignore */ }
  }
  return null;
}
function tryLoadCsv(): string | null {
  for (const p of CANDIDATE_CSV) {
    try { if (p && fs.existsSync(p)) return p; } catch { /* ignore */ }
  }
  return null;
}

function parseCSVLine(line: string): string[] {
  // Simple splitter — dataset should not contain quoted commas
  return line.split(',').map(s => s.trim());
}

(function load() {
  // 1) JSON first
  const jsonPath = tryLoadJson();
  if (jsonPath) {
    try {
      let raw = fs.readFileSync(jsonPath, 'utf8');
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1); // strip BOM
      const data = JSON.parse(raw) as WardsJson;

      for (const d of data.districts || []) {
        const dName = d.name?.trim();
        if (!dName) continue;
        const wards = (d.wards || []).map(w => w.name).filter(Boolean);
        if (wards.length) byDistrict.set(dName, wards);
        for (const w of d.wards || []) {
          const wName = (w.name || '').trim();
          if (!wName) continue;
          const key = `${dName.toLowerCase()}::${wName.toLowerCase()}`;
          const km = typeof w.km === 'number' && isFinite(w.km) ? w.km : 0;
          kmIndex.set(key, km);
        }
      }
      // Sort wards for nicer UX
      for (const [d, list] of byDistrict) list.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
      console.log(`[wards] Loaded JSON from: ${jsonPath} (districts: ${byDistrict.size})`);
      return;
    } catch (e) {
      console.warn(`[wards] Failed to parse JSON at ${jsonPath}:`, (e as Error).message);
    }
  }

  // 2) CSV fallback
  const csvPath = tryLoadCsv();
  if (!csvPath) {
    console.warn('[wards] No JSON/CSV found. District/Ward lists disabled; webhook will fallback to free-text.');
    return;
  }

  try {
    let raw = fs.readFileSync(csvPath, 'utf8');
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
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
    for (const [d, list] of byDistrict) list.sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
    console.log(`[wards] Loaded CSV from: ${csvPath} (districts: ${byDistrict.size})`);
  } catch (e) {
    console.warn(`[wards] Failed to parse CSV: ${(e as Error).message}`);
  }
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
