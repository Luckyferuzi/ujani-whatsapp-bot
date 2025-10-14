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
import { getSession, saveSession, resetSession, Session } from '../session.js';
import {
  buildMainMenu,
  buildProductMenu,
  buildVariantMenu,
  getProductBySku,
  getTopLevelProducts,
  getVariantsOf,
} from '../menu.js';

// -------- Router --------
export const webhook = Router();

// Lightweight per-user prefs (no DB yet)
const USER_LANG = new Map<string, Lang>();         // default 'sw'
const TRACK_AWAITING_NAME = new Set<string>();     // users currently in "track by name" prompt

// Simple cart store (per user) — keeps existing prices/flow intact
type CartItem = OrderItem;
const CART = new Map<string, CartItem[]>();

function getLang(user: string): Lang {
  return USER_LANG.get(user) ?? 'sw';
}
function setLang(user: string, lang: Lang) {
  USER_LANG.set(user, lang);
}

function addToCart(user: string, item: CartItem) {
  const cart = CART.get(user) ?? [];
  const existing = cart.find(c => c.sku === item.sku && c.unitPrice === item.unitPrice);
  if (existing) existing.qty += item.qty;
  else cart.push({ ...item });
  CART.set(user, cart);
}
function getCart(user: string): CartItem[] {
  return CART.get(user) ?? [];
}
function clearCart(user: string) {
  CART.delete(user);
}

function money(n: number) {
  return `${Math.round(n).toLocaleString('sw-TZ')} TZS`;
}

// ---- WhatsApp webhook verification (GET) ----
webhook.get('/webhook', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === env.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ---- WhatsApp webhook receiver (POST) ----
webhook.post('/webhook', async (req: Request, res: Response) => {
  try {
    // Signature verify (if APP_SECRET set). If your server isn't using raw body middleware,
    // we fallback to the JSON string to avoid false negatives in dev.
    const raw = (req as any).rawBody ?? JSON.stringify(req.body ?? {});
    const sig = req.headers['x-hub-signature-256'] as string | undefined;
    if (!verifySignature(raw, sig)) {
      return res.sendStatus(403);
    }

    const entries = req.body?.entry ?? [];
    for (const entry of entries) {
      const changes = entry?.changes ?? [];
      for (const ch of changes) {
        const value = ch?.value;
        const messages = value?.messages ?? [];
        for (const msg of messages) {
          // Basic fields
          const from = msg?.from as string;                  // user phone
          const waId = msg?.id as string | undefined;        // message id
          if (!from) continue;

          // Mark read for better UX
          if (waId) await markAsRead(waId).catch(() => {});

          // Language pref
          const lang = getLang(from);
          const tt = (key: string, params?: Record<string, string | number>) => t(lang, key, params);

          // Parse interaction
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

          // Route interactions first
          if (interactiveId) {
            await handleInteractive(from, interactiveId, tt);
            continue;
          }

          // Track-by-name prompt short-circuit
          if (TRACK_AWAITING_NAME.has(from) && textBody) {
            TRACK_AWAITING_NAME.delete(from);
            await handleTrackByName(from, textBody.trim(), tt);
            continue;
          }

          // Otherwise route plain text / media into the state machine
          await handleMessage(from, { text: textBody, hasImage, imageId }, tt);
        }
      }
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('webhook error:', err);
    res.sendStatus(200);
  }
});

// -------- Helpers to render menus to WA ----------

function toListSections(model: ReturnType<typeof buildMainMenu> | ReturnType<typeof buildProductMenu> | ReturnType<typeof buildVariantMenu>) {
  return model.sections.map(s => ({
    title: s.title,
    rows: s.rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.subtitle,
    })),
  }));
}

async function showMainMenu(user: string, tt: (k: string, p?: any) => string) {
  const model = buildMainMenu((k) => tt(k));
  await sendListMessage({
    to: user,
    header: model.header,
    body: tt('menu.header'),
    footer: model.footer,
    buttonText: 'Chagua',
    sections: toListSections(model),
  });
}

async function showProductMenu(user: string, sku: string, tt: (k: string, p?: any) => string) {
  const p = getProductBySku(sku);
  if (!p) return;
  const model = buildProductMenu((k) => tt(k), p);
  await sendListMessage({
    to: user,
    header: model.header,
    body: p?.name ?? 'Bidhaa',
    footer: model.footer,
    buttonText: 'Chagua',
    sections: toListSections(model),
  });
}

async function showVariantsMenu(user: string, parentSku: string, tt: (k: string, p?: any) => string) {
  const parent = getProductBySku(parentSku);
  if (!parent) return;
  const model = buildVariantMenu((k) => tt(k), parent);
  await sendListMessage({
    to: user,
    header: model.header,
    body: parent?.name ?? 'Bidhaa',
    footer: model.footer,
    buttonText: 'Chagua',
    sections: toListSections(model),
  });
}

// -------- Cart & Checkout summaries ----------

function cartSummaryText(user: string, tt: (k: string, p?: any) => string) {
  const cart = getCart(user);
  if (!cart.length) return tt('cart.empty');
  const lines = cart.map(ci => tt('cart.summary_line', {
    title: ci.name,
    qty: ci.qty,
    price: Math.round(ci.unitPrice).toLocaleString('sw-TZ'),
  }));
  const subtotal = computeSubtotal(cart);
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
      { id: 'ACTION_BACK', title: tt('menu.back_to_menu') },
    ],
  });
}

// -------- Interaction handlers ----------

async function handleInteractive(user: string, id: string, tt: (k: string, p?: any) => string) {
  // Global actions
  if (id === 'ACTION_VIEW_CART') {
    await showCart(user, tt);
    return;
  }
  if (id === 'ACTION_CHECKOUT') {
    await beginCheckout(user, tt);
    return;
  }
  if (id === 'ACTION_TRACK_BY_NAME') {
    TRACK_AWAITING_NAME.add(user);
    await sendText(user, tt('track.ask_name'));
    return;
  }
  if (id === 'ACTION_TALK_TO_AGENT') {
    await sendText(user, 'Karibu kuwasiliana na wakala. Tuma ujumbe wako hapa, au piga: ' + (env.BUSINESS_WA_NUMBER_E164 || ''));
    return;
  }
  if (id === 'ACTION_CHANGE_LANGUAGE') {
    const next = (getLang(user) === 'sw') ? 'en' : 'sw';
    setLang(user, next as Lang);
    await sendText(user, next === 'sw' ? 'Lugha imebadilishwa kuwa *Kiswahili*.' : 'Language switched to *English*.');
    await showMainMenu(user, tt);
    return;
  }
  if (id === 'ACTION_BACK') {
    await showMainMenu(user, tt);
    return;
  }

  // Product selection & product-level actions
  if (id.startsWith('PRODUCT_')) {
    const sku = id.replace('PRODUCT_', '');
    await showProductMenu(user, sku, tt);
    return;
  }
  if (id.startsWith('VARIANTS_')) {
    const sku = id.replace('VARIANTS_', '');
    await showVariantsMenu(user, sku, tt);
    return;
  }
  if (id.startsWith('BUY_')) {
    const sku = id.replace('BUY_', '');
    const p = getProductBySku(sku);
    if (!p) return;
    addToCart(user, { sku: p.sku, name: p.name, qty: 1, unitPrice: p.price });
    await sendText(user, tt('cart.added', { title: p.name }));
    await beginCheckout(user, tt);
    return;
  }
  if (id.startsWith('ADD_')) {
    const sku = id.replace('ADD_', '');
    const p = getProductBySku(sku);
    if (!p) return;
    addToCart(user, { sku: p.sku, name: p.name, qty: 1, unitPrice: p.price });
    await sendText(user, tt('cart.added', { title: p.name }));
    await showCart(user, tt);
    return;
  }
  if (id.startsWith('DETAILS_')) {
    const sku = id.replace('DETAILS_', '');
    const p = getProductBySku(sku);
    if (!p) return;
    // Use product detail keys from i18n (pulled from zip)
    const key =
      p.sku === 'KIBOKO' ? 'product.kiboko.details' :
      p.sku === 'FURAHA' ? 'product.furaha.details' :
      p.sku.startsWith('PROMAX') || p.sku === 'PROMAX' ? 'product.promax.details' :
      '';
    if (key) await sendText(user, t(getLang(user), key));
    await showProductMenu(user, p.sku, tt);
    return;
  }

  // Unknown action → show menu
  await showMainMenu(user, tt);
}

async function beginCheckout(user: string, tt: (k: string, p?: any) => string) {
  const s = getSession(user);
  if (!getCart(user).length) {
    // no items -> show products
    await showMainMenu(user, tt);
    return;
  }
  if (s.state === 'WAIT_PROOF') {
    await sendText(user, tt('proof.ask'));
    return;
  }
  // Start the name-based address flow
  s.state = 'ASK_NAME';
  saveSession(user, s);
  await sendText(user, tt('flow.ask_name'));
}

async function handleMessage(
  user: string,
  incoming: { text?: string; hasImage?: boolean; imageId?: string },
  tt: (k: string, p?: any) => string
) {
  const s = getSession(user);
  const text = (incoming.text ?? '').trim();

  // Commands to show menu quickly
  if (!incoming.hasImage && text) {
    const lower = text.toLowerCase();
    if (['menu', 'menyu', 'start', 'anza'].includes(lower)) {
      await showMainMenu(user, tt);
      return;
    }
    if (['track', 'fuatilia'].includes(lower)) {
      TRACK_AWAITING_NAME.add(user);
      await sendText(user, tt('track.ask_name'));
      return;
    }
  }

  switch (s.state) {
    case 'ASK_NAME': {
      if (!text) {
        await sendText(user, tt('flow.ask_name'));
        return;
      }
      s.name = text;
      s.state = 'ASK_IF_DAR';
      saveSession(user, s);
      await sendText(user, tt('flow.name_saved', { name: s.name }) + '\n' + tt('flow.ask_if_dar'));
      return;
    }

    case 'ASK_IF_DAR': {
      const ans = text.toLowerCase();
      const yes = ['ndio', 'ndiyo', 'yes', 'y'].includes(ans);
      const no = ['hapana', 'no', 'sio', 'siyo', 'si'].includes(ans);
      if (!yes && !no) {
        await sendText(user, tt('flow.reply_yes_no'));
        return;
      }
      if (!no) {
        // inside Dar
        s.isDar = true;
        s.state = 'ASK_DISTRICT';
        saveSession(user, s);
        await sendText(user, tt('flow.ask_district'));
        return;
      }
      // outside Dar: show a coarse estimate, finish summary + payment
      s.isDar = false;
      const estimateFee = feeForDarDistance(env.DEFAULT_DISTANCE_KM);
      s.state = 'SHOW_PRICE';
      saveSession(user, s);

      // show summary & payment
      const subtotal = computeSubtotal(getCart(user));
      const total = subtotal + estimateFee;
      await sendText(
        user,
        [
          tt('checkout.summary_header'),
          tt('checkout.summary_name', { name: s.name ?? '' }),
          tt('checkout.summary_total', { total: Math.round(total).toLocaleString('sw-TZ') }),
        ].join('\n'),
      );
      await sendPaymentInstructions(user, total);
      // move to proof state
      s.state = 'WAIT_PROOF';
      saveSession(user, s);
      await sendText(user, tt('proof.ask'));
      return;
    }

    case 'ASK_DISTRICT': {
      if (!text) {
        await sendText(user, tt('flow.ask_district'));
        return;
      }
      s.district = text;
      s.state = 'ASK_PLACE';
      saveSession(user, s);
      await sendText(user, tt('flow.ask_place'));
      return;
    }

    case 'ASK_PLACE': {
      if (!text) {
        await sendText(user, tt('flow.ask_place'));
        return;
      }
      s.place = text;

      // Distance resolution
      const r = resolveDistanceKm(s.district!, s.place);
      const km = r.km;
      const fee = feeForDarDistance(km);
      s.distanceKm = km;
      s.price = fee;
      s.state = 'SHOW_PRICE';
      saveSession(user, s);

      // Provide quote
      const lines: string[] = [
        tt('flow.distance_quote', { place: s.place, district: s.district, km: km.toFixed(2), fee: Math.round(fee).toLocaleString('sw-TZ') }),
      ];
      if (r.from === 'district_avg') lines.push(tt('flow.distance_avg_used', { district: s.district }));
      if (r.from === 'default') lines.push(tt('flow.distance_default_used'));

      // Order summary
      const cart = getCart(user);
      const subtotal = computeSubtotal(cart);
      const total = subtotal + fee;

      lines.push('');
      lines.push(tt('checkout.summary_header'));
      lines.push(tt('checkout.summary_name', { name: s.name ?? '' }));
      lines.push(tt('checkout.summary_address_dar', { place: s.place, district: s.district, km: km.toFixed(2) }));
      lines.push(tt('checkout.summary_total', { total: Math.round(total).toLocaleString('sw-TZ') }));

      await sendText(user, lines.join('\n'));
      await sendPaymentInstructions(user, total);

      // Move to proof stage
      s.state = 'WAIT_PROOF';
      saveSession(user, s);
      await sendText(user, tt('proof.ask'));
      return;
    }

    case 'SHOW_PRICE': {
      // We already sent summary & payment instructions in the previous step.
      // Transition to WAIT_PROOF so user can send screenshot or names.
      s.state = 'WAIT_PROOF';
      saveSession(user, s);
      await sendText(user, tt('proof.ask'));
      return;
    }

    case 'WAIT_PROOF': {
      // Accept either image or "three names"
      const cart = getCart(user);
      const deliveryFee = s.price ?? feeForDarDistance(s.distanceKm ?? env.DEFAULT_DISTANCE_KM);
      const orderTotal = computeSubtotal(cart) + deliveryFee;

      const mostRecent = s.name ? getMostRecentOrderByName(s.name) : undefined;

      if (incoming.hasImage && s.name) {
        // Create order if we haven’t yet for this flow
        if (!mostRecent || mostRecent.status === 'Delivered' || mostRecent.createdAt < new Date(Date.now() - 1000 * 60 * 60).toISOString()) {
          // create fresh order
          const delivery = s.isDar
            ? { mode: 'dar' as const, district: s.district!, place: s.place!, distanceKm: s.distanceKm ?? env.DEFAULT_DISTANCE_KM, deliveryFee }
            : { mode: 'outside' as const, region: 'Outside Dar', transportMode: 'bus' as const, deliveryFee };
          addOrder({
            customerName: s.name,
            items: cart,
            delivery,
          });
        }
        const order = getMostRecentOrderByName(s.name)!;
        setOrderProof(order, { type: 'image', imageId: incoming.imageId, receivedAt: new Date().toISOString() });
        clearCart(user);
        resetSession(user);
        await sendText(user, tt('proof.ok_image'));
        await sendText(user, 'Oda yako imekamilika. Kwa kufuatilia baadaye, taja jina lako hapa tena.');
        return;
      }

      const words = (incoming.text ?? '').split(/\s+/).filter(Boolean);
      if (words.length >= 3 && s.name) {
        if (!mostRecent || mostRecent.status === 'Delivered' || mostRecent.createdAt < new Date(Date.now() - 1000 * 60 * 60).toISOString()) {
          const delivery = s.isDar
            ? { mode: 'dar' as const, district: s.district!, place: s.place!, distanceKm: s.distanceKm ?? env.DEFAULT_DISTANCE_KM, deliveryFee }
            : { mode: 'outside' as const, region: 'Outside Dar', transportMode: 'bus' as const, deliveryFee };
          addOrder({
            customerName: s.name,
            items: cart,
            delivery,
          });
        }
        const order = getMostRecentOrderByName(s.name)!;
        setOrderProof(order, { type: 'names', fullNames: incoming.text!, receivedAt: new Date().toISOString() });
        clearCart(user);
        resetSession(user);
        await sendText(user, tt('proof.ok_names', { names: incoming.text }));
        await sendText(user, 'Oda yako imekamilika. Kwa kufuatilia baadaye, taja jina lako hapa tena.');
        return;
      }

      await sendText(user, tt('proof.invalid'));
      return;
    }
  }

  // No state matched → show main menu
  await showMainMenu(user, tt);
}

// ---- Tracking helper ----
async function handleTrackByName(user: string, nameInput: string, tt: (k: string, p?: any) => string) {
  const orders = listOrdersByName(nameInput);
  if (!orders.length) {
    await sendText(user, tt('track.none_found', { name: nameInput }));
    return;
  }
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
  await sendText(user, lines.join('\n'));
}
