// src/routes/webhook.ts
import { Router, Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { env } from '../config.js';
import { t, Lang } from '../i18n.js';
import {
  sendText,
  sendListMessage,
  sendButtonsMessage,
  markAsRead,
  verifySignature,
  sendPaymentInstructions,
} from '../whatsapp.js';
import { feeForDarDistance } from '../delivery.js';
import { resolveDistanceKm } from '../places.js';
import {
  addOrder,
  computeSubtotal,
  computeTotal,
  OrderItem,
  setOrderProof,
  listOrdersByName,
  getMostRecentOrderByName,
} from '../orders.js';
import { getSession, saveSession, resetSession } from '../session.js';
import { buildMainMenu, getProductBySku } from '../menu.js';

export const webhook = Router();

/* ------------------------- lightweight per-user state ------------------------ */
const USER_LANG = new Map<string, Lang>();
const TRACK_AWAITING_NAME = new Set<string>();

type CartItem = OrderItem;
const CART = new Map<string, CartItem[]>();

// When "Nunua sasa" is chosen, hold a pending item for checkout only (not in cart)
const PENDING_ITEM = new Map<string, CartItem | null>();

// Outside/Inside stepper
type Step =
  | 'OUTSIDE_ASK_NAME'
  | 'OUTSIDE_ASK_PHONE'
  | 'OUTSIDE_ASK_REGION'
  | 'INSIDE_PICKUP_ASK_NAME'
  | 'INSIDE_PICKUP_ASK_PHONE'
  | 'INSIDE_DELIV_ASK_NAME'
  | 'INSIDE_DELIV_ASK_PHONE';
const STEP = new Map<string, Step>();

type Contact = { name?: string; phone?: string; region?: string };
const CONTACT = new Map<string, Contact>();

function getLang(user: string): Lang {
  return USER_LANG.get(user) ?? 'sw';
}
function setLang(user: string, lang: Lang) {
  USER_LANG.set(user, lang);
}
function getCart(u: string) { return CART.get(u) ?? []; }
function setCart(u: string, c: CartItem[]) { CART.set(u, c); }
function clearCart(u: string) { CART.delete(u); }
function addToCart(u: string, item: CartItem) {
  const cart = getCart(u);
  const same = cart.find(c => c.sku === item.sku && c.unitPrice === item.unitPrice);
  if (same) same.qty += item.qty; else cart.push({ ...item });
  setCart(u, cart);
}
function setPending(u: string, item: CartItem | null) { PENDING_ITEM.set(u, item); }
function getCheckoutItems(u: string): CartItem[] {
  const pending = PENDING_ITEM.get(u);
  if (pending) return [pending];
  return getCart(u);
}
function clearCheckoutContext(u: string) {
  setPending(u, null);
  STEP.delete(u);
  CONTACT.delete(u);
}

/* --------------------------------- verify ---------------------------------- */
webhook.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === env.VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

/* --------------------------------- receive --------------------------------- */
webhook.post('/webhook', async (req: Request, res: Response) => {
  try {
    const raw = (req as any).rawBody ?? JSON.stringify(req.body ?? {});
    const sig = req.headers['x-hub-signature-256'] as string | undefined;
    if (!verifySignature(raw, sig)) return res.sendStatus(403);

    const entries = req.body?.entry ?? [];
    for (const entry of entries) {
      const changes = entry?.changes ?? [];
      for (const ch of changes) {
        const value = ch?.value;
        const messages = value?.messages ?? [];
        for (const msg of messages) {
          const from = msg?.from as string;
          const mid = msg?.id as string | undefined;
          if (!from) continue;
          if (mid) await markAsRead(mid).catch(() => {});

          const lang = getLang(from);
          const tt = (k: string, p?: Record<string, string | number>) => t(lang, k, p);

          const type = msg?.type as string;
          const textBody: string | undefined = type === 'text' ? msg?.text?.body : undefined;

          let interactiveId: string | undefined;
          if (type === 'interactive') {
            const itype = msg.interactive?.type;
            if (itype === 'list_reply') interactiveId = msg.interactive?.list_reply?.id;
            if (itype === 'button_reply') interactiveId = msg.interactive?.button_reply?.id;
          }

          const hasImage = type === 'image';
          const imageId: string | undefined = hasImage ? msg.image?.id : undefined;

          // Always start at main menu on first contact or common "start" commands
          const s = getSession(from);
          if (!interactiveId && !hasImage) {
            const txt = (textBody || '').trim().toLowerCase();
            if (s.state === 'IDLE' || ['hi','hello','mambo','start','anza','menu','menyu'].includes(txt)) {
              await showMainMenu(from, tt);
              continue;
            }
          }

          // Interactive first
          if (interactiveId) {
            await handleInteractive(from, interactiveId, tt);
            continue;
          }

          // Track-by-name prompt
          if (TRACK_AWAITING_NAME.has(from) && textBody) {
            TRACK_AWAITING_NAME.delete(from);
            await handleTrackByName(from, textBody.trim(), tt);
            continue;
          }

          // Fallback to state/stepper
          await handleMessage(from, { text: textBody, hasImage, imageId }, tt);
        }
      }
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('webhook error:', e);
    res.sendStatus(200);
  }
});

/* -------------------- WhatsApp UI limits & list rendering ------------------- */
const MAX_LIST_TITLE = 24;
const MAX_LIST_DESC = 72;
function clip(s: string, n: number) { return !s ? s : (s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + '…'); }
function fitRow(titleIn: string, subtitleIn?: string) {
  let title = (titleIn || '').trim();
  let desc = (subtitleIn || '').trim();
  if (title.length > MAX_LIST_TITLE) {
    const parts = title.split(/\s*[—–-]\s*/);
    if (parts.length > 1) {
      const head = parts.shift() || '';
      const tail = parts.join(' - ');
      title = clip(head, MAX_LIST_TITLE);
      desc = desc ? `${tail} • ${desc}` : tail;
    } else {
      desc = desc ? `${title} • ${desc}` : title;
      title = clip(title, MAX_LIST_TITLE);
    }
  }
  desc = clip(desc, MAX_LIST_DESC);
  return { title, description: desc || undefined };
}
type ListRow = { id: string; title: string; description?: string };
type ListSection = { title?: string; rows: ListRow[] };

function toListSections(model: { sections: any[] }): ListSection[] {
  return model.sections.map((s: any) => ({
    title: s.title,
    rows: s.rows.map((r: any) => {
      const { title, description } = fitRow(r.title, r.subtitle);
      return { id: r.id, title, description };
    }),
  }));
}

/* ------------------------------ menu shortcuts ------------------------------ */
async function showMainMenu(user: string, tt: (k: string, p?: any) => string) {
  const model = buildMainMenu(k => tt(k));
  let sections = toListSections(model);

  // Show the opposite language on the toggle row:
  // - If UI is Swahili -> show "Change Language"
  // - If UI is English -> show "Badili Lugha"
  const isSw = getLang(user) === 'sw';
  const altLabel = isSw ? 'Change Language' : 'Badili Lugha';
  sections = sections.map(sec => ({
    ...sec,
    rows: sec.rows.map(r => (r.id === 'ACTION_CHANGE_LANGUAGE' ? { ...r, title: altLabel } : r)),
  }));

  await sendListMessage({
    to: user,
    header: model.header,
    body: tt('menu.header'), // "Angalia bidhaa zetu" / "Browse our products"
    footer: model.footer,
    buttonText: 'Fungua',
    sections,
  });
}

// Pro Max: show three packages (A/B/C) before actions
async function showProMaxVariants(user: string) {
  const parent = getProductBySku('PROMAX');
  const price = parent?.price ?? 0;
  const rows: ListRow[] = [
    { id: 'PRODUCT_PROMAX_A', title: 'Ujani Pro Max Kipakeji A', description: 'Dawa 3 za kunywa' },
    { id: 'PRODUCT_PROMAX_B', title: 'Ujani Pro Max Kipakeji B', description: 'Dawa 3 za kupaka' },
    { id: 'PRODUCT_PROMAX_C', title: 'Ujani Pro Max Kipakeji C', description: 'Kupaka 2, Kunywa 2' },
  ];

  await sendListMessage({
    to: user,
    header: parent?.name ?? 'Ujani Pro Max',
    body: `Chagua Kipakeji cha Ujani Pro Max — ${Math.round(price).toLocaleString('sw-TZ')} TZS`,
    footer: '',
    buttonText: 'Chagua',
    sections: [{ title: 'Kipakeji', rows }],
  });
}

// Map virtual Pro Max variants to a product-like object when not in catalog
function resolveProductForSku(sku: string) {
  const found = getProductBySku(sku);
  if (found) return found;

  if (sku.startsWith('PROMAX_')) {
    const base = getProductBySku('PROMAX');
    const price = base?.price ?? 0;
    const name =
      sku.endsWith('_A') ? 'Ujani Pro Max Kipakeji A' :
      sku.endsWith('_B') ? 'Ujani Pro Max Kipakeji B' :
      sku.endsWith('_C') ? 'Ujani Pro Max Kipakeji C' :
      base?.name ?? 'Ujani Pro Max';
    return { sku, name, price };
  }
  return undefined;
}

// Trimmed product actions (4)
async function showProductActions(user: string, sku: string) {
  const p = resolveProductForSku(sku) || getProductBySku(sku);
  if (!p) return;

  const rows: ListRow[] = [
    { id: `BUY_${p.sku}`,     title: 'Nunua sasa' },
    { id: `DETAILS_${p.sku}`, title: 'Maelezo zaidi' },
    { id: `ADD_${p.sku}`,     title: 'Ongeza kweny kikapu' },
    { id: 'ACTION_BACK',      title: 'Rudi menyu' },
  ];

  await sendListMessage({
    to: user,
    header: p.name,
    body: `${p.name} — ${Math.round(p.price).toLocaleString('sw-TZ')} TZS`,
    footer: '',
    buttonText: 'Chagua',
    sections: [{ title: 'Vitendo', rows }],
  });
}

/* ------------------------------ cart helpers ------------------------------- */
function cartSummaryText(user: string, tt: (k: string, p?: any) => string) {
  const items = getCart(user);
  if (!items.length) return tt('cart.empty');
  const lines = items.map(ci => tt('cart.summary_line', {
    title: ci.name,
    qty: ci.qty,
    price: Math.round(ci.unitPrice).toLocaleString('sw-TZ'),
  }));
  const subtotal = computeSubtotal(items);
  return [
    tt('cart.summary_header'),
    ...lines,
    tt('cart.summary_total', { total: Math.round(subtotal).toLocaleString('sw-TZ') }),
  ].join('\n');
}
async function showCart(user: string, tt: (k: string, p?: any) => string) {
  const body = cartSummaryText(user, tt);
  await sendButtonsMessage({
    to: user,
    body,
    buttons: [
      { id: 'ACTION_CHECKOUT', title: tt('menu.checkout') },
      { id: 'ACTION_BACK',     title: tt('menu.back_to_menu') },
    ],
  });
}

/* ---------------- Ward-average distance (Keko case & ENOENT safe) ----------- */
type DarRow = {
  REGION: string; REGIONCODE: number;
  DISTRICT: string; DISTRICTCODE: number;
  WARD: string; WARDCODE: number;
  STREET: string; PLACES: string;
  DISTANCE_FROM_KEKO_MAGURUMBASI_KM: number;
};

function normalize(s: string) {
  return (s || '')
    .normalize('NFD')
    // @ts-ignore
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[’'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveDataPath(): string {
  const fromEnv = process.env.DATA_LOCATION_PATH || (env as any).DATA_LOCATION_PATH;
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    fromEnv,
    path.resolve(process.cwd(), 'src/data/dar_location.json'),
    path.resolve(process.cwd(), 'data/dar_location.json'),
    path.resolve(here, '../data/dar_location.json'),
    path.resolve(here, '../../src/data/dar_location.json'),
  ].filter(Boolean) as string[];

  for (const pth of candidates) {
    try { if (pth && fs.existsSync(pth)) return pth; } catch {}
  }
  throw new Error(
    `dar_location.json not found. Tried:\n${candidates.map(c => ' - ' + c).join('\n')}\n` +
    `Set DATA_LOCATION_PATH to the correct file path.`
  );
}

let DAR_ROWS_CACHE: DarRow[] | null = null;
function loadDarRows(): DarRow[] {
  if (DAR_ROWS_CACHE) return DAR_ROWS_CACHE;
  const file = resolveDataPath();
  const raw = fs.readFileSync(file, 'utf8');
  DAR_ROWS_CACHE = JSON.parse(raw) as DarRow[];
  return DAR_ROWS_CACHE;
}

/** Ward average first; then exact street; then fallback (district avg / default). */
function distanceByWardOrFallback(district: string, wardOrStreet: string): { km: number; from: 'ward_avg' | 'place' | 'district_avg' | 'default' } {
  const rows = loadDarRows();
  const nd = normalize(district);
  const np = normalize(wardOrStreet);

  const inDist = rows.filter(r => normalize(r.DISTRICT) === nd);

  // WARD average
  const wardRows = inDist.filter(r => normalize(r.WARD) === np);
  if (wardRows.length) {
    const avg = wardRows.reduce((s, r) => s + (r.DISTANCE_FROM_KEKO_MAGURUMBASI_KM || 0), 0) / wardRows.length;
    return { km: +avg.toFixed(2), from: 'ward_avg' };
  }

  // Exact STREET
  const streetHit = inDist.find(r => normalize(r.STREET) === np);
  if (streetHit) {
    return { km: streetHit.DISTANCE_FROM_KEKO_MAGURUMBASI_KM, from: 'place' };
  }

  // Fallback resolver
  const r = resolveDistanceKm(district, wardOrStreet);
  return r.from === 'place'
    ? { km: r.km, from: 'place' }
    : r.from === 'district_avg'
      ? { km: r.km, from: 'district_avg' }
      : { km: r.km, from: 'default' };
}

/* --------------------------- interactive routing --------------------------- */
const OUTSIDE_DAR_FEE = 10_000;

async function handleInteractive(user: string, id: string, tt: (k: string, p?: any) => string) {
  // Global actions
  if (id === 'ACTION_VIEW_CART') return showCart(user, tt);
  if (id === 'ACTION_CHECKOUT') return beginCheckout(user, tt);
  if (id === 'ACTION_TRACK_BY_NAME') {
    TRACK_AWAITING_NAME.add(user);
    return sendText(user, tt('track.ask_name'));
  }
  if (id === 'ACTION_TALK_TO_AGENT') {
    return sendText(user, 'Ongea na wakala: ' + (env.BUSINESS_WA_NUMBER_E164 || ''));
  }
  if (id === 'ACTION_CHANGE_LANGUAGE') {
    // Toggle to the other language and redraw the menu
    const next = (getLang(user) === 'sw') ? 'en' : 'sw';
    setLang(user, next as Lang);
    return showMainMenu(user, (k, p) => t(next as Lang, k, p));
  }
  if (id === 'ACTION_BACK') return showMainMenu(user, tt);

  // Products:
  if (id.startsWith('PRODUCT_')) {
    const sku = id.replace('PRODUCT_', '');
    if (sku === 'PROMAX') return showProMaxVariants(user);    // Pro Max → A/B/C
    if (sku.startsWith('PROMAX_')) return showProductActions(user, sku);
    return showProductActions(user, sku);
  }

  if (id.startsWith('BUY_')) {
    const sku = id.replace('BUY_', '');
    const p = resolveProductForSku(sku) || getProductBySku(sku);
    if (!p) return;
    setPending(user, { sku: p.sku, name: p.name, qty: 1, unitPrice: p.price }); // DO NOT add to cart
    return beginCheckout(user, tt);
  }

  if (id.startsWith('ADD_')) {
    const sku = id.replace('ADD_', '');
    const p = resolveProductForSku(sku) || getProductBySku(sku);
    if (!p) return;
    addToCart(user, { sku: p.sku, name: p.name, qty: 1, unitPrice: p.price });
    return sendText(user, `✅ ${p.name} imeongezwa kwenye kikapu.`);
  }

  if (id.startsWith('DETAILS_')) {
    const sku = id.replace('DETAILS_', '');
    const isA = sku.startsWith('PROMAX_A');
    const isB = sku.startsWith('PROMAX_B');
    const isC = sku.startsWith('PROMAX_C');

    if (isA) await sendText(user, t(getLang(user), 'product.promax.package_a'));
    else if (isB) await sendText(user, t(getLang(user), 'product.promax.package_b'));
    else if (isC) await sendText(user, t(getLang(user), 'product.promax.package_c'));
    else {
      // fallback to any existing detail key you already have
      const p = getProductBySku(sku);
      if (p?.sku === 'KIBOKO') await sendText(user, t(getLang(user), 'product.kiboko.details'));
      if (p?.sku === 'FURAHA') await sendText(user, t(getLang(user), 'product.furaha.details'));
      if (p?.sku?.startsWith('PROMAX') || p?.sku === 'PROMAX') await sendText(user, t(getLang(user), 'product.promax.package_a'));
    }
    return showProductActions(user, sku);
  }

  // Location choice
  if (id === 'INSIDE_DAR') {
    return sendButtonsMessage({
      to: user,
      body: t(getLang(user), 'flow.ask_inside_choice'),
      buttons: [
        { id: 'INSIDE_PICKUP',   title: t(getLang(user), 'inside.choice_office') },
        { id: 'INSIDE_DELIVERY', title: t(getLang(user), 'inside.choice_delivery') },
        { id: 'ACTION_BACK',     title: t(getLang(user), 'menu.back_to_menu') },
      ],
    });
  }
  if (id === 'OUTSIDE_DAR') {
    STEP.set(user, 'OUTSIDE_ASK_NAME');
    CONTACT.set(user, {});
    await sendText(user, 'Tafadhali andika *jina kamili*.');
    return;
  }

  // Inside Dar branches
  if (id === 'INSIDE_PICKUP') {
    STEP.set(user, 'INSIDE_PICKUP_ASK_NAME');
    CONTACT.set(user, {});
    await sendText(user, 'Tafadhali andika *jina kamili*.');
    return;
  }
  if (id === 'INSIDE_DELIVERY') {
    STEP.set(user, 'INSIDE_DELIV_ASK_NAME');
    CONTACT.set(user, {});
    await sendText(user, 'Tafadhali andika *jina kamili*.');
    return;
  }

  return showMainMenu(user, tt);
}

/* ------------------------------- begin checkout ------------------------------ */
async function beginCheckout(user: string, tt: (k: string, p?: any) => string) {
  const items = getCheckoutItems(user);
  if (!items.length) return showMainMenu(user, tt);

  const s = getSession(user);
  s.state = 'ASK_IF_DAR'; // Ask location BEFORE any name
  saveSession(user, s);
  return sendButtonsMessage({
    to: user,
    body: 'Je, upo ndani ya Dar es Salaam?',
    buttons: [
      { id: 'INSIDE_DAR',  title: 'Ndani ya Dar' },
      { id: 'OUTSIDE_DAR', title: 'Nje ya Dar' },
      { id: 'ACTION_BACK', title: t(getLang(user), 'menu.back_to_menu') },
    ],
  });
}

/* ------------------------------- state machine ------------------------------ */
async function handleMessage(
  user: string,
  incoming: { text?: string; hasImage?: boolean; imageId?: string },
  tt: (k: string, p?: any) => string
) {
  const s = getSession(user);
  const text = (incoming.text ?? '').trim();

  // Stepper for outside/pickup/delivery
  const step = STEP.get(user);
  if (step) {
    const contact = CONTACT.get(user) || {};
    switch (step) {
      case 'OUTSIDE_ASK_NAME': {
        if (!text) return sendText(user, 'Tafadhali andika *jina kamili*.');
        contact.name = text; CONTACT.set(user, contact);
        STEP.set(user, 'OUTSIDE_ASK_PHONE');
        return sendText(user, 'Sawa, sasa andika *namba ya simu*.');
      }
      case 'OUTSIDE_ASK_PHONE': {
        if (!text) return sendText(user, 'Tafadhali andika *namba ya simu*.');
        contact.phone = text; CONTACT.set(user, contact);
        STEP.set(user, 'OUTSIDE_ASK_REGION');
        return sendText(user, 'Asante. Tafadhali andika *mkoa/sehemu* (mf. *Arusha*).');
      }
      case 'OUTSIDE_ASK_REGION': {
        if (!text) return sendText(user, 'Tafadhali andika *mkoa/sehemu*.');
        contact.region = text; CONTACT.set(user, contact);
        const items = getCheckoutItems(user);
        const subtotal = computeSubtotal(items);
        const total = subtotal + 10_000;
        await sendText(user, [
          '📦 Muhtasari wa Oda',
          `Jina: ${contact.name ?? ''}`,
          `Simu: ${contact.phone ?? ''}`,
          `Sehemu: ${contact.region ?? ''}`,
          `Gharama ya uwasilishaji: ${Number(10_000).toLocaleString('sw-TZ')} TZS`,
          `Jumla: ${Math.round(total).toLocaleString('sw-TZ')} TZS`,
        ].join('\n'));
        await sendPaymentInstructions(user, total);
        s.state = 'WAIT_PROOF';
        saveSession(user, s);
        STEP.delete(user);
        return sendText(user, 'Tuma *screenshot ya muamala* au *majina matatu* ya mtumaji kuthibitisha.');
      }

      case 'INSIDE_PICKUP_ASK_NAME': {
        if (!text) return sendText(user, 'Tafadhali andika *jina kamili*.');
        contact.name = text; CONTACT.set(user, contact);
        STEP.set(user, 'INSIDE_PICKUP_ASK_PHONE');
        return sendText(user, 'Sasa andika *namba ya simu*.');
      }
      case 'INSIDE_PICKUP_ASK_PHONE': {
        if (!text) return sendText(user, 'Tafadhali andika *namba ya simu*.');
        contact.phone = text; CONTACT.set(user, contact);
        const items = getCheckoutItems(user);
        const subtotal = computeSubtotal(items);
        await sendText(user, [
          '📦 Muhtasari wa Oda',
          `Jina: ${contact.name ?? ''}`,
          `Simu: ${contact.phone ?? ''}`,
          `Jumla: ${Math.round(subtotal).toLocaleString('sw-TZ')} TZS`,
          '',
          `Habari ${contact.name ?? ''}, fika ofisini kwetu tupo *Keko Omax Bar*.`,
        ].join('\n'));
        await sendPaymentInstructions(user, subtotal);
        s.state = 'WAIT_PROOF';
        saveSession(user, s);
        STEP.delete(user);
        return sendText(user, 'Tuma *screenshot ya muamala* au *majina matatu* ya mtumaji kuthibitisha.');
      }

      case 'INSIDE_DELIV_ASK_NAME': {
        if (!text) return sendText(user, 'Tafadhali andika *jina kamili*.');
        contact.name = text; CONTACT.set(user, contact);
        STEP.set(user, 'INSIDE_DELIV_ASK_PHONE');
        return sendText(user, 'Sasa andika *namba ya simu*.');
      }
      case 'INSIDE_DELIV_ASK_PHONE': {
        if (!text) return sendText(user, 'Tafadhali andika *namba ya simu*.');
        contact.phone = text; CONTACT.set(user, contact);
        STEP.delete(user); // prevent looping
        s.state = 'ASK_DISTRICT';
        saveSession(user, s);
        return sendText(user, 'Tafadhali andika *Wilaya* (mf. Temeke, Ilala, Kinondoni, Ubungo, Kigamboni).');
      }
    }
  }

  // Regular state machine
  switch (s.state) {
    case 'IDLE': {
      await showMainMenu(user, tt);
      return;
    }

    case 'ASK_IF_DAR': {
      const ans = text.toLowerCase();
      if (['ndani', 'ndio', 'ndiyo', 'yes', 'y'].includes(ans)) {
        return handleInteractive(user, 'INSIDE_DAR', tt);
      }
      if (['nje', 'hapana', 'no', 'sio', 'siyo', 'si', 'n'].includes(ans)) {
        return handleInteractive(user, 'OUTSIDE_DAR', tt);
      }
      return sendButtonsMessage({
        to: user,
        body: 'Je, upo ndani ya Dar es Salaam?',
        buttons: [
          { id: 'INSIDE_DAR',  title: 'Ndani ya Dar' },
          { id: 'OUTSIDE_DAR', title: 'Nje ya Dar' },
          { id: 'ACTION_BACK', title: t(getLang(user), 'menu.back_to_menu') },
        ],
      });
    }

    case 'ASK_DISTRICT': {
      if (!text) return sendText(user, 'Tafadhali andika *Wilaya*.');
      s.district = text;
      s.state = 'ASK_PLACE';
      saveSession(user, s);
      return sendText(user, 'Sawa. Sasa andika *Sehemu/Ward/Mtaa* (mf. Keko, Kurasini, Kariakoo...).');
    }

    case 'ASK_PLACE': {
      if (!text) return sendText(user, 'Tafadhali andika *Sehemu/Ward/Mtaa*.');
      s.place = text;

      const r = distanceByWardOrFallback(s.district!, s.place);
      const km = r.km;
      const fee = feeForDarDistance(km);
      s.distanceKm = km;
      s.price = fee;

      const items = getCheckoutItems(user);
      const subtotal = computeSubtotal(items);
      const total = subtotal + fee;

      const lines = [
        `Umbali uliokadiriwa hadi *${s.place}, ${s.district}* ~ *${km.toFixed(2)} km* (chanzo: ${r.from}).`,
        `Gharama ya uwasilishaji: *${Math.round(fee).toLocaleString('sw-TZ')} TZS*`,
        '',
        '📦 Muhtasari wa Oda',
        `Jumla ya bidhaa: ${Math.round(subtotal).toLocaleString('sw-TZ')} TZS`,
        `Jumla: ${Math.round(total).toLocaleString('sw-TZ')} TZS`,
      ];
      await sendText(user, lines.join('\n'));
      await sendPaymentInstructions(user, total);

      s.state = 'WAIT_PROOF';
      saveSession(user, s);
      return sendText(user, 'Tuma *screenshot ya muamala* au *majina matatu* ya mtumaji kuthibitisha.');
    }

    case 'SHOW_PRICE': {
      s.state = 'WAIT_PROOF';
      saveSession(user, s);
      return sendText(user, 'Tuma *screenshot ya muamala* au *majina matatu* ya mtumaji kuthibitisha.');
    }

    case 'WAIT_PROOF': {
      const items = getCheckoutItems(user);
      const deliveryFee = s.price ?? feeForDarDistance(s.distanceKm ?? Number(env.DEFAULT_DISTANCE_KM));
      const contact = CONTACT.get(user) || {};
      const mostRecent = contact.name ? getMostRecentOrderByName(contact.name) : undefined;

      if (incoming.hasImage && contact.name) {
        if (!mostRecent || mostRecent.status === 'Delivered') {
          const delivery = s.district && s.place
            ? { mode: 'dar' as const, district: s.district!, place: s.place!, distanceKm: s.distanceKm ?? Number(env.DEFAULT_DISTANCE_KM), deliveryFee }
            : (contact.region
                ? { mode: 'outside' as const, region: contact.region!, transportMode: 'bus' as const, deliveryFee: 10_000 }
                : { mode: 'pickup' as const });
          addOrder({ customerName: contact.name!, phone: contact.phone, items, delivery });
        }
        const order = getMostRecentOrderByName(contact.name!)!;
        setOrderProof(order, { type: 'image', imageId: incoming.imageId, receivedAt: new Date().toISOString() });
        clearCart(user); clearCheckoutContext(user); resetSession(user);
        await sendText(user, 'Tumepokea *screenshot*. Asante! Oda yako imekamilika.');
        await sendText(user, 'Kwa kufuatilia, andika jina ulilotumia wakati wowote.');
        return;
      }

      const words = (incoming.text ?? '')
        .split(/\s+/)
        .map(w => w.trim())
        .filter(w => /[A-Za-z\u00C0-\u024F]+/.test(w));
      if (words.length >= 3 && contact.name) {
        if (!mostRecent || mostRecent.status === 'Delivered') {
          const delivery = s.district && s.place
            ? { mode: 'dar' as const, district: s.district!, place: s.place!, distanceKm: s.distanceKm ?? Number(env.DEFAULT_DISTANCE_KM), deliveryFee }
            : (contact.region
                ? { mode: 'outside' as const, region: contact.region!, transportMode: 'bus' as const, deliveryFee: 10_000 }
                : { mode: 'pickup' as const });
          addOrder({ customerName: contact.name!, phone: contact.phone, items, delivery });
        }
        const order = getMostRecentOrderByName(contact.name)!;
        setOrderProof(order, { type: 'names', fullNames: incoming.text!, receivedAt: new Date().toISOString() });
        clearCart(user); clearCheckoutContext(user); resetSession(user);
        await sendText(user, 'Tumepokea majina ya mtumaji. Asante! Oda yako imekamilika.');
        await sendText(user, 'Kwa kufuatilia, andika jina ulilotumia wakati wowote.');
        return;
      }

      return sendText(user, 'Tafadhali tuma *screenshot* au andika *majina matatu* ya mtumaji.');
    }
  }

  // Safety
  await showMainMenu(user, tt);
}

/* ---------------------------------- track ---------------------------------- */
async function handleTrackByName(user: string, nameInput: string, tt: (k: string, p?: any) => string) {
  const orders = listOrdersByName(nameInput);
  if (!orders.length) return sendText(user, tt('track.none_found', { name: nameInput }));

  const lines = [tt('track.found_header', { name: nameInput })];
  for (const o of orders.slice(0, 5)) {
    lines.push(
      tt('track.item_line', {
        createdAt: new Date(o.createdAt).toLocaleString('sw-TZ'),
        status: o.status,
        total: Math.round(computeTotal(o)).toLocaleString('sw-TZ'),
      })
    );
  }
  return sendText(user, lines.join('\n'));
}
