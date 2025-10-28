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
/*                            Localized UI helpers                            */
/* -------------------------------------------------------------------------- */

const STR = {
  sw: {
    open: 'Fungua',
    choose: 'Chagua',
    chooseAction: 'Chagua hatua:',
    deliveryOrPickupBody: 'Delivery au Pickup',
    insideDar: 'Ndani ya Dar',
    outsideDar: 'Nje ya Dar',
    back: '⬅️ Rudi',
    cartEmpty: '🧺 Kikapu chako kipo tupu.',
    cartHeader: '🧺 *Kikapu chako*',
    cartSubtotal: (v: string) => `Jumla ya bidhaa: *${v} TZS*`,
    productAdded: (name: string, price: string) => `✅ *${name}* imeongezwa kwenye kikapu (${price} TZS).`,
    afterAddButtonsBody: 'Endelea:',
    buyNow: '🛍️ Nunua Sasa',
    addToCart: '➕ Ongeza Kikapuni',
    chooseVariant: '🧩 Chagua Kipakeji',
    productActionsBody: 'Chagua kitendo:',
    variantListTitle: 'Kipakeji',
    variantListBody: 'Chagua kipakeji cha Pro Max:',
    variantListFooter: 'Baada ya kuchagua, utaweza kuongeza/kununua moja kwa moja.',
    askIfDar: 'Je, upo ndani ya Dar es Salaam?',
    askName: 'Tafadhali andika *jina kamili*.',
    askPhone: 'Sasa andika *namba ya simu*.',
    askRegion: 'Asante. Andika *mkoa/sehemu* (mf. Arusha).',
    pickupNote: '🏪 *Pickup (Keko Omax Bar)* — hakuna gharama ya delivery.',
    sendPin: 'Sawa. *Tuma location pin yako*: bonyeza alama ya “+” → *Location* → *Send*.',
    sendPinReminder: 'Tafadhali *tuma location pin* yako: bonyeza alama ya “+” → *Location* → *Send*.',
    distanceLine: (km: string) => `📍 Umbali kutoka *Keko* hadi ulipo: *${km} km*.`,
    feeLine: (fee: string) => `🚚 Gharama ya uwasilishaji: *${fee} TZS*`,
    orderSummaryHeader: '📦 *Muhtasari wa Oda*',
    subtotalLine: (v: string) => `Jumla ya bidhaa: *${v} TZS*`,
    totalLine: (v: string) => `🧮 Jumla (pamoja na delivery): *${v} TZS*`,
    radiusBlock: (km: string) => `Samahani, uko nje ya eneo letu la huduma (~${km} km). Chagua *Pickup* au wasiliana nasi.`,
    proofAsk: 'Tuma *screenshot ya muamala* au *majina matatu* ya mtumaji kuthibitisha.',
    proofImgOk: '✅ Tumepokea *screenshot*. Tunathibitisha malipo yako — tafadhali subiri kidogo.',
    proofNamesOk: (names: string) => `✅ Tumepokea majina ya mtumaji: *${names}*. Tunathibitisha malipo yako — tafadhali subiri kidogo.`,
    proofInvalid: 'Tuma *screenshot ya muamala* au *majina matatu* ya mtumaji.',
    agentContact: (num: string) => `👤 Mawasiliano ya Mwakilishi: ${num}`,
    trackAsk: 'Andika *jina* ulilotumia kufuatilia oda.',
    trackNone: (name: string) => `Hakuna oda zilizopatikana kwa *${name}*.`,
    trackHeader: (name: string) => `📋 Oda (jina: ${name})`,
    checkout: '✅ Checkout',
    viewCart: '🛒 Tazama Kikapu',
    langToggleLabel: (lang: Lang) => (lang === 'sw' ? 'Change Language' : 'Badili Lugha'),
  },
  en: {
    open: 'Open',
    choose: 'Choose',
    chooseAction: 'Choose an action:',
    deliveryOrPickupBody: 'Delivery or Pickup',
    insideDar: 'Inside Dar',
    outsideDar: 'Outside Dar',
    back: '⬅️ Back',
    cartEmpty: '🧺 Your cart is empty.',
    cartHeader: '🧺 *Your cart*',
    cartSubtotal: (v: string) => `Items subtotal: *${v} TZS*`,
    productAdded: (name: string, price: string) => `✅ *${name}* added to cart (${price} TZS).`,
    afterAddButtonsBody: 'Continue:',
    buyNow: '🛍️ Buy Now',
    addToCart: '➕ Add to Cart',
    chooseVariant: '🧩 Choose Variant',
    productActionsBody: 'Pick an action:',
    variantListTitle: 'Packages',
    variantListBody: 'Choose your Pro Max package:',
    variantListFooter: 'After choosing, you can add or buy directly.',
    askIfDar: 'Are you inside Dar es Salaam?',
    askName: 'Please type your *full name*.',
    askPhone: 'Now type your *phone number*.',
    askRegion: 'Thanks. Type your *region/place* (e.g., Arusha).',
    pickupNote: '🏪 *Pickup (Keko Omax Bar)* — no delivery fee.',
    sendPin: 'Okay. *Send your location pin*: press “+” → *Location* → *Send*.',
    sendPinReminder: 'Please *send your location pin*: press “+” → *Location* → *Send*.',
    distanceLine: (km: string) => `📍 Distance from *Keko* to you: *${km} km*.`,
    feeLine: (fee: string) => `🚚 Delivery fee: *${fee} TZS*`,
    orderSummaryHeader: '📦 *Order Summary*',
    subtotalLine: (v: string) => `Items subtotal: *${v} TZS*`,
    totalLine: (v: string) => `🧮 Total (incl. delivery): *${v} TZS*`,
    radiusBlock: (km: string) => `Sorry, you’re outside our service area (~${km} km). Choose *Pickup* or contact us.`,
    proofAsk: 'Send a *payment screenshot* or the *three full names* of the payer.',
    proofImgOk: '✅ We’ve received your *screenshot*. We’re verifying your payment — please wait a moment.',
    proofNamesOk: (names: string) => `✅ We’ve received the payer’s names: *${names}*. We’re verifying your payment — please wait a moment.`,
    proofInvalid: 'Please send a *screenshot* or the *three full names* of the payer.',
    agentContact: (num: string) => `👤 Agent contact: ${num}`,
    trackAsk: 'Type the *name* you used to track your order.',
    trackNone: (name: string) => `No orders found for *${name}*.`,
    trackHeader: (name: string) => `📋 Orders (name: ${name})`,
    checkout: '✅ Checkout',
    viewCart: '🛒 View Cart',
    langToggleLabel: (lang: Lang) => (lang === 'sw' ? 'Change Language' : 'Badili Lugha'),
  },
};

const S = (lang: Lang) => STR[lang];

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
  if (tail) desc = desc ? `${tail} • ${desc}` : tail; // move price/tail to desc
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

  if (!sections.length) return safeSendText(p.to, p.body || ' ');

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
          const ui = S(lang);
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
          const stepActive = STEP.has(from);

          // 1) Interactive first
          if (interactiveId) {
            await handleInteractive(from, interactiveId, lang);
            continue;
          }

          // 2) If a step is active, go straight to message handler
          if (stepActive) {
            await handleMessage(
              from,
              { text: textBody, hasImage, imageId, hasLocation, latitude, longitude, address: locAddress },
              lang
            );
            continue;
          }

          // 3) Greet only when session is IDLE or user typed menu keywords
          const txt = (textBody || '').trim().toLowerCase();
          if (s.state === 'IDLE' && (!textBody || ['hi','hello','mambo','start','anza','menu','menyu'].includes(txt))) {
            await showMainMenu(from, lang);
            continue;
          }

          // 4) Otherwise normal handler
          await handleMessage(
            from,
            { text: textBody, hasImage, imageId, hasLocation, latitude, longitude, address: locAddress },
            lang
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

async function handleInteractive(user: string, id: string, lang: Lang) {
  const ui = S(lang);

  // Global actions
  if (id === 'ACTION_VIEW_CART') return showCart(user, lang);
  if (id === 'ACTION_CHECKOUT')  return beginCheckout(user, lang);
  if (id === 'ACTION_TRACK_BY_NAME') { TRACK_AWAITING_NAME.add(user); return safeSendText(user, S(lang).trackAsk); }
  if (id === 'ACTION_TALK_TO_AGENT') { return safeSendText(user, ui.agentContact(env.BUSINESS_WA_NUMBER_E164 || '')); }
  if (id === 'ACTION_CHANGE_LANGUAGE') {
    const next = lang === 'sw' ? 'en' : 'sw';
    setLang(user, next as Lang);
    return showMainMenu(user, next as Lang); // redraw menu immediately
  }
  if (id === 'ACTION_BACK') return showMainMenu(user, lang);

  // Product taps
  if (id.startsWith('PRODUCT_')) {
    const sku = id.replace('PRODUCT_', '');
    if (sku === 'PROMAX') return showVariantPicker(user, 'PROMAX', lang);
    return showProductActions(user, sku, lang);
  }

  // Variant selector row
  if (id.startsWith('VARIANTS_')) {
    const parentSku = id.replace('VARIANTS_', '');
    return showVariantPicker(user, parentSku, lang);
  }

  // Add / Buy / Details
  if (id.startsWith('ADD_') || id.startsWith('BUY_') || id.startsWith('DETAILS_')) {
    const mode = id.split('_')[0]; // ADD | BUY | DETAILS
    const sku = id.substring(mode.length + 1);
    const prod = getProductBySku(sku) || resolveProductForSku(sku);
    if (!prod) return;

    if (mode === 'DETAILS') {
      const detailText = detailsForSku(lang, sku);
      await safeSendText(user, `ℹ️ *${prod.name}*\n${detailText}`);
      return showProductActions(user, sku, lang);
    }

    // ADD or BUY
    const item: CartItem = { sku: prod.sku, name: prod.name, qty: 1, unitPrice: prod.price };
    if (mode === 'ADD') {
      await onAddToCart(user, item, lang);
      return;
    }
    if (mode === 'BUY') {
      setPending(user, item);
      return beginCheckout(user, lang);
    }
  }

  // Region choice (only after pressing Checkout)
  if (id === 'INSIDE_DAR') {
    await safeSendText(user, ui.deliveryOrPickupBody);
    return sendButtonsMessageSafe(user, ui.deliveryOrPickupBody, [
      { id: 'INSIDE_PICKUP', title: '🏪 ' + (lang === 'sw' ? 'Pickup (Keko Omax Bar)' : 'Pickup (Keko Omax Bar)') },
      { id: 'INSIDE_DELIVERY', title: '🚚 ' + (lang === 'sw' ? 'Delivery (Dar)' : 'Delivery (Dar)') },
      { id: 'ACTION_BACK', title: ui.back },
    ]);
  }

  if (id === 'OUTSIDE_DAR') {
    STEP.set(user, 'OUTSIDE_ASK_NAME');
    CONTACT.set(user, {});
    return safeSendText(user, S(lang).askName);
  }

  if (id === 'INSIDE_PICKUP') {
    STEP.set(user, 'INSIDE_PICKUP_ASK_NAME');
    CONTACT.set(user, {});
    return safeSendText(user, S(lang).askName);
  }

  if (id === 'INSIDE_DELIVERY') {
    STEP.set(user, 'INSIDE_DELIV_ASK_NAME');
    CONTACT.set(user, {});
    return safeSendText(user, S(lang).askName);
  }

  return showMainMenu(user, lang);
}

/* -------------------------------------------------------------------------- */
/*                                   Screens                                  */
/* -------------------------------------------------------------------------- */

function langToggleLabel(current: Lang) {
  return STR[current].langToggleLabel(current);
}

async function showMainMenu(user: string, lang: Lang) {
  const ui = S(lang);
  const model = buildMainMenu((key: string) => t(lang, key));


  // Patch “Change Language” row to show the OTHER language label
  const patchedSections = model.sections.map((sec) => ({
    title: sec.title,
    rows: sec.rows.map((r) => {
      if (r.id === 'ACTION_CHANGE_LANGUAGE') {
        return { ...r, title: langToggleLabel(lang) };
      }
      return r;
    }),
  }));

  await sendListMessageSafe({
    to: user,
    header: t(lang, 'menu.header'),
    body: t(lang, 'menu.header'),
    buttonText: ui.open,
    sections: patchedSections.map((sec) => ({
      title: sec.title,
      rows: sec.rows.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.subtitle,
      })),
    })),
    footer: t(lang, 'menu.footer'),
  });
}

async function showCart(user: string, lang: Lang) {
  const ui = S(lang);
  const cart = getCart(user);
  if (!cart.length) return safeSendText(user, ui.cartEmpty);

  const subtotal = computeSubtotal(cart);
  await safeSendText(
    user,
    [
      ui.cartHeader,
      ...cart.map(c => `• ${c.name} ×${c.qty} — ${fmtTZS(c.unitPrice * c.qty)} TZS`),
      '',
      ui.cartSubtotal(fmtTZS(subtotal)),
    ].join('\n')
  );
  return sendButtonsMessageSafe(user, ui.chooseAction, [
    { id: 'ACTION_CHECKOUT', title: ui.checkout },
    { id: 'ACTION_BACK',     title: ui.back },
  ]);
}

async function showProductActions(user: string, sku: string, lang: Lang) {
  const ui = S(lang);
  const prod = getProductBySku(sku) || resolveProductForSku(sku);
  if (!prod) return;

  await safeSendText(user, `*${prod.name}* — ${fmtTZS(prod.price)} TZS`);
  const hasVariants = !!(prod.children && prod.children.length);

  const buttons = [
    ...(hasVariants ? [{ id: `VARIANTS_${prod.sku}`, title: ui.chooseVariant }] : []),
    { id: `ADD_${prod.sku}`,     title: ui.addToCart },
    { id: `BUY_${prod.sku}`,     title: ui.buyNow },
  ];
  return sendButtonsMessageSafe(user, ui.productActionsBody, buttons);
}

async function showVariantPicker(user: string, parentSku: string, lang: Lang) {
  const ui = S(lang);
  const parent = getProductBySku(parentSku);
  if (!parent?.children?.length) return;

  await sendListMessageSafe({
    to: user,
    header: parent.name,
    body: ui.variantListBody,
    buttonText: S(lang).choose,
    sections: [
      {
        title: ui.variantListTitle,
        rows: parent.children.map((v) => ({
          id: `PRODUCT_${v.sku}`,
          title: `${v.name} — ${fmtTZS(v.price)} TZS`,
          description: lang === 'sw' ? 'Gusa kuona vitendo' : 'Tap to view actions',
        })),
      },
    ],
    footer: ui.variantListFooter,
  });
}

async function beginCheckout(user: string, lang: Lang) {
  const ui = S(lang);
  const items = getCheckoutItems(user);
  if (!items.length) return showMainMenu(user, lang);

  await safeSendText(user, ui.askIfDar);
  return sendButtonsMessageSafe(user, ui.choose, [
    { id: 'INSIDE_DAR',  title: ui.insideDar },
    { id: 'OUTSIDE_DAR', title: ui.outsideDar },
    { id: 'ACTION_BACK', title: ui.back },
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

async function handleMessage(user: string, incoming: Incoming, lang: Lang) {
  const ui = S(lang);
  const s = getSession(user);
  const text = (incoming.text ?? '').trim();

  // Tracking quick flow
  if (TRACK_AWAITING_NAME.has(user) && text) {
    TRACK_AWAITING_NAME.delete(user);
    return trackByName(user, text, lang);
  }

  // Delivery sub-steps
  const step = STEP.get(user);
  if (step) {
    const contact = CONTACT.get(user) || {};
    switch (step) {
      case 'OUTSIDE_ASK_NAME': {
        if (!text) return safeSendText(user, ui.askName);
        contact.name = text; CONTACT.set(user, contact);
        STEP.set(user, 'OUTSIDE_ASK_PHONE');
        return safeSendText(user, ui.askPhone);
      }
      case 'OUTSIDE_ASK_PHONE': {
        if (!text) return safeSendText(user, ui.askPhone);
        contact.phone = text; CONTACT.set(user, contact);
        STEP.set(user, 'OUTSIDE_ASK_REGION');
        return safeSendText(user, ui.askRegion);
      }
      case 'OUTSIDE_ASK_REGION': {
        if (!text) return safeSendText(user, ui.askRegion);
        contact.region = text; CONTACT.set(user, contact);
        const items = getCheckoutItems(user);
        const subtotal = computeSubtotal(items);
        const total = subtotal + OUTSIDE_DAR_FEE;
        await safeSendText(user, [
          S(lang).orderSummaryHeader,
          `${lang === 'sw' ? 'Jina' : 'Name'}: ${contact.name ?? ''}`,
          `${lang === 'sw' ? 'Simu' : 'Phone'}: ${contact.phone ?? ''}`,
          `${lang === 'sw' ? 'Sehemu' : 'Place'}: ${contact.region ?? ''}`,
          `${lang === 'sw' ? 'Gharama ya uwasilishaji' : 'Delivery fee'}: ${fmtTZS(OUTSIDE_DAR_FEE)} TZS`,
          `${lang === 'sw' ? 'Jumla' : 'Total'}: ${fmtTZS(total)} TZS`,
        ].join('\n'));
        await sendPaymentInstructions(user, total);
        s.state = 'WAIT_PROOF'; saveSession(user, s);
        STEP.delete(user);
        return safeSendText(user, ui.proofAsk);
      }

      case 'INSIDE_PICKUP_ASK_NAME': {
        if (!text) return safeSendText(user, ui.askName);
        contact.name = text; CONTACT.set(user, contact);
        STEP.set(user, 'INSIDE_PICKUP_ASK_PHONE');
        return safeSendText(user, ui.askPhone);
      }
      case 'INSIDE_PICKUP_ASK_PHONE': {
        if (!text) return safeSendText(user, ui.askPhone);
        contact.phone = text; CONTACT.set(user, contact);
        const items = getCheckoutItems(user);
        const subtotal = computeSubtotal(items);
        await safeSendText(user, [
          S(lang).orderSummaryHeader,
          `${lang === 'sw' ? 'Jina' : 'Name'}: ${contact.name ?? ''}`,
          `${lang === 'sw' ? 'Simu' : 'Phone'}: ${contact.phone ?? ''}`,
          S(lang).cartSubtotal(fmtTZS(subtotal)),
          '',
          S(lang).pickupNote,
        ].join('\n'));
        await sendPaymentInstructions(user, subtotal);
        s.state = 'WAIT_PROOF'; saveSession(user, s);
        STEP.delete(user);
        return safeSendText(user, ui.proofAsk);
      }

      case 'INSIDE_DELIV_ASK_NAME': {
        if (!text) return safeSendText(user, ui.askName);
        contact.name = text; CONTACT.set(user, contact);
        STEP.set(user, 'INSIDE_DELIV_ASK_PHONE');
        return safeSendText(user, ui.askPhone);
      }
      case 'INSIDE_DELIV_ASK_PHONE': {
        if (!text) return safeSendText(user, ui.askPhone);
        contact.phone = text; CONTACT.set(user, contact);
        STEP.delete(user);
        s.state = 'ASK_DISTRICT'; saveSession(user, s);
        return safeSendText(user, ui.sendPin);
      }
    }
  }

  // Session state machine — Dar/Outside asked only during checkout
  switch (s.state) {
    case 'IDLE': {
      return showMainMenu(user, lang);
    }

    case 'ASK_DISTRICT': {
      // Expect WhatsApp location pin (GPS)
      if (incoming.hasLocation && typeof incoming.latitude === 'number' && typeof incoming.longitude === 'number') {
        const km = distanceFromBaseKm(incoming.latitude, incoming.longitude);

        if (env.SERVICE_RADIUS_KM > 0 && km > env.SERVICE_RADIUS_KM) {
          return safeSendText(user, ui.radiusBlock(km.toFixed(1)));
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
          ui.distanceLine(km.toFixed(1)),
          ui.feeLine(fmtTZS(fee)),
          '',
          S(lang).orderSummaryHeader,
          S(lang).subtotalLine(fmtTZS(subtotal)),
          S(lang).totalLine(fmtTZS(total)),
        ].join('\n'));

        await sendPaymentInstructions(user, total);

        s.state = 'WAIT_PROOF'; saveSession(user, s);
        return safeSendText(user, ui.proofAsk);
      }
      return safeSendText(user, ui.sendPinReminder);
    }

    case 'SHOW_PRICE': {
      s.state = 'WAIT_PROOF'; saveSession(user, s);
      return safeSendText(user, ui.proofAsk);
    }

    case 'WAIT_PROOF': {
      const contact = CONTACT.get(user) || { name: 'Customer' };

      // Image proof
      if (incoming.hasImage && incoming.imageId) {
        const items = getCheckoutItems(user);
        const delivery = s.district
          ? { mode: 'dar' as const, district: s.district!, place: s.place!, km: s.distanceKm ?? Number(env.DEFAULT_DISTANCE_KM), deliveryFee: s.price ?? 0 }
          : { mode: 'pickup' as const };

        // store proof (status flips to Paid internally), but message says "verifying"
        const existing = getMostRecentOrderByName(contact.name!);
        if (!existing || existing.status === 'Delivered') {
          addOrder({ customerName: contact.name!, phone: contact.phone, items, delivery });
        }
        const order = getMostRecentOrderByName(contact.name!)!;
        setOrderProof(order, { type: 'image', imageId: incoming.imageId, receivedAt: new Date().toISOString() });

        clearCart(user); clearFlow(user); resetSession(user);
        await safeSendText(user, S(lang).proofImgOk);
        return showMainMenu(user, lang);
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
        await safeSendText(user, S(lang).proofNamesOk(text));
        return showMainMenu(user, lang);
      }

      return safeSendText(user, ui.proofInvalid);
    }
  }

  // Fallback
  return showMainMenu(user, lang);
}

/* ------------------------------ Add-to-cart UX ---------------------------- */

async function onAddToCart(user: string, item: CartItem, lang: Lang) {
  const ui = S(lang);
  addToCart(user, item);
  await safeSendText(user, ui.productAdded(item.name, fmtTZS(item.unitPrice)));

  // Offer to continue right away
  return sendButtonsMessageSafe(user, ui.afterAddButtonsBody, [
    { id: 'ACTION_CHECKOUT', title: ui.checkout },
    { id: 'ACTION_VIEW_CART', title: ui.viewCart },
    { id: 'ACTION_BACK', title: ui.back },
  ]);
}

/* ------------------------------- Details text ----------------------------- */

function detailsForSku(lang: Lang, sku: string): string {
  // Variants
  if (sku === 'PROMAX_A') return t(lang, 'product.promax.package_a');
  if (sku === 'PROMAX_B') return t(lang, 'product.promax.package_b');
  if (sku === 'PROMAX_C') return t(lang, 'product.promax.package_c');

  // Parent PROMAX → show a compact list of its packages
  if (sku === 'PROMAX') {
    const a = t(lang, 'product.promax.package_a');
    const b = t(lang, 'product.promax.package_b');
    const c = t(lang, 'product.promax.package_c');
    return ['• ' + a, '• ' + b, '• ' + c].join('\n');
  }

  // Singles
  if (sku === 'KIBOKO') return t(lang, 'product.kiboko.details');
  if (sku === 'FURAHA') return t(lang, 'product.furaha.details');

  // Fallback
  return lang === 'sw' ? 'Maelezo yatapatikana hivi karibuni.' : 'Details coming soon.';
}

/* -------------------------------------------------------------------------- */
/*                              Tracking by name                              */
/* -------------------------------------------------------------------------- */

async function trackByName(user: string, nameInput: string, lang: Lang) {
  const orders = listOrdersByName(nameInput);
  if (!orders.length) return safeSendText(user, S(lang).trackNone(nameInput));

  const lines: string[] = [S(lang).trackHeader(nameInput)];
  for (const o of orders.slice(0, 5)) {
    const when = new Date(o.createdAt).toLocaleString(lang === 'sw' ? 'sw-TZ' : 'en-GB');
    lines.push(`• ${when} — ${lang === 'sw' ? 'Hali' : 'Status'}: ${o.status} — ${lang === 'sw' ? 'Jumla' : 'Total'}: ${fmtTZS(computeTotal(o))} TZS`);
  }
  return safeSendText(user, lines.join('\n'));
}
