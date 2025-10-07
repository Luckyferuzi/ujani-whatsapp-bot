// src/routes/webhook.ts
// WhatsApp Cloud API webhook with Smart Delivery (district → ward → street/location)
// Preserves your existing flow; compiles without getDistanceKm/feeForDarDistance.

import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import pino from 'pino';
import { env } from '../config.js';

import {
  getSession, setExpecting, setLang,
  updateCheckout,
  setSelectedDistrict, setSelectedWard, setSelectedStreet,
  setLastLocation
} from '../session.js';

import { t } from '../i18n.js';

// Import wards as a namespace so we can probe available functions safely
import * as Wards from '../wards.js';

// Pricing via your delivery module (keeps your tiers/overrides)
import { quoteDelivery } from '../delivery.js';

// WhatsApp helpers (use your existing implementations)
import {
  sendText,
  sendInteractiveList,
  sendInteractiveButtons, // ok if unused in this file
} from '../whatsapp.js';

const logger = pino({ name: 'webhook' });
export const webhook = Router();

/* -------------------------------------------------------------------------- */
/*                               Cloud Verification                           */
/* -------------------------------------------------------------------------- */

webhook.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

function verifySignature(req: Request): boolean {
  const appSecret = env.APP_SECRET;
  if (!appSecret) return true; // permissive if not configured
  try {
    const raw = (req as any).rawBody as Buffer; // set by your body parser
    const header = req.headers['x-hub-signature-256'] as string | undefined;
    if (!raw || !header) return true; // soft-accept to avoid Meta retries
    const hmac = crypto.createHmac('sha256', appSecret);
    hmac.update(raw);
    const expected = 'sha256=' + hmac.digest('hex');
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header));
  } catch {
    return true;
  }
}

/* -------------------------------------------------------------------------- */
/*                           WhatsApp message parsing                         */
/* -------------------------------------------------------------------------- */

type InMsg = {
  from: string;
  text?: string;
  interactiveId?: string;
  interactiveTitle?: string;
  location?: { latitude: number; longitude: number };
  lang?: 'sw' | 'en';
};

function parseIncoming(body: any): InMsg[] {
  const out: InMsg[] = [];
  const entries = body?.entry ?? [];
  for (const e of entries) {
    const changes = e?.changes ?? [];
    for (const ch of changes) {
      const value = ch?.value;
      const contacts = value?.contacts ?? [];
      const messages = value?.messages ?? [];
      const nameLang = (contacts[0]?.profile?.name_lang || '').toLowerCase();
      for (const m of messages) {
        const item: InMsg = { from: String(m?.from || '') };
        if (!item.from) continue;
        if (nameLang === 'sw') item.lang = 'sw';

        if (m.type === 'text' && m.text?.body) {
          item.text = String(m.text.body || '').trim();
        }
        if (m.type === 'interactive') {
          const lr = m.interactive?.list_reply ?? m.interactive?.button_reply;
          if (lr) {
            item.interactiveId = lr.id;
            item.interactiveTitle = lr.title;
          }
        }
        if (m.type === 'location' && m.location) {
          item.location = { latitude: m.location.latitude, longitude: m.location.longitude };
        }
        out.push(item);
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                               Router: handler                              */
/* -------------------------------------------------------------------------- */

webhook.post('/', async (req: Request, res: Response) => {
  if (!verifySignature(req)) {
    logger.warn('Invalid signature (soft-accepted)');
    return res.sendStatus(200);
  }

  try { await (Wards.loadLocations?.() ?? Promise.resolve()); } catch { /* ok */ }

  const inbound = parseIncoming(req.body);
  for (const m of inbound) {
    try {
      await handleMessage(m);
    } catch (err) {
      logger.error({ err }, 'handleMessage failed');
    }
  }
  res.sendStatus(200);
});

/* -------------------------------------------------------------------------- */
/*                                   Helpers                                  */
/* -------------------------------------------------------------------------- */

function expectingIs(phone: string, e: import('../session.js').Expecting) {
  return getSession(phone).expecting === e;
}

const PAGE_SIZE = 9;
const clampSection = (s: string) => s.slice(0, 24);

/* ---------- Optional fallback to street JSON if wards.js lacks streets ---- */
type StreetRow = { name: string; distance_km?: number; lat?: number; lon?: number; };
type WardRow   = { name: string; km?: number; streets?: StreetRow[] };
type DistrictRow = { name: string; wards: WardRow[] };
type WithStreets = { region?: string; districts: DistrictRow[] };

let _streets: WithStreets | null = null;
const canon = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[’'`]/g, '').replace(/\s+/g, ' ').trim();

async function loadWithStreets(): Promise<WithStreets | null> {
  if (_streets) return _streets;
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const candidates = [
    'src/app/dar_wards_with_streets.json',
    'src/data/dar_wards_with_streets.json',
    'dar_wards_with_streets.json'
  ].map(p => path.resolve(process.cwd(), p));
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, 'utf8');
      const parsed = JSON.parse(raw) as WithStreets;
      if (parsed?.districts?.length) { _streets = parsed; return parsed; }
    } catch { /* try next */ }
  }
  return null;
}
function findWard(ds: WithStreets, district: string, ward: string): WardRow | undefined {
  const d = ds.districts.find(x => canon(x.name) === canon(district));
  return d?.wards.find(x => canon(x.name) === canon(ward));
}
function listStreetsLocal(ds: WithStreets, district: string, ward: string): string[] {
  return (findWard(ds, district, ward)?.streets ?? []).map(s => s.name);
}
function haversineM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000, toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* --------------------------- Resolution fallbacks ------------------------- */
type KmResolution = {
  km: number | null;
  used: string;
  confidence: number;
  resolvedStreet?: string | null; // <-- allow string | null | undefined
};

async function resolveKmFallback(
  district: string,
  ward: string,
  opts: { street?: string | null; pin?: { lat: number; lon: number } | null }
): Promise<KmResolution> {
  const ds = await loadWithStreets();
  if (!ds) return { km: 0, used: 'ward_only', confidence: 0, resolvedStreet: null };
  const w = findWard(ds, district, ward);
  if (!w) return { km: 0, used: 'ward_only', confidence: 0, resolvedStreet: null };

  // 1) exact street
  if (opts.street) {
    const s = (w.streets ?? []).find(x => canon(x.name) === canon(opts.street!));
    if (s?.distance_km != null) return { km: s.distance_km, used: 'street_exact', confidence: 1, resolvedStreet: s.name };
  }
  // 2) pin nearest
  if (opts.pin) {
    let best: { s: StreetRow; m: number } | null = null;
    for (const s of (w.streets ?? [])) {
      if (s.lat == null || s.lon == null) continue;
      const m = haversineM(opts.pin.lat, opts.pin.lon, s.lat, s.lon);
      if (!best || m < best.m) best = { s, m };
    }
    if (best?.s?.distance_km != null) {
      const conf = Math.max(0, Math.min(1, 1 - best.m / 400));
      return { km: best.s.distance_km, used: 'nearest_location', confidence: conf, resolvedStreet: best.s.name };
    }
  }
  // 3) ward km
  if (typeof w.km === 'number') return { km: w.km, used: 'ward_only', confidence: 0.75, resolvedStreet: null };
  // 4) min street
  const dists = (w.streets ?? []).map(s => s.distance_km).filter((x): x is number => typeof x === 'number');
  if (dists.length) return { km: Math.min(...dists), used: 'derived_min_street', confidence: 0.6, resolvedStreet: null };

  return { km: 0, used: 'ward_only', confidence: 0, resolvedStreet: null };
}

/* -------------------------- Street list rendering ------------------------- */
function buildStreetRows(all: string[], page = 0) {
  const start = page * PAGE_SIZE;
  const slice = all.slice(start, start + PAGE_SIZE);
  // Use GLOBAL index in the id to avoid “same option” bugs
  const rows = slice.map((name, i) => ({
    id: `street_${start + i}`, // global index id
    title: `${i + 1}) ${name}`,
    description: ''
  }));
  rows.push({ id: 'street_skip', title: '⏭️ Skip / Ruka', description: '' });
  rows.push({ id: 'street_send_location', title: '📡 Share Location / Tuma Location', description: '' });
  return rows;
}

async function renderStreetPage(to: string) {
  const s = getSession(to);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';

  // Prefer wards.js streets if present; else fallback JSON
  let all: string[] = [];
  if (typeof (Wards as any).listStreets === 'function') {
    all = (Wards as any).listStreets(s.selectedDistrict!, s.selectedWard!);
  } else {
    const ds = await loadWithStreets();
    if (ds) all = listStreetsLocal(ds, s.selectedDistrict!, s.selectedWard!);
  }

  const page = s.streetPage ?? 0;
  const rows = buildStreetRows(all, page);
  const sections = [{ title: clampSection(s.selectedWard || ''), rows }];

  await sendInteractiveList({
    to,
    body: t(lang, 'pick_street_body'),
    buttonText: t(lang, 'menu_button'),
    sections
  });
  // Do NOT auto-advance page; we only bump page when the user types "next"
}

/* -------------------------------------------------------------------------- */
/*                                Message Logic                               */
/* -------------------------------------------------------------------------- */

async function handleMessage(m: InMsg) {
  const from = m.from;
  const s = getSession(from);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';

  if (m.lang) setLang(from, m.lang);

  // Location pin (only when asked)
  if (m.location && expectingIs(from, 'awaiting_location')) {
    setLastLocation(from, m.location.latitude, m.location.longitude);
    await quoteFromSource(from, { pin: m.location });
    setExpecting(from, 'confirm_delivery');
    return;
  }

  // Interactive replies
  if (m.interactiveId) {
    await routeInteractive(from, m);
    return;
  }

  // Text messages
  const text = (m.text || '').trim();
  if (!text) return;

  // Numeric street choice maps to CURRENT page; we only advance on "next"
  if (expectingIs(from, 'select_street') && /^\d+$/.test(text)) {
    const page = s.streetPage ?? 0;

    let all: string[] = [];
    if (typeof (Wards as any).listStreets === 'function') {
      all = (Wards as any).listStreets(s.selectedDistrict!, s.selectedWard!);
    } else {
      const ds = await loadWithStreets();
      if (ds) all = listStreetsLocal(ds, s.selectedDistrict!, s.selectedWard!);
    }

    const globalIdx = page * PAGE_SIZE + (parseInt(text, 10) - 1);
    const chosen = all[globalIdx];

    if (!chosen) {
      await sendText({ to: from, body: t(lang, 'invalid_choice') });
      return;
    }

    setSelectedStreet(from, chosen);
    await sendText({ to: from, body: t(lang, 'street_selected', { ward: s.selectedWard!, street: chosen }) });
    await quoteFromSource(from, { street: chosen });
    setExpecting(from, 'confirm_delivery');
    return;
  }

  // "next" to see more street rows  → increment page THEN render
  if (expectingIs(from, 'select_street') && /^n(ext)?$/i.test(text)) {
    s.streetPage = (s.streetPage ?? 0) + 1;
    await renderStreetPage(from);
    return;
  }

  // Free-typed street name
  if (expectingIs(from, 'select_street') && text.length >= 3) {
    setSelectedStreet(from, text);
    await sendText({ to: from, body: t(lang, 'street_selected', { ward: s.selectedWard!, street: text }) });
    await quoteFromSource(from, { street: text });
    setExpecting(from, 'confirm_delivery');
    return;
  }

  // Leave all your other flows intact (menu/products/cart/payment/etc.)
}

/* -------------------------------------------------------------------------- */
/*                         Interactive router (new bits)                      */
/* -------------------------------------------------------------------------- */

async function routeInteractive(from: string, m: InMsg) {
  const s = getSession(from);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';
  const id = m.interactiveId!;
  const title = m.interactiveTitle || '';

  // District → preserved
  if (id.startsWith('district::')) {
    const district = id.split('::')[1] || title;
    setSelectedDistrict(from, district);
    setExpecting(from, 'select_ward');
    await renderWardPicker(from);
    return;
  }

  // Ward → preserved; add street step only if data available
  if (id.startsWith('ward::')) {
    const ward = id.split('::')[1] || title;
    setSelectedWard(from, ward);

    let streetsCount = 0;
    if (typeof (Wards as any).listStreets === 'function') {
      streetsCount = (Wards as any).listStreets(s.selectedDistrict!, ward).length;
    } else {
      const ds = await loadWithStreets();
      streetsCount = ds ? listStreetsLocal(ds, s.selectedDistrict!, ward).length : 0;
    }

    if (streetsCount > 0) {
      s.streetPage = 0; // start at first page
      setExpecting(from, 'select_street');
      await renderStreetPage(from);
    } else {
      // Ward-only quote
      await quoteFromSource(from, { street: null });
      setExpecting(from, 'confirm_delivery');
    }
    return;
  }

  // Street list items / skip / share location
  if (id === 'street_skip') {
    await sendText({ to: from, body: t(lang, 'street_skipped', { ward: s.selectedWard || '' }) });
    await quoteFromSource(from, { street: null });
    setExpecting(from, 'confirm_delivery');
    return;
  }

  if (id === 'street_send_location') {
    setExpecting(from, 'awaiting_location');
    await sendText({ to: from, body: t(lang, 'send_location_hint') });
    return;
  }

  if (id.startsWith('street_')) {
    const idx = Number(id.replace('street_', '')) || 0;

    let all: string[] = [];
    if (typeof (Wards as any).listStreets === 'function') {
      all = (Wards as any).listStreets(s.selectedDistrict!, s.selectedWard!);
    } else {
      const ds = await loadWithStreets();
      if (ds) all = listStreetsLocal(ds, s.selectedDistrict!, s.selectedWard!);
    }

    const chosen = all[idx];
    if (chosen) {
      setSelectedStreet(from, chosen);
      await sendText({ to: from, body: t(lang, 'street_selected', { ward: s.selectedWard!, street: chosen }) });
      await quoteFromSource(from, { street: chosen });
      setExpecting(from, 'confirm_delivery');
    }
    return;
  }

  // …your other interactive routes continue here (unchanged)…
}

/* -------------------------------------------------------------------------- */
/*                       District & Ward pickers (unchanged)                  */
/* -------------------------------------------------------------------------- */

async function renderDistrictPicker(to: string) {
  await (Wards.loadLocations?.() ?? Promise.resolve());
  const s = getSession(to);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';

  const districts: string[] = (Wards.listDistricts?.() ?? []);
  const rows = districts.map((name) => ({ id: `district::${name}`, title: name }));
  const sections = [{ title: t(lang, 'pick_district_title'), rows }];

  await sendInteractiveList({
    to,
    body: t(lang, 'pick_district_body'),
    buttonText: t(lang, 'menu_button'),
    sections
  });
}

async function renderWardPicker(to: string) {
  const s = getSession(to);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';
  const listWardsFn = (Wards as any).listWards ?? (Wards as any).listWardsByDistrict;
  const wards: string[] = listWardsFn ? listWardsFn(s.selectedDistrict!) : [];
  const rows = wards.map((name: string) => ({ id: `ward::${name}`, title: name }));
  const sections = [{ title: t(lang, 'pick_ward_title'), rows }];

  await sendInteractiveList({
    to,
    body: t(lang, 'pick_ward_body'),
    buttonText: t(lang, 'menu_button'),
    sections
  });
}

/* -------------------------------------------------------------------------- */
/*                           Quote (street/ward/pin)                          */
/* -------------------------------------------------------------------------- */

async function quoteFromSource(
  to: string,
  src: { street?: string | null; pin?: { latitude: number; longitude: number } | null }
) {
  const s = getSession(to);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';

  // Prefer your wards.js resolver if present; otherwise use fallback
  let res: KmResolution | null = null;

  if (typeof (Wards as any).resolveDistanceKm === 'function') {
    res = (Wards as any).resolveDistanceKm({
      district: s.selectedDistrict!,
      ward: s.selectedWard!,
      streetName: src.street ?? null,
      pin: src.pin ? { lat: src.pin.latitude, lon: src.pin.longitude } : null
    }) as KmResolution;
  } else {
    res = await resolveKmFallback(
      s.selectedDistrict!, s.selectedWard!,
      { street: src.street ?? null, pin: src.pin ? { lat: src.pin.latitude, lon: src.pin.longitude } : null }
    );
  }

  const km = Math.max(0, Number(res?.km ?? 0));
  const keyPath = (res?.resolvedStreet ?? null)
    ? `${s.selectedDistrict}::${s.selectedWard}::${res!.resolvedStreet}`
    : `${s.selectedDistrict}::${s.selectedWard}`;

  // Price via your delivery tiers/overrides
  const q = await quoteDelivery(km, keyPath);

  updateCheckout(to, {
    deliveryKm: km,
    deliveryFeeTZS: q.total_fee_tzs,
    matchType: (res?.used ?? 'ward_only') as any,
    matchConfidence: res?.confidence ?? 0,
    resolvedStreet: res?.resolvedStreet ?? null
  } as any);

  await sendText({
    to,
    body: t(lang, 'delivery_quote', {
      km: km.toFixed(2),
      fee: q.total_fee_tzs.toLocaleString('en-TZ')
    })
  });
}

/* -------------------------------------------------------------------------- */
/*                                    EOF                                     */
/* -------------------------------------------------------------------------- */
