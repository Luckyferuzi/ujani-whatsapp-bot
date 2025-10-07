// src/routes/webhook.ts
// WhatsApp Cloud API webhook + Smart Delivery (street/location) flow.
// ESM + TypeScript. Minimal assumptions about the rest of your app.

import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import pino from 'pino';
import { env } from '../config.js';

import {
  getSession, setExpecting, setLang,
  startCheckout, updateCheckout, setCheckoutStage, resetCheckout, setLastOrderId,
  addToCart, clearCart, cartTotal,
  setSelectedDistrict, setSelectedWard, setSelectedStreet,
  nextStreetPage, setLastLocation
} from '../session.js';

import { t } from '../i18n.js';
import {
  loadLocations, listDistricts, listWards, listStreets, resolveDistanceKm
} from '../wards.js';

import { quoteDelivery } from '../delivery.js';

import {
  sendText, sendInteractiveList, sendInteractiveButtons,
  type ListRow, type ListSection
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
    // Raw body must be preserved by an upstream body parser middleware
    const raw = (req as any).rawBody as Buffer;
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
/*                                Mini Catalog                                */
/* -------------------------------------------------------------------------- */
// Keep it simple so you can test. You likely already have these elsewhere.
const PRODUCTS = [
  {
    id: 'kiboko',
    titleKey: 'product_kiboko_title',
    taglineKey: 'product_kiboko_tagline',
    priceTZS: 140_000,
    bulletsKey: 'product_kiboko_points'
  },
  {
    id: 'furaha',
    titleKey: 'product_furaha_title',
    taglineKey: 'product_furaha_tagline',
    priceTZS: 110_000,
    bulletsKey: 'product_furaha_points'
  },
  {
    id: 'promax_a',
    titleKey: 'product_promax_a_title',
    taglineKey: 'product_promax_tagline',
    priceTZS: 350_000,
    bulletsKey: 'product_promax_a_points'
  },
  {
    id: 'promax_b',
    titleKey: 'product_promax_b_title',
    taglineKey: 'product_promax_tagline',
    priceTZS: 350_000,
    bulletsKey: 'product_promax_b_points'
  },
  {
    id: 'promax_c',
    titleKey: 'product_promax_c_title',
    taglineKey: 'product_promax_tagline',
    priceTZS: 350_000,
    bulletsKey: 'product_promax_c_points'
  }
];

/* -------------------------------------------------------------------------- */
/*                                  Utilities                                 */
/* -------------------------------------------------------------------------- */

function formatTZS(n: number): string {
  return new Intl.NumberFormat('en-TZ', { style: 'currency', currency: 'TZS', maximumFractionDigits: 0 }).format(n);
}
function plainTZS(n: number): string {
  return formatTZS(n).replace(/\u00a0/g, ' ').replace('TZS', '').trim();
}

function expectingIs(phone: string, e: import('../session.js').Expecting) {
  return getSession(phone).expecting === e;
}

// clamp helpers for WA UI (optional: keeps text tidy)
const clampHeader = (s: string) => s.slice(0, 60);
const clampBody = (s: string) => s.slice(0, 1024);
const clampButton = (s: string) => s.slice(0, 20);
const clampSection = (s: string) => s.slice(0, 24);

/* -------------------------------------------------------------------------- */
/*                               WhatsApp Parsing                             */
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
      const displayLang = (contacts[0]?.profile?.name_lang || '').toLowerCase();
      for (const m of messages) {
        const msg: InMsg = { from: String(m?.from || '') };
        if (!msg.from) continue;
        if (displayLang === 'sw') msg.lang = 'sw';

        if (m.type === 'text' && m.text?.body) {
          msg.text = String(m.text.body || '').trim();
        }

        if (m.type === 'interactive') {
          const lr = m.interactive?.list_reply ?? m.interactive?.button_reply;
          if (lr) {
            msg.interactiveId = lr.id;
            msg.interactiveTitle = lr.title;
          }
        }

        if (m.type === 'location' && m.location) {
          msg.location = { latitude: m.location.latitude, longitude: m.location.longitude };
        }

        out.push(msg);
      }
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/*                             Router: POST handler                           */
/* -------------------------------------------------------------------------- */

webhook.post('/', async (req: Request, res: Response) => {
  if (!verifySignature(req)) {
    // soft-accept to prevent endless retries, but log it
    logger.warn('Invalid signature (soft-accepted)');
    return res.sendStatus(200);
  }

  // Ensure location data is warmed
  try { await loadLocations(); } catch (e) { logger.warn('No location data yet'); }

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
/*                                Message Logic                               */
/* -------------------------------------------------------------------------- */

async function handleMessage(m: InMsg) {
  const from = m.from;
  const s = getSession(from);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';

  if (m.lang) setLang(from, m.lang);

  // 1) Location pin (only if we asked)
  if (m.location && expectingIs(from, 'awaiting_location')) {
    setLastLocation(from, m.location.latitude, m.location.longitude);
    await handleQuote(from, { pin: m.location });
    setExpecting(from, 'confirm_delivery');
    return;
  }

  // 2) Interactive replies
  if (m.interactiveId) {
    await routeInteractive(from, m);
    return;
  }

  // 3) Text messages
  const text = (m.text || '').trim();
  if (!text) return;

  // (a) Numeric street selection
  if (expectingIs(from, 'select_street') && /^\d+$/.test(text)) {
    const all = listStreets(s.selectedDistrict!, s.selectedWard!);
    const pageBase = (s.streetPage ?? 1) - 1; // we increment after sending a page
    const idx = pageBase * 9 + (parseInt(text, 10) - 1);
    const chosen = all[idx];
    if (!chosen) {
      await sendText({ to: from, body: t(lang, 'invalid_choice') });
      return;
    }
    setSelectedStreet(from, chosen);
    await sendText({ to: from, body: t(lang, 'street_selected', { ward: s.selectedWard!, street: chosen }) });
    await handleQuote(from, { street: chosen });
    setExpecting(from, 'confirm_delivery');
    return;
  }

  // (b) next page for streets
  if (expectingIs(from, 'select_street') && /^n(ext)?$/i.test(text)) {
    await renderStreetPage(from);
    return;
  }

  // (c) Free-typed street name
  if (expectingIs(from, 'select_street') && text.length >= 3) {
    setSelectedStreet(from, text);
    await sendText({ to: from, body: t(lang, 'street_selected', { ward: s.selectedWard!, street: text }) });
    await handleQuote(from, { street: text });
    setExpecting(from, 'confirm_delivery');
    return;
  }

  // (d) Basic commands (menu / products / cart) — tiny demo flow
  if (/^menu$/i.test(text)) {
    await showMenu(from);
    return;
  }

  if (/^(products?|bidhaa)$/i.test(text)) {
    await showProducts(from);
    return;
  }

  if (/^(cart|kikapu)$/i.test(text)) {
    await showCart(from);
    return;
  }

  // If nothing matched, show menu
  await showMenu(from);
}

/* -------------------------------------------------------------------------- */
/*                           Interactive Router Bits                          */
/* -------------------------------------------------------------------------- */

async function routeInteractive(from: string, m: InMsg) {
  const s = getSession(from);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';
  const id = m.interactiveId!;
  const title = m.interactiveTitle || '';

  // District picked
  if (id.startsWith('district::')) {
    const district = id.split('::')[1] || title;
    setSelectedDistrict(from, district);
    setExpecting(from, 'select_ward');
    await renderWardPicker(from);
    return;
  }

  // Ward picked
  if (id.startsWith('ward::')) {
    const ward = id.split('::')[1] || title;
    setSelectedWard(from, ward);
    // If we have streets, open street picker; else quote directly
    const streets = listStreets(s.selectedDistrict!, ward);
    if (streets.length) {
      setExpecting(from, 'select_street');
      await renderStreetPage(from);
    } else {
      await handleQuote(from, { street: null });
      setExpecting(from, 'confirm_delivery');
    }
    return;
  }

  // Street list items / skip / send location
  if (id === 'street_skip') {
    await sendText({ to: from, body: t(lang, 'street_skipped', { ward: s.selectedWard || '' }) });
    await handleQuote(from, { street: null });
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
    const all = listStreets(s.selectedDistrict!, s.selectedWard!);
    const chosen = all[idx];
    if (chosen) {
      setSelectedStreet(from, chosen);
      await sendText({ to: from, body: t(lang, 'street_selected', { ward: s.selectedWard!, street: chosen }) });
      await handleQuote(from, { street: chosen });
      setExpecting(from, 'confirm_delivery');
    }
    return;
  }

  // Product actions
  if (id.startsWith('prod::details::')) {
    const pid = id.split('::')[2];
    await showProductDetails(from, pid);
    return;
  }
  if (id.startsWith('prod::add::')) {
    const pid = id.split('::')[2];
    const p = PRODUCTS.find(x => x.id === pid);
    if (p) {
      addToCart(from, { productId: p.id, title: t(lang, p.titleKey), priceTZS: p.priceTZS, qty: 1 });
      await sendText({ to: from, body: `✅ ${t(lang, p.titleKey)} — added to cart.` });
      await showCart(from);
    }
    return;
  }
  if (id.startsWith('prod::buy::')) {
    const pid = id.split('::')[2];
    const p = PRODUCTS.find(x => x.id === pid);
    if (p) {
      clearCart(from);
      addToCart(from, { productId: p.id, title: t(lang, p.titleKey), priceTZS: p.priceTZS, qty: 1 });
      await showCart(from);
    }
    return;
  }

  // Checkout actions
  if (id === 'cart::checkout') {
    startCheckout(from);
    await askFulfillment(from);
    return;
  }
  if (id === 'fulfill::pickup') {
    updateCheckout(from, { fulfillment: 'pickup' });
    setCheckoutStage(from, 'asked_phone');
    setExpecting(from, 'delivery_phone');
    await sendText({ to: from, body: t(lang, 'ask_delivery_phone') });
    return;
  }
  if (id === 'fulfill::delivery') {
    updateCheckout(from, { fulfillment: 'delivery', addressCountry: 'Dar es Salaam' } as any);
    await renderDistrictPicker(from);
    setExpecting(from, 'select_district');
    return;
  }

  // Fallback: menu
  await showMenu(from);
}

/* -------------------------------------------------------------------------- */
/*                            Pickers (District/Ward)                         */
/* -------------------------------------------------------------------------- */

async function renderDistrictPicker(to: string) {
  await loadLocations();
  const s = getSession(to);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';

  const districts = listDistricts();
  const rows: ListRow[] = districts.map((name) => ({ id: `district::${name}`, title: name }));
  const sections: ListSection[] = [{ title: t(lang, 'pick_district_title'), rows }];

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
  const wards = listWards(s.selectedDistrict!);
  const rows: ListRow[] = wards.map((name) => ({ id: `ward::${name}`, title: name }));
  const sections: ListSection[] = [{ title: t(lang, 'pick_ward_title'), rows }];

  await sendInteractiveList({
    to,
    body: t(lang, 'pick_ward_body'),
    buttonText: t(lang, 'menu_button'),
    sections
  });
}

async function renderStreetPage(to: string) {
  const s = getSession(to);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';

  const all = listStreets(s.selectedDistrict!, s.selectedWard!);
  const page = s.streetPage ?? 0;

  const rows = buildStreetRows(all, page);
  const sections: ListSection[] = [{ title: clampSection(s.selectedWard || ''), rows }];

  await sendInteractiveList({
    to,
    body: t(lang, 'pick_street_body'),
    buttonText: t(lang, 'menu_button'),
    sections
  });

  nextStreetPage(to); // advance so numeric replies map correctly
}

const PAGE_SIZE = 9;
function buildStreetRows(all: string[], page = 0): ListRow[] {
  const start = page * PAGE_SIZE;
  const slice = all.slice(start, start + PAGE_SIZE);
  const rows: ListRow[] = slice.map((name, i) => ({
    id: `street_${start + i}`,
    title: `${i + 1}) ${name}`
  }));
  rows.push({ id: 'street_skip', title: '⏭️ Skip / Ruka' });
  rows.push({ id: 'street_send_location', title: '📡 Share Location / Tuma Location' });
  return rows;
}

/* -------------------------------------------------------------------------- */
/*                        Quoting (street / ward / pin)                       */
/* -------------------------------------------------------------------------- */

async function handleQuote(
  to: string,
  source: { street?: string | null; pin?: { latitude: number; longitude: number } | null }
) {
  const s = getSession(to);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';

  const res = resolveDistanceKm({
    district: s.selectedDistrict!,
    ward: s.selectedWard!,
    streetName: source.street ?? null,
    pin: source.pin ? { lat: source.pin.latitude, lon: source.pin.longitude } : null
  });

  const km = res.km ?? 0;

  // Build keyPath for overrides: District::Ward[::Street]
  const keyPath = res.resolvedStreet
    ? `${s.selectedDistrict}::${s.selectedWard}::${res.resolvedStreet}`
    : `${s.selectedDistrict}::${s.selectedWard}`;

  const q = await quoteDelivery(km, keyPath);

  updateCheckout(to, {
    deliveryKm: km,
    deliveryFeeTZS: q.total_fee_tzs,
    matchType: res.used,
    matchConfidence: res.confidence,
    resolvedStreet: res.resolvedStreet ?? null
  });

  await sendText({
    to,
    body: t(lang, 'delivery_quote', {
      km: km.toFixed(2),
      fee: q.total_fee_tzs.toLocaleString('en-TZ')
    })
  });

  // (Optional) you can show summary here or continue your existing flow
}

/* -------------------------------------------------------------------------- */
/*                                Mini Flows                                  */
/* -------------------------------------------------------------------------- */

async function showMenu(to: string) {
  const s = getSession(to);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';

  const rows: ListRow[] = [
    { id: 'menu::products', title: t(lang, 'section_products') },
    { id: 'menu::help', title: t(lang, 'section_help') },
    { id: 'menu::settings', title: t(lang, 'section_settings') }
  ];

  await sendInteractiveList({
    to,
    body: t(lang, 'menu_body'),
    buttonText: t(lang, 'menu_button'),
    sections: [{ title: 'Menu', rows }]
  });
}

async function showProducts(to: string) {
  const s = getSession(to);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';

  const rows: ListRow[] = PRODUCTS.map(p => ({
    id: `prod::details::${p.id}`,
    title: t(lang, p.titleKey),
    description: t(lang, p.taglineKey)
  }));

  await sendInteractiveList({
    to,
    body: t(lang, 'products_pick'),
    buttonText: t(lang, 'menu_button'),
    sections: [{ title: t(lang, 'products_title'), rows }]
  });
}

async function showProductDetails(to: string, productId: string) {
  const s = getSession(to);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';
  const p = PRODUCTS.find(x => x.id === productId);
  if (!p) return showProducts(to);

  const price = plainTZS(p.priceTZS);
  const bullets = t(lang, p.bulletsKey).split('\n').map(l => `• ${l}`).join('\n');

  const body =
    `${t(lang, p.titleKey)}\n` +
    `${t(lang, p.taglineKey)}\n` +
    `${t(lang, p.titleKey).includes('Ujani') ? '' : ''}` +
    `${t(lang, p.titleKey).includes('Ujani') ? '' : ''}` +
    `${t(lang, p.titleKey).includes('Ujani') ? '' : ''}` +
    `${t(lang, p.titleKey).includes('Ujani') ? '' : ''}` +
    `${t(lang, p.titleKey).includes('Ujani') ? '' : ''}` +
    `${t(lang, p.titleKey).includes('Ujani') ? '' : ''}`; // keep simple

  await sendText({ to, body: `${t(lang, p.titleKey)}\n${t(lang, p.taglineKey)}\n${t(lang, p.priceTZS ? 'product_kiboko_price_label' : 'product_promax_price_label', { price })}\n\n${bullets}` });

  await sendInteractiveButtons({
    to,
    body: t(lang, 'products_pick'),
    buttons: [
      { id: `prod::add::${p.id}`, title: t(lang, 'btn_add_to_cart') },
      { id: `prod::buy::${p.id}`, title: t(lang, 'btn_buy_now') },
      { id: 'menu::products', title: t(lang, 'back_to_menu') }
    ]
  });
}

async function showCart(to: string) {
  const s = getSession(to);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';
  const total = cartTotal(to);

  if (!s.cart.items.length) {
    await sendText({ to, body: t(lang, 'cart_empty') });
    return showProducts(to);
  }

  const lines = s.cart.items.map(it =>
    t(lang, 'cart_summary_line', {
      title: it.title,
      qty: String(it.qty),
      price: plainTZS(it.priceTZS * it.qty)
    })
  ).join('\n');

  await sendText({
    to,
    body:
      `${t(lang, 'cart_summary_title')}\n${lines}\n` +
      t(lang, 'cart_summary_total', { total: plainTZS(total) })
  });

  await sendInteractiveButtons({
    to,
    body: t(lang, 'cart_actions'),
    buttons: [
      { id: 'cart::checkout', title: t(lang, 'btn_cart_checkout') },
      { id: 'menu::products', title: t(lang, 'btn_cart_back') }
    ]
  });
}

async function askFulfillment(to: string) {
  const s = getSession(to);
  const lang: 'sw' | 'en' = s.lang ?? 'sw';

  await sendInteractiveButtons({
    to,
    body: t(lang, 'choose_fulfillment'),
    buttons: [
      { id: 'fulfill::pickup', title: t(lang, 'btn_pickup') },
      { id: 'fulfill::delivery', title: t(lang, 'btn_delivery') }
    ]
  });
}

/* -------------------------------------------------------------------------- */
/*                                    EOF                                     */
/* -------------------------------------------------------------------------- */
