// src/routes/webhook.ts
import { Router, Request, Response } from 'express';
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
import { buildMainMenu, getProductBySku, resolveProductForSku } from '../menu.js';
import { getSession, saveSession, resetSession } from '../session.js';

export const webhook = Router();

/* -------------------------------------------------------------------------- */
/*                    WhatsApp list/button safety wrappers                    */
/* -------------------------------------------------------------------------- */

const MAX_LIST_TITLE = 24;
const MAX_LIST_DESC = 72;
const MAX_SECTION_TITLE = 24;
const MAX_LIST_ROWS = 10;
const MAX_BUTTON_TITLE = 20;

type SafeListRow = { id: string; title: string; description?: string };
type SafeListSection = { title: string; rows: SafeListRow[] };
type SafeListPayload = {
  to: string;
  header?: string;
  body: string;
  footer?: string;
  buttonText: string;
  sections: SafeListSection[];
};

function splitTitleForTail(s: string): [string, string] {
  const seps = [' — ', ' – ', ' - ', '—', '–', '-'];
  for (const sep of seps) {
    const i = s.indexOf(sep);
    if (i > 0) return [s.slice(0, i).trim(), s.slice(i + sep.length).trim()];
  }
  return [s.trim(), ''];
}

function clampRow(titleIn: string, descIn?: string) {
  let [name, tail] = splitTitleForTail(titleIn);
  let title = name;
  let desc = descIn || '';
  if (tail) desc = desc ? `${tail} • ${desc}` : tail; // push overflow into description
  if (title.length > MAX_LIST_TITLE) title = title.slice(0, MAX_LIST_TITLE);
  if (desc.length > MAX_LIST_DESC) desc = desc.slice(0, MAX_LIST_DESC);
  return { title, description: desc || undefined };
}

async function sendListMessageSafe(p: SafeListPayload) {
  const sections = (p.sections || [])
    .map((sec) => ({
      title: (sec.title || '').slice(0, MAX_SECTION_TITLE) || '—',
      rows: (sec.rows || []).slice(0, MAX_LIST_ROWS).map((r) => {
        const { title, description } = clampRow(r.title, r.description);
        return { id: r.id, title, description };
      }),
    }))
    .filter((sec) => (sec.rows?.length ?? 0) > 0);

  if (!sections.length) return sendText(p.to, p.body || ' ');
  return sendListMessage({
    to: p.to,
    header: p.header,
    body: p.body || ' ',
    footer: p.footer,
    buttonText: (p.buttonText || 'Open').slice(0, MAX_BUTTON_TITLE),
    sections,
  } as any);
}

type Button = { id: string; title: string };
async function sendButtonsMessageSafe(to: string, body: string, buttons: Button[]) {
  const trimmed = (buttons || []).slice(0, 3).map((b) => ({
    id: b.id,
    title: (b.title || '').slice(0, MAX_BUTTON_TITLE) || '•',
  }));
  if (!trimmed.length) return sendText(to, body);
  return sendButtonsMessage(to, (body || ' ').slice(0, 1000), trimmed);
}

/* -------------------------------------------------------------------------- */
/*                               Local helpers                                */
/* -------------------------------------------------------------------------- */

function fmtTZS(n: number) {
  return Math.round(n).toLocaleString('sw-TZ');
}

const KEKO = { lat: -6.8357, lon: 39.2724 }; // Keko / Magurumbasi
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Fallback average distance when only district is typed (no GPS pin) */
const DISTRICT_AVG_KM: Record<string, number> = {
  temeke: 7,
  ilala: 6,
  kinondoni: 11,
  ubungo: 12,
  kigamboni: 10,
};

function otherLang(l: Lang): Lang { return l === 'sw' ? 'en' : 'sw'; }

/* -------------------------------------------------------------------------- */
/*                              In-memory state                               */
/* -------------------------------------------------------------------------- */

export type CartItem = { sku: string; name: string; qty: number; unitPrice: number };

const USER_LANG = new Map<string, Lang>();
const CART = new Map<string, CartItem[]>();
const PENDING = new Map<string, CartItem | null>();

// Local flow map (so we don't mutate Session's State type)
type FlowStep = 'ASK_NAME' | 'ASK_IF_DAR' | 'ASK_DISTRICT' | 'ASK_PLACE';
const FLOW = new Map<string, FlowStep | null>();

// Lightweight contact info for the current checkout
const CONTACT = new Map<string, { name?: string; district?: string }>();

function getLang(u: string): Lang { return USER_LANG.get(u) ?? 'sw'; }
function setLang(u: string, l: Lang) { USER_LANG.set(u, l); }
function getCart(u: string) { return CART.get(u) ?? []; }
function setCart(u: string, x: CartItem[]) { CART.set(u, x); }
function clearCart(u: string) { CART.delete(u); }
function addToCart(u: string, it: CartItem) {
  const arr = getCart(u);
  const same = arr.find(c => c.sku === it.sku && c.unitPrice === it.unitPrice);
  if (same) same.qty += it.qty; else arr.push({ ...it });
  setCart(u, arr);
}
function setPending(u: string, it: CartItem | null) { PENDING.set(u, it); }
function pendingOrCart(u: string): CartItem[] { const p = PENDING.get(u); return p ? [p] : getCart(u); }
function setFlow(u: string, step: FlowStep | null) { if (step) FLOW.set(u, step); else FLOW.delete(u); }

/* -------------------------------------------------------------------------- */
/*                                   Routes                                   */
/* -------------------------------------------------------------------------- */

webhook.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === env.VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

webhook.post('/webhook', async (req: Request, res: Response) => {
  try {
    // Signature check using your helper from whatsapp.ts
    if (!verifySignature(req)) return res.sendStatus(401);

    const entries = req.body?.entry ?? [];
    for (const entry of entries) {
      const changes = entry?.changes ?? [];
      for (const ch of changes) {
        const messages = ch?.value?.messages ?? [];
        for (const msg of messages) {
          const from = msg?.from as string;
          const mid = msg?.id as string | undefined;
          if (!from) continue;
          if (mid) await markAsRead(mid).catch(() => {});

          const lang = getLang(from);
          const s = getSession(from);

          const type = msg?.type as string;
          const text: string | undefined = type === 'text' ? (msg.text?.body as string) : undefined;

          // Interactive reply id
          let interactiveId: string | undefined;
          if (type === 'interactive') {
            const itype = msg.interactive?.type;
            if (itype === 'list_reply') interactiveId = msg.interactive?.list_reply?.id;
            if (itype === 'button_reply') interactiveId = msg.interactive?.button_reply?.id;
          }

          // Location pin
          const hasLocation = type === 'location';
          const lat = hasLocation ? Number(msg.location?.latitude) : undefined;
          const lon = hasLocation ? Number(msg.location?.longitude) : undefined;

          // 1) interactive first
          if (interactiveId) {
            await onInteractive(from, interactiveId, lang);
            continue;
          }

          // 2) start flow on greeting / menu words when idle and no active flow
          const activeFlow = FLOW.get(from);
          if ((!s || s.state === 'IDLE') && !activeFlow) {
            const txt = (text || '').trim().toLowerCase();
            if (!text || ['hi','hello','mambo','start','anza','menu','menyu'].includes(txt)) {
              await showMainMenu(from, lang);
              continue;
            }
          }

          // 3) handle message either by local FLOW or by Session.state
          if (activeFlow) {
            await onFlow(from, activeFlow, { text, hasLocation, lat, lon }, lang);
          } else {
            await onSessionMessage(from, { text, hasLocation, lat, lon }, lang);
          }
        }
      }
    }
    res.sendStatus(200);
  } catch (e) {
    console.error('webhook error:', e);
    // return 200 so WhatsApp doesn't disable webhooks on errors
    res.sendStatus(200);
  }
});

/* -------------------------------------------------------------------------- */
/*                                   Screens                                  */
/* -------------------------------------------------------------------------- */

async function showMainMenu(user: string, lang: Lang) {
  const model = buildMainMenu((key: string) => t(lang, key));

  // Show the OTHER language label on the toggle row
  const sections = model.sections.map((sec) => ({
    title: sec.title,
    rows: sec.rows.map((r) =>
      r.id === 'ACTION_CHANGE_LANGUAGE'
        ? { ...r, title: t(otherLang(lang), 'menu.change_language') }
        : r
    ),
  }));

  await sendListMessageSafe({
    to: user,
    header: model.header,
    body: t(lang, 'menu.header'),
    footer: model.footer,
    buttonText: t(lang, 'generic.open'),
    sections: sections.map((sec) => ({
      title: sec.title,
      rows: sec.rows.map((r) => ({ id: r.id, title: r.title, description: r.subtitle })),
    })),
  });
}

async function showCart(user: string, lang: Lang) {
  const items = getCart(user);
  if (!items.length) return sendText(user, t(lang, 'cart.empty'));

  const lines = [t(lang, 'cart.summary_header')];
  let total = 0;
  for (const it of items) {
    total += it.unitPrice * it.qty;
    lines.push(
      t(lang, 'cart.summary_line', {
        title: it.name,
        qty: it.qty,
        price: fmtTZS(it.unitPrice * it.qty),
      })
    );
  }
  lines.push('');
  lines.push(t(lang, 'cart.summary_total', { total: fmtTZS(total) }));
  await sendText(user, lines.join('\n'));

  await sendButtonsMessageSafe(user, t(lang, 'cart.choose_action'), [
    { id: 'ACTION_CHECKOUT', title: t(lang, 'menu.checkout') },
    { id: 'ACTION_BACK', title: t(lang, 'menu.back_to_menu') },
  ]);
}

async function showProductActions(user: string, sku: string, lang: Lang) {
  const prod = getProductBySku(sku) || resolveProductForSku(sku);
  if (!prod) return;

  await sendText(user, `*${prod.name}* — ${fmtTZS(prod.price)} TZS`);
  const hasVariants = !!(prod.children && prod.children.length);

  const buttons: Button[] = [
    ...(hasVariants ? [{ id: `VARIANTS_${prod.sku}`, title: t(lang, 'menu.choose_variant') }] : []),
    { id: `ADD_${prod.sku}`,     title: t(lang, 'menu.add_to_cart') },
    { id: `BUY_${prod.sku}`,     title: t(lang, 'menu.buy_now') },
    { id: `DETAILS_${prod.sku}`, title: t(lang, 'menu.more_details') },
  ];
  await sendButtonsMessageSafe(user, t(lang, 'menu.actions_section'), buttons);
}

async function showVariants(user: string, parentSku: string, lang: Lang) {
  const parent = getProductBySku(parentSku);
  if (!parent?.children?.length) return;

  await sendListMessageSafe({
    to: user,
    header: parent.name,
    body: t(lang, 'menu.choose_variant'),
    footer: '',
    buttonText: t(lang, 'generic.choose'),
    sections: [
      {
        title: t(lang, 'menu.choose_variant'),
        rows: parent.children.map((v) => ({
          id: `PRODUCT_${v.sku}`,
          title: `${v.name} — ${fmtTZS(v.price)} TZS`,
          description: lang === 'sw' ? 'Gusa kuona vitendo' : 'Tap to view actions',
        })),
      },
    ],
  });
}

/* -------------------------------------------------------------------------- */
/*                            Interactive handling                            */
/* -------------------------------------------------------------------------- */

const OUTSIDE_DAR_FEE = 10_000;

async function onInteractive(user: string, id: string, lang: Lang) {
  if (id === 'ACTION_VIEW_CART') return showCart(user, lang);

  if (id === 'ACTION_CHECKOUT') {
    // start local flow without touching Session.State
    setFlow(user, 'ASK_NAME');
    CONTACT.set(user, {}); // reset temp contact
    return sendText(user, t(lang, 'flow.ask_name'));
  }

  if (id === 'ACTION_CHANGE_LANGUAGE') {
    const next = otherLang(getLang(user));
    setLang(user, next);
    return showMainMenu(user, next);
  }

  if (id === 'ACTION_BACK') return showMainMenu(user, lang);

  // Product taps
  if (id.startsWith('PRODUCT_')) {
    const sku = id.replace('PRODUCT_', '');
    if (sku === 'PROMAX') return showVariants(user, 'PROMAX', lang);
    return showProductActions(user, sku, lang);
  }

  // Variant selector
  if (id.startsWith('VARIANTS_')) {
    const parentSku = id.replace('VARIANTS_', '');
    return showVariants(user, parentSku, lang);
  }

  // Add / Buy / Details
  if (id.startsWith('ADD_') || id.startsWith('BUY_') || id.startsWith('DETAILS_')) {
    const mode = id.split('_')[0]; // ADD | BUY | DETAILS
    const sku = id.substring(mode.length + 1);
    const prod = getProductBySku(sku) || resolveProductForSku(sku);
    if (!prod) return;

    if (mode === 'DETAILS') {
      const txt = detailsForSku(lang, sku); // strictly from i18n.ts for Pro Max packages
      await sendText(user, `ℹ️ *${prod.name}*\n${txt}`);
      return showProductActions(user, sku, lang);
    }

    const item: CartItem = { sku: prod.sku, name: prod.name, qty: 1, unitPrice: prod.price };
    if (mode === 'ADD') {
      addToCart(user, item);
      await sendText(user, t(lang, 'cart.added', { title: item.name }));
      return sendButtonsMessageSafe(user, t(lang, 'cart.choose_action'), [
        { id: 'ACTION_CHECKOUT', title: t(lang, 'menu.checkout') },
        { id: 'ACTION_VIEW_CART', title: t(lang, 'menu.view_cart') },
        { id: 'ACTION_BACK', title: t(lang, 'menu.back_to_menu') },
      ]);
    }
    if (mode === 'BUY') {
      setPending(user, item);
      setFlow(user, 'ASK_NAME'); // local flow start
      CONTACT.set(user, {});
      return sendText(user, t(lang, 'flow.ask_name'));
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                               Local FLOW logic                             */
/* -------------------------------------------------------------------------- */

type Incoming = {
  text?: string;
  hasLocation?: boolean;
  lat?: number;
  lon?: number;
};

async function onFlow(user: string, step: FlowStep, m: Incoming, lang: Lang) {
  const s = getSession(user);
  const txt = (m.text || '').trim();
  const contact = CONTACT.get(user) || {};

  switch (step) {
    case 'ASK_NAME': {
      if (!txt) return sendText(user, t(lang, 'flow.ask_name'));
      contact.name = txt;
      CONTACT.set(user, contact);
      setFlow(user, 'ASK_IF_DAR');
      return sendText(user, t(lang, 'flow.name_saved', { name: txt }) + '\n' + t(lang, 'flow.ask_if_dar'));
    }

    case 'ASK_IF_DAR': {
      const a = txt.toLowerCase();
      if (['ndiyo','ndio','ndani','yes','y'].includes(a)) {
        setFlow(user, 'ASK_DISTRICT');
        return sendText(user, t(lang, 'flow.ask_district'));
      }
      if (['hapana','nje','no','n'].includes(a)) {
        // Outside Dar — flat estimate, then go straight to proof
        setFlow(user, null);
        const items = pendingOrCart(user);
        const sub = items.reduce((acc, it) => acc + it.unitPrice * it.qty, 0);
        const total = sub + OUTSIDE_DAR_FEE;

        await sendText(user, t(lang, 'flow.outside_dar_notice', { fee: fmtTZS(OUTSIDE_DAR_FEE) }));
        await sendText(
          user,
          [
            t(lang, 'checkout.summary_header'),
            t(lang, 'checkout.summary_name', { name: contact.name || '' }),
            t(lang, 'checkout.summary_total', { total: fmtTZS(total) }),
          ].join('\n')
        );
        await sendPaymentInstructions(user, total);
        s.state = 'WAIT_PROOF'; saveSession(user, s);
        return sendText(user, t(lang, 'proof.ask'));
      }
      return sendText(user, t(lang, 'flow.reply_yes_no'));
    }

    case 'ASK_DISTRICT': {
      if (!txt) return sendText(user, t(lang, 'flow.ask_district'));
      contact.district = txt;
      CONTACT.set(user, contact);
      setFlow(user, 'ASK_PLACE');
      return sendText(user, t(lang, 'flow.ask_place'));
    }

    case 'ASK_PLACE': {
      // Prefer GPS pin
      if (m.hasLocation && typeof m.lat === 'number' && typeof m.lon === 'number') {
        const km = haversineKm(KEKO.lat, KEKO.lon, m.lat, m.lon);
        const fee = feeForDarDistance(km);
        const items = pendingOrCart(user);
        const sub = items.reduce((acc, it) => acc + it.unitPrice * it.qty, 0);
        const total = sub + fee;

        await sendText(user, t(lang, 'flow.distance_quote', {
          place: 'GPS Pin',
          district: contact.district || '',
          km: km.toFixed(1),
          fee: fmtTZS(fee),
        }));
        await sendText(user, [
          t(lang, 'checkout.summary_header'),
          t(lang, 'checkout.summary_name', { name: contact.name || '' }),
          t(lang, 'checkout.summary_address_dar', { place: 'GPS Pin', district: contact.district || '' }),
          t(lang, 'checkout.summary_total', { total: fmtTZS(total) }),
        ].join('\n'));
        await sendPaymentInstructions(user, total);
        s.state = 'WAIT_PROOF'; saveSession(user, s);
        setFlow(user, null);
        return sendText(user, t(lang, 'proof.ask'));
      }

      if (!txt) return sendText(user, t(lang, 'flow.ask_place'));
      const place = txt;

      // Rough estimate by district average (or default 8km)
      const avg = DISTRICT_AVG_KM[(contact.district || '').toLowerCase()];
      const usedKm = typeof avg === 'number' ? avg : 8;
      const fee = feeForDarDistance(usedKm);

      if (typeof avg === 'number') {
        await sendText(user, t(lang, 'flow.distance_avg_used', { district: contact.district || '' }));
      } else {
        await sendText(user, t(lang, 'flow.distance_default_used'));
      }

      await sendText(user, t(lang, 'flow.distance_quote', {
        place,
        district: contact.district || '',
        km: usedKm.toFixed(1),
        fee: fmtTZS(fee),
      }));

      const items = pendingOrCart(user);
      const sub = items.reduce((acc, it) => acc + it.unitPrice * it.qty, 0);
      const total = sub + fee;

      await sendText(user, [
        t(lang, 'checkout.summary_header'),
        t(lang, 'checkout.summary_name', { name: contact.name || '' }),
        t(lang, 'checkout.summary_address_dar', { place, district: contact.district || '' }),
        t(lang, 'checkout.summary_total', { total: fmtTZS(total) }),
      ].join('\n'));
      await sendPaymentInstructions(user, total);
      s.state = 'WAIT_PROOF'; saveSession(user, s);
      setFlow(user, null);
      return sendText(user, t(lang, 'proof.ask'));
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                          Session-controlled messages                       */
/* -------------------------------------------------------------------------- */

async function onSessionMessage(user: string, m: Incoming, lang: Lang) {
  const s = getSession(user);
  const txt = (m.text || '').trim();

  switch (s.state) {
    case 'IDLE': {
      return showMainMenu(user, lang);
    }

    case 'SHOW_PRICE': {
      s.state = 'WAIT_PROOF'; saveSession(user, s);
      return sendText(user, t(lang, 'proof.ask'));
    }

    case 'WAIT_PROOF': {
      // Accept text proof with 3+ names; actual media screenshot handled by infra
      const words = txt.split(/\s+/).filter(Boolean);
      if (words.length >= 3) {
        // reset after proof
        clearCart(user); setPending(user, null); resetSession(user);
        return sendText(user, t(lang, 'proof.ok_names', { names: txt }));
      }
      return sendText(user, t(lang, 'proof.invalid'));
    }
  }

  return showMainMenu(user, lang);
}

/* -------------------------------------------------------------------------- */
/*                              Details resolver                              */
/* -------------------------------------------------------------------------- */

function detailsForSku(lang: Lang, sku: string): string {
  // Pro Max details come strictly from package A/B/C keys in i18n.ts
  if (sku === 'PROMAX') {
    return [
      '• ' + t(lang, 'product.promax.package_a'),
      '• ' + t(lang, 'product.promax.package_b'),
      '• ' + t(lang, 'product.promax.package_c'),
    ].join('\n');
  }
  if (sku === 'PROMAX_A') return t(lang, 'product.promax.package_a');
  if (sku === 'PROMAX_B') return t(lang, 'product.promax.package_b');
  if (sku === 'PROMAX_C') return t(lang, 'product.promax.package_c');

  if (sku === 'KIBOKO') return t(lang, 'product.kiboko.details');
  if (sku === 'FURAHA') return t(lang, 'product.furaha.details');

  return lang === 'sw' ? 'Maelezo yatapatikana hivi karibuni.' : 'Details coming soon.';
}
