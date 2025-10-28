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
import { feeForDarDistance, distanceFromBaseKm } from '../delivery.js';
import {
  addOrder,
  computeSubtotal,
  computeTotal,
  OrderItem,
  setOrderProof,
  listOrdersByName,
  getMostRecentOrderByName,
} from '../orders.js';
import {
  buildMainMenu,
  getProductBySku,
  resolveProductForSku,
} from '../menu.js';
import { getSession, saveSession, resetSession } from '../session.js';

export const webhook = Router();

/* -------------------------------------------------------------------------- */
/*                               Safe send helpers                            */
/* -------------------------------------------------------------------------- */

const MAX_TEXT_CHARS = 900;

async function safeSendText(to: string, body: string) {
  if (!to || !body) return;
  let s = String(body).trim();
  while (s.length > MAX_TEXT_CHARS) {
    let cut = s.lastIndexOf('\n', MAX_TEXT_CHARS);
    if (cut < 0) cut = s.lastIndexOf(' ', MAX_TEXT_CHARS);
    if (cut < 0) cut = MAX_TEXT_CHARS;
    await sendText(to, s.slice(0, cut).trim());
    s = s.slice(cut).trim();
  }
  if (s) await sendText(to, s);
}

function fmtTZS(n: number) {
  return Math.round(n).toLocaleString('sw-TZ');
}

/* ----------------------- WhatsApp Interactive safety ---------------------- */
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
    const idx = s.indexOf(sep);
    if (idx > 0) return [s.slice(0, idx).trim(), s.slice(idx + sep.length).trim()];
  }
  return [s.trim(), ''];
}

function fitRowTitleDesc(titleIn: string, descIn?: string) {
  let [name, tail] = splitTitleForTail(titleIn);
  let title = name;
  let desc = descIn || '';
  if (tail) desc = desc ? `${tail} • ${desc}` : tail;     // move price/tail to desc
  if (title.length > MAX_LIST_TITLE) title = title.slice(0, MAX_LIST_TITLE);
  if (desc.length > MAX_LIST_DESC) desc = desc.slice(0, MAX_LIST_DESC);
  return { title, description: desc || undefined };
}

async function sendListMessageSafe(p: SafeListPayload) {
  const sections = (p.sections || [])
    .map((sec) => ({
      title: (sec.title || '').slice(0, MAX_SECTION_TITLE) || '—',
      rows: (sec.rows || []).slice(0, MAX_LIST_ROWS).map((r) => {
        const { title, description } = fitRowTitleDesc(r.title, r.description);
        return { id: r.id, title, description };
      }),
    }))
    .filter((sec) => (sec.rows?.length ?? 0) > 0);

  if (!sections.length) return safeSendText(p.to, p.body || 'Chagua huduma.');

  return sendListMessage({
    to: p.to,
    header: p.header,
    body: p.body || ' ',
    footer: p.footer,
    buttonText: (p.buttonText || 'Fungua').slice(0, MAX_BUTTON_TITLE),
    sections,
  } as any);
}

type Button = { id: string; title: string };
async function sendButtonsMessageSafe(to: string, body: string, buttons: Button[]) {
  const trimmed = (buttons || []).slice(0, 3).map((b) => ({
    id: b.id,
    title: (b.title || '').slice(0, MAX_BUTTON_TITLE) || '•',
  }));
  if (!trimmed.length) return safeSendText(to, body);
  return sendButtonsMessage(to, (body || ' ').slice(0, 1000), trimmed);
}

/* -------------------------------------------------------------------------- */
/*                               Lightweight state                            */
/* -------------------------------------------------------------------------- */

type CartItem = OrderItem;

const USER_LANG = new Map<string, Lang>();
function getLang(user: string): Lang { return USER_LANG.get(user) ?? 'sw'; }
function setLang(user: string, lang: Lang) { USER_LANG.set(user, lang); }

const CART = new Map<string, CartItem[]>();
const PENDING_ITEM = new Map<string, CartItem | null>();
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
  const p = PENDING_ITEM.get(u);
  return p ? [p] : getCart(u);
}
function clearFlow(u: string) {
  STEP.delete(u);
  CONTACT.delete(u);
  setPending(u, null);
}

const TRACK_AWAITING_NAME = new Set<string>();

const STEP = new Map<string,
  | 'OUTSIDE_ASK_NAME' | 'OUTSIDE_ASK_PHONE' | 'OUTSIDE_ASK_REGION'
  | 'INSIDE_PICKUP_ASK_NAME' | 'INSIDE_PICKUP_ASK_PHONE'
  | 'INSIDE_DELIV_ASK_NAME' | 'INSIDE_DELIV_ASK_PHONE'
>();
type Contact = { name?: string; phone?: string; region?: string };
const CONTACT = new Map<string, Contact>();

/* -------------------------------------------------------------------------- */
/*                                    Routes                                  */
/* -------------------------------------------------------------------------- */

webhook.get('/', (_req, res) => res.status(200).send('ok'));

webhook.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === env.VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

webhook.post('/webhook', async (req: Request, res: Response) => {
  try {
    if (env.APP_SECRET) {
      const ok = verifySignature(req);
      if (!ok) return res.sendStatus(401);
    }

    const body = req.body;
    if (!body?.entry?.length) return res.sendStatus(200);

    for (const entry of body.entry) {
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

          // Interactive reply ids
          let interactiveId: string | undefined;
          if (type === 'interactive') {
            const itype = msg.interactive?.type;
            if (itype === 'list_reply') interactiveId = msg.interactive?.list_reply?.id;
            if (itype === 'button_reply') interactiveId = msg.interactive?.button_reply?.id;
          }

          // Media / location
          const hasImage = type === 'image';
          const imageId: string | undefined = hasImage ? msg.image?.id : undefined;

          const hasLocation = type === 'location';
          const latitude: number | undefined = hasLocation ? Number(msg.location?.latitude) : undefined;
          const longitude: number | undefined = hasLocation ? Number(msg.location?.longitude) : undefined;
          const locAddress: string | undefined = hasLocation ? (msg.location?.address || msg.location?.name) : undefined;

          const s = getSession(from);
          const stepActive = STEP.has(from); // <<< prevent greeting hijack

          // 1) Interactive first (buttons/list replies)
          if (interactiveId) {
            await handleInteractive(from, interactiveId, tt);
            continue;
          }

          // 2) If a step is active, go straight to message handler (no greeting)
          if (stepActive) {
            await handleMessage(
              from,
              { text: textBody, hasImage, imageId, hasLocation, latitude, longitude, address: locAddress },
              tt
            );
            continue;
          }

          // 3) Greet only when session is IDLE (first contact / explicit "menu")
          const txt = (textBody || '').trim().toLowerCase();
          if (s.state === 'IDLE' && (!textBody || ['hi','hello','mambo','start','anza','menu','menyu'].includes(txt))) {
            await showMainMenu(from, tt);
            continue;
          }

          // 4) Otherwise normal handler
          await handleMessage(
            from,
            { text: textBody, hasImage, imageId, hasLocation, latitude, longitude, address: locAddress },
            tt
          );
        }
      }
    }

    res.sendStatus(200);
  } catch (e) {
    console.error('webhook error:', e);
    res.sendStatus(200);
  }
});

/* -------------------------------------------------------------------------- */
/*                              Interactive actions                           */
/* -------------------------------------------------------------------------- */

async function handleInteractive(user: string, id: string, tt: (k: string, p?: any) => string) {
  // Global actions
  if (id === 'ACTION_VIEW_CART') return showCart(user, tt);
  if (id === 'ACTION_CHECKOUT')  return beginCheckout(user, tt);
  if (id === 'ACTION_TRACK_BY_NAME') { TRACK_AWAITING_NAME.add(user); return safeSendText(user, tt('track.ask_name')); }
  if (id === 'ACTION_TALK_TO_AGENT') { return safeSendText(user, '👤 Mawasiliano ya Mwakilishi: ' + (env.BUSINESS_WA_NUMBER_E164 || '')); }
  if (id === 'ACTION_CHANGE_LANGUAGE') {
    const next = getLang(user) === 'sw' ? 'en' : 'sw';
    setLang(user, next as Lang);
    const ttNext = (k: string, p?: any) => t(next as Lang, k, p);
    return showMainMenu(user, ttNext); // immediately redraw menu in the new language
  }
  if (id === 'ACTION_BACK') return showMainMenu(user, tt);

  // Product taps
  if (id.startsWith('PRODUCT_')) {
    const sku = id.replace('PRODUCT_', '');
    if (sku === 'PROMAX') return showVariantPicker(user, 'PROMAX', tt);
    return showProductActions(user, sku, tt);
  }

  // Variant selector row
  if (id.startsWith('VARIANTS_')) {
    const parentSku = id.replace('VARIANTS_', '');
    return showVariantPicker(user, parentSku, tt);
  }

  // Add / Buy / Details
  if (id.startsWith('ADD_') || id.startsWith('BUY_') || id.startsWith('DETAILS_')) {
    const mode = id.split('_')[0]; // ADD | BUY | DETAILS
    const sku = id.substring(mode.length + 1);
    const prod = getProductBySku(sku) || resolveProductForSku(sku);
    if (!prod) return;

    if (mode === 'DETAILS') {
      const detailKey =
        prod.sku.startsWith('PROMAX') ? 'product.promax.package_a' :
        prod.sku === 'KIBOKO' ? 'product.kiboko.details' :
        prod.sku === 'FURAHA' ? 'product.furaha.details' :
        'product.kiboko.details';
      await safeSendText(user, `ℹ️ *${prod.name}*\n${t(getLang(user), detailKey)}`);
      return showProductActions(user, sku, tt);
    }

    const item: CartItem = { sku: prod.sku, name: prod.name, qty: 1, unitPrice: prod.price };
    if (mode === 'ADD') {
      addToCart(user, item);
      await safeSendText(user, `✅ *${prod.name}* imeongezwa kwenye kikapu (${fmtTZS(prod.price)} TZS).`);
      return;
    }
    if (mode === 'BUY') {
      setPending(user, item);
      return beginCheckout(user, tt);
    }
  }

  // Region choice (only after pressing Checkout)
  if (id === 'INSIDE_DAR') {
    await safeSendText(user, 'Chagua njia ya kupata bidhaa zako:');
    return sendButtonsMessageSafe(user, 'Delivery au Pickup', [
      { id: 'INSIDE_PICKUP', title: '🏪 Pickup (Keko Omax Bar)' },
      { id: 'INSIDE_DELIVERY', title: '🚚 Delivery (Dar)' },
      { id: 'ACTION_BACK', title: '⬅️ Rudi' },
    ]);
  }

  if (id === 'OUTSIDE_DAR') {
    STEP.set(user, 'OUTSIDE_ASK_NAME');
    CONTACT.set(user, {});
    return safeSendText(user, 'Uko nje ya Dar. Tafadhali andika *jina kamili*.');
  }

  if (id === 'INSIDE_PICKUP') {
    STEP.set(user, 'INSIDE_PICKUP_ASK_NAME');
    CONTACT.set(user, {});
    return safeSendText(user, 'Pickup imechaguliwa. Tafadhali andika *jina kamili*.');
  }

  if (id === 'INSIDE_DELIVERY') {
    STEP.set(user, 'INSIDE_DELIV_ASK_NAME');
    CONTACT.set(user, {});
    return safeSendText(user, 'Delivery (Dar) imechaguliwa. Tafadhali andika *jina kamili*.');
  }

  return showMainMenu(user, tt);
}

/* -------------------------------------------------------------------------- */
/*                                   Screens                                  */
/* -------------------------------------------------------------------------- */

type TT = (k: string, p?: Record<string, string | number>) => string;

function langToggleLabel(current: Lang) {
  return current === 'sw' ? 'Change Language' : 'Badili Lugha';
}

async function showMainMenu(user: string, tt: TT) {
  const currentLang = getLang(user);

  // Build model and patch the language toggle row label to show the *other* language
  const model = buildMainMenu(tt);
  const patchedSections = model.sections.map((sec) => ({
    title: sec.title,
    rows: sec.rows.map((r) => {
      if (r.id === 'ACTION_CHANGE_LANGUAGE') {
        return { ...r, title: langToggleLabel(currentLang) }; // Sw -> "Change Language", En -> "Badili Lugha"
      }
      return r;
    }),
  }));

  await sendListMessageSafe({
    to: user,
    header: tt('menu.header'),
    body: tt('menu.header'),
    buttonText: 'Fungua',
    sections: patchedSections.map((sec) => ({
      title: sec.title,
      rows: sec.rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.subtitle,
      })),
    })),
    footer: tt('menu.footer'),
  });
}

async function showCart(user: string, _tt: TT) {
  const cart = getCart(user);
  if (!cart.length) return safeSendText(user, '🧺 Kikapu chako kipo tupu.');

  const subtotal = computeSubtotal(cart);
  await safeSendText(
    user,
    ['🧺 *Kikapu chako*', ...cart.map(c => `• ${c.name} ×${c.qty} — ${fmtTZS(c.unitPrice * c.qty)} TZS`), '', `Jumla ya bidhaa: *${fmtTZS(subtotal)} TZS*`].join('\n')
  );
  return sendButtonsMessageSafe(user, 'Chagua hatua:', [
    { id: 'ACTION_CHECKOUT', title: '✅ Checkout' },
    { id: 'ACTION_BACK',     title: '⬅️ Rudi' },
  ]);
}

async function showProductActions(user: string, sku: string, _tt: TT) {
  const prod = getProductBySku(sku) || resolveProductForSku(sku);
  if (!prod) return;
  await safeSendText(user, `*${prod.name}* — ${fmtTZS(prod.price)} TZS`);
  const hasVariants = !!(prod.children && prod.children.length);

  const buttons = [
    ...(hasVariants ? [{ id: `VARIANTS_${prod.sku}`, title: '🧩 Chagua Kipakeji' }] : []),
    { id: `ADD_${prod.sku}`,     title: '➕ Ongeza Kikapuni' },
    { id: `BUY_${prod.sku}`,     title: '🛍️ Nunua Sasa' },
  ];
  return sendButtonsMessageSafe(user, 'Chagua kitendo:', buttons);
}

async function showVariantPicker(user: string, parentSku: string, _tt: TT) {
  const parent = getProductBySku(parentSku);
  if (!parent?.children?.length) return;

  await sendListMessageSafe({
    to: user,
    header: parent.name,
    body: 'Chagua kipakeji cha Pro Max:',
    buttonText: 'Chagua',
    sections: [
      {
        title: 'Kipakeji',
        rows: parent.children.map((v) => ({
          id: `PRODUCT_${v.sku}`,
          title: `${v.name} — ${fmtTZS(v.price)} TZS`,
          description: 'Gusa kuona vitendo',
        })),
      },
    ],
    footer: 'Baada ya kuchagua, utaweza kuongeza/kununua moja kwa moja.',
  });
}

async function beginCheckout(user: string, _tt: TT) {
  const items = getCheckoutItems(user);
  if (!items.length) return showMainMenu(user, _tt);

  await safeSendText(user, 'Je, upo ndani ya Dar es Salaam?');
  return sendButtonsMessageSafe(user, 'Chagua', [
    { id: 'INSIDE_DAR',  title: 'Ndani ya Dar' },
    { id: 'OUTSIDE_DAR', title: 'Nje ya Dar' },
    { id: 'ACTION_BACK', title: '⬅️ Rudi' },
  ]);
}

/* -------------------------------------------------------------------------- */
/*                               Message handling                             */
/* -------------------------------------------------------------------------- */

type Incoming = {
  text?: string;
  hasImage?: boolean;
  imageId?: string;
  hasLocation?: boolean;
  latitude?: number;
  longitude?: number;
  address?: string;
};

const OUTSIDE_DAR_FEE = 10_000;

async function handleMessage(user: string, incoming: Incoming, _tt: TT) {
  const s = getSession(user);
  const text = (incoming.text ?? '').trim();

  // Tracking quick flow
  if (TRACK_AWAITING_NAME.has(user) && text) {
    TRACK_AWAITING_NAME.delete(user);
    return trackByName(user, text);
  }

  // Delivery sub-steps
  const step = STEP.get(user);
  if (step) {
    const contact = CONTACT.get(user) || {};
    switch (step) {
      case 'OUTSIDE_ASK_NAME': {
        if (!text) return safeSendText(user, 'Tafadhali andika *jina kamili*.');
        contact.name = text; CONTACT.set(user, contact);
        STEP.set(user, 'OUTSIDE_ASK_PHONE');
        return safeSendText(user, 'Sawa, sasa andika *namba ya simu*.');
      }
      case 'OUTSIDE_ASK_PHONE': {
        if (!text) return safeSendText(user, 'Tafadhali andika *namba ya simu*.');
        contact.phone = text; CONTACT.set(user, contact);
        STEP.set(user, 'OUTSIDE_ASK_REGION');
        return safeSendText(user, 'Asante. Andika *mkoa/sehemu* (mf. Arusha).');
      }
      case 'OUTSIDE_ASK_REGION': {
        if (!text) return safeSendText(user, 'Tafadhali andika *mkoa/sehemu*.');
        contact.region = text; CONTACT.set(user, contact);
        const items = getCheckoutItems(user);
        const subtotal = computeSubtotal(items);
        const total = subtotal + OUTSIDE_DAR_FEE;
        await safeSendText(user, [
          '📦 *Muhtasari wa Oda*',
          `Jina: ${contact.name ?? ''}`,
          `Simu: ${contact.phone ?? ''}`,
          `Sehemu: ${contact.region ?? ''}`,
          `Gharama ya uwasilishaji: ${fmtTZS(OUTSIDE_DAR_FEE)} TZS`,
          `Jumla: ${fmtTZS(total)} TZS`,
        ].join('\n'));
        await sendPaymentInstructions(user, total);
        s.state = 'WAIT_PROOF'; saveSession(user, s);
        STEP.delete(user);
        return safeSendText(user, 'Tuma *screenshot ya muamala* au *majina matatu* ya mtumaji kuthibitisha.');
      }

      case 'INSIDE_PICKUP_ASK_NAME': {
        if (!text) return safeSendText(user, 'Tafadhali andika *jina kamili*.');
        contact.name = text; CONTACT.set(user, contact);
        STEP.set(user, 'INSIDE_PICKUP_ASK_PHONE');
        return safeSendText(user, 'Sasa andika *namba ya simu*.');
      }
      case 'INSIDE_PICKUP_ASK_PHONE': {
        if (!text) return safeSendText(user, 'Tafadhali andika *namba ya simu*.');
        contact.phone = text; CONTACT.set(user, contact);
        const items = getCheckoutItems(user);
        const subtotal = computeSubtotal(items);
        await safeSendText(user, [
          '📦 *Muhtasari wa Oda*',
          `Jina: ${contact.name ?? ''}`,
          `Simu: ${contact.phone ?? ''}`,
          `Jumla ya bidhaa: ${fmtTZS(subtotal)} TZS`,
          '',
          '🏪 *Pickup (Keko Omax Bar)* — hakuna gharama ya delivery.',
        ].join('\n'));
        await sendPaymentInstructions(user, subtotal);
        s.state = 'WAIT_PROOF'; saveSession(user, s);
        STEP.delete(user);
        return safeSendText(user, 'Tuma *screenshot ya muamala* au *majina matatu* ya mtumaji kuthibitisha.');
      }

      case 'INSIDE_DELIV_ASK_NAME': {
        if (!text) return safeSendText(user, 'Tafadhali andika *jina kamili*.');
        contact.name = text; CONTACT.set(user, contact);
        STEP.set(user, 'INSIDE_DELIV_ASK_PHONE');
        return safeSendText(user, 'Sawa. Sasa andika *namba ya simu*.');
      }
      case 'INSIDE_DELIV_ASK_PHONE': {
        if (!text) return safeSendText(user, 'Tafadhali andika *namba ya simu*.');
        contact.phone = text; CONTACT.set(user, contact);
        STEP.delete(user);
        s.state = 'ASK_DISTRICT'; saveSession(user, s);
        return safeSendText(user, 'Sawa. *Tuma location pin yako*: bonyeza alama ya “+” → *Location* → *Send*.');
      }
    }
  }

  // Session state machine (we DO NOT ask about Dar at start — only on checkout)
  switch (s.state) {
    case 'IDLE': {
      return showMainMenu(user, (k, p) => t(getLang(user), k, p));
    }

    case 'ASK_DISTRICT': {
      // Expect WhatsApp location pin (GPS)
      if (incoming.hasLocation && typeof incoming.latitude === 'number' && typeof incoming.longitude === 'number') {
        const km = distanceFromBaseKm(incoming.latitude, incoming.longitude);

        if (env.SERVICE_RADIUS_KM > 0 && km > env.SERVICE_RADIUS_KM) {
          return safeSendText(user, `Samahani, uko nje ya eneo letu la huduma (~${km.toFixed(1)} km). Chagua *Pickup* au wasiliana nasi.`);
        }

        const fee = feeForDarDistance(km);
        s.distanceKm = km;
        s.price = fee;
        s.district = 'GPS';
        s.place = incoming.address || 'Location pin';
        saveSession(user, s);

        const items = getCheckoutItems(user);
        const subtotal = computeSubtotal(items);
        const total = subtotal + fee;

        await safeSendText(user, [
          `📍 Umbali kutoka *Keko* hadi ulipo: *${km.toFixed(1)} km*.`,
          `🚚 Gharama ya uwasilishaji: *${fmtTZS(fee)} TZS*`,
          '',
          '📦 *Muhtasari wa Oda*',
          `Jumla ya bidhaa: *${fmtTZS(subtotal)} TZS*`,
          `🧮 Jumla (pamoja na delivery): *${fmtTZS(total)} TZS*`,
        ].join('\n'));

        await sendPaymentInstructions(user, total);

        s.state = 'WAIT_PROOF'; saveSession(user, s);
        return safeSendText(user, 'Tuma *screenshot ya muamala* au *majina matatu* ya mtumaji kuthibitisha.');
      }
      return safeSendText(user, 'Tafadhali *tuma location pin* yako: bonyeza alama ya “+” → *Location* → *Send*.');
    }

    case 'SHOW_PRICE': {
      s.state = 'WAIT_PROOF'; saveSession(user, s);
      return safeSendText(user, 'Tuma *screenshot ya muamala* au *majina matatu* ya mtumaji kuthibitisha.');
    }

    case 'WAIT_PROOF': {
      const contact = CONTACT.get(user) || { name: 'Customer' };

      // Image proof
      if (incoming.hasImage && incoming.imageId) {
        const items = getCheckoutItems(user);
        const delivery = s.district
          ? { mode: 'dar' as const, district: s.district!, place: s.place!, km: s.distanceKm ?? Number(env.DEFAULT_DISTANCE_KM), deliveryFee: s.price ?? 0 }
          : { mode: 'pickup' as const };

        const existing = getMostRecentOrderByName(contact.name!);
        if (!existing || existing.status === 'Delivered') {
          addOrder({ customerName: contact.name!, phone: contact.phone, items, delivery });
        }
        const order = getMostRecentOrderByName(contact.name!)!;
        setOrderProof(order, { type: 'image', imageId: incoming.imageId, receivedAt: new Date().toISOString() });

        clearCart(user); clearFlow(user); resetSession(user);
        await safeSendText(user, '✅ Tumepokea *screenshot*. Asante! Oda yako imekamilika.');
        await safeSendText(user, '🔎 Kwa kufuatilia, andika jina ulilotumia wakati wowote.');
        return;
      }

      // Text proof (3+ names)
      const words = text.split(/\s+/).filter(Boolean);
      if (words.length >= 3) {
        const items = getCheckoutItems(user);
        const delivery = s.district
          ? { mode: 'dar' as const, district: s.district!, place: s.place!, km: s.distanceKm ?? Number(env.DEFAULT_DISTANCE_KM), deliveryFee: s.price ?? 0 }
          : { mode: 'pickup' as const };

        const existing = getMostRecentOrderByName(contact.name || 'Customer');
        if (!existing || existing.status === 'Delivered') {
          addOrder({ customerName: contact.name || 'Customer', phone: contact.phone, items, delivery });
        }
        const order = getMostRecentOrderByName(contact.name || 'Customer')!;
        setOrderProof(order, { type: 'text', text, receivedAt: new Date().toISOString() });

        clearCart(user); clearFlow(user); resetSession(user);
        await safeSendText(user, '✅ Tumepokea *majina ya mtumaji*. Asante! Oda yako imekamilika.');
        await safeSendText(user, '🔎 Kwa kufuatilia, andika jina ulilotumia wakati wowote.');
        return;
      }

      return safeSendText(user, 'Tuma *screenshot ya muamala* au *majina matatu* ya mtumaji.');
    }
  }

  // Fallback: keep user on the greeting/menu until they choose actions
  return showMainMenu(user, (k, p) => t(getLang(user), k, p));
}

/* -------------------------------------------------------------------------- */
/*                              Tracking by name                              */
/* -------------------------------------------------------------------------- */

async function trackByName(user: string, nameInput: string) {
  const orders = listOrdersByName(nameInput);
  if (!orders.length) return safeSendText(user, `Hakuna oda zilizopatikana kwa *${nameInput}*.`);

  const lines: string[] = [`📋 Oda (jina: ${nameInput})`];
  for (const o of orders.slice(0, 5)) {
    lines.push(`• ${new Date(o.createdAt).toLocaleString('sw-TZ')} — Hali: ${o.status} — Jumla: ${fmtTZS(computeTotal(o))} TZS`);
  }
  return safeSendText(user, lines.join('\n'));
}
