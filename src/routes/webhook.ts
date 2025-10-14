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
import { getSession, saveSession, resetSession } from '../session.js';
import {
  buildMainMenu,
  buildProductMenu,
  buildVariantMenu,
  getProductBySku,
} from '../menu.js';

export const webhook = Router();

/* ------------------------- lightweight per-user state ------------------------ */
const USER_LANG = new Map<string, Lang>();
const TRACK_AWAITING_NAME = new Set<string>();
type CartItem = OrderItem;
const CART = new Map<string, CartItem[]>();

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
            if (s.state === 'IDLE' || ['hi', 'hello', 'mambo', 'start', 'anza', 'menu', 'menyu'].includes(txt)) {
              await showMainMenu(from, tt);
              continue;
            }
          }

          // Handle interactive replies first
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

          // Fallback to state machine
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

function clip(s: string, n: number) {
  if (!s) return s;
  return s.length <= n ? s : s.slice(0, Math.max(0, n - 1)) + '…';
}

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

function toListSections(
  model: ReturnType<typeof buildMainMenu> | ReturnType<typeof buildProductMenu> | ReturnType<typeof buildVariantMenu>
) {
  return model.sections.map(s => ({
    title: s.title,
    rows: s.rows.map(r => {
      const { title, description } = fitRow(r.title, r.subtitle);
      return { id: r.id, title, description };
    }),
  }));
}

/* ------------------------------ menu shortcuts ------------------------------ */
async function showMainMenu(user: string, tt: (k: string, p?: any) => string) {
  const model = buildMainMenu(k => tt(k));
  await sendListMessage({
    to: user,
    header: model.header,
    body: tt('menu.header'),
    footer: model.footer,
    buttonText: 'Fungua',
    sections: toListSections(model),
  });
}
async function showProductMenu(user: string, sku: string, tt: (k: string, p?: any) => string) {
  const p = getProductBySku(sku);
  if (!p) return;
  const model = buildProductMenu(k => tt(k), p);
  await sendListMessage({
    to: user,
    header: model.header,
    body: p.name,
    footer: model.footer,
    buttonText: 'Fungua',
    sections: toListSections(model),
  });
}
async function showVariantsMenu(user: string, parentSku: string, tt: (k: string, p?: any) => string) {
  const parent = getProductBySku(parentSku);
  if (!parent) return;
  const model = buildVariantMenu(k => tt(k), parent);
  await sendListMessage({
    to: user,
    header: model.header,
    body: parent.name,
    footer: model.footer,
    buttonText: 'Chagua',
    sections: toListSections(model),
  });
}

/* ------------------------------ cart helpers ------------------------------- */
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
      { id: 'ACTION_CHECKOUT', title: tt('menu.checkout') }, // "Kamilisha oda" (<=20 chars)
      { id: 'ACTION_BACK', title: tt('menu.back_to_menu') }, // "Rudi menyu"
    ],
  });
}

/* --------------------------- interactive routing --------------------------- */
async function handleInteractive(user: string, id: string, tt: (k: string, p?: any) => string) {
  // global actions
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
    const next = (getLang(user) === 'sw') ? 'en' : 'sw';
    setLang(user, next as Lang);
    await sendText(user, next === 'sw' ? 'Lugha: Kiswahili' : 'Language: English');
    return showMainMenu(user, tt);
  }
  if (id === 'ACTION_BACK') return showMainMenu(user, tt);

  // Dar buttons
  if (id === 'INSIDE_DAR') {
    const s = getSession(user);
    s.isDar = true;
    s.state = 'ASK_DISTRICT';
    saveSession(user, s);
    return sendText(user, tt('flow.ask_district'));
  }
  if (id === 'OUTSIDE_DAR') {
    const s = getSession(user);
    s.isDar = false;
    const estimateFee = feeForDarDistance(Number(env.DEFAULT_DISTANCE_KM) || 8);
    s.state = 'SHOW_PRICE';
    saveSession(user, s);
    const subtotal = computeSubtotal(getCart(user));
    const total = subtotal + estimateFee;
    await sendText(user, [
      tt('checkout.summary_header'),
      tt('checkout.summary_name', { name: s.name ?? '' }),
      tt('checkout.summary_total', { total: Math.round(total).toLocaleString('sw-TZ') }),
    ].join('\n'));
    await sendPaymentInstructions(user, total);
    s.state = 'WAIT_PROOF';
    saveSession(user, s);
    return sendText(user, tt('proof.ask'));
  }

  // products
  if (id.startsWith('PRODUCT_')) {
    const sku = id.replace('PRODUCT_', '');
    return showProductMenu(user, sku, tt);
  }
  if (id.startsWith('VARIANTS_')) {
    const sku = id.replace('VARIANTS_', '');
    return showVariantsMenu(user, sku, tt);
  }
  if (id.startsWith('BUY_')) {
    const sku = id.replace('BUY_', '');
    const p = getProductBySku(sku);
    if (!p) return;
    addToCart(user, { sku: p.sku, name: p.name, qty: 1, unitPrice: p.price });
    await sendText(user, tt('cart.added', { title: p.name }));
    return beginCheckout(user, tt);
  }
  if (id.startsWith('ADD_')) {
    const sku = id.replace('ADD_', '');
    const p = getProductBySku(sku);
    if (!p) return;
    addToCart(user, { sku: p.sku, name: p.name, qty: 1, unitPrice: p.price });
    await sendText(user, tt('cart.added', { title: p.name }));
    return showCart(user, tt);
  }
  if (id.startsWith('DETAILS_')) {
    const sku = id.replace('DETAILS_', '');
    const p = getProductBySku(sku);
    if (!p) return;
    const key =
      p.sku === 'KIBOKO' ? 'product.kiboko.details' :
      p.sku === 'FURAHA' ? 'product.furaha.details' :
      p.sku.startsWith('PROMAX') || p.sku === 'PROMAX' ? 'product.promax.details' :
      '';
    if (key) await sendText(user, t(getLang(user), key));
    return showProductMenu(user, p.sku, tt);
  }

  return showMainMenu(user, tt);
}

/* ------------------------------- begin checkout ------------------------------ */
async function beginCheckout(user: string, tt: (k: string, p?: any) => string) {
  const cart = getCart(user);
  if (!cart.length) return showMainMenu(user, tt);
  const s = getSession(user);
  s.state = 'ASK_NAME';
  saveSession(user, s);
  await sendText(user, tt('flow.ask_name'));
}

/* ------------------------------- state machine ------------------------------ */
async function handleMessage(
  user: string,
  incoming: { text?: string; hasImage?: boolean; imageId?: string },
  tt: (k: string, p?: any) => string
) {
  const s = getSession(user);
  const text = (incoming.text ?? '').trim();

  switch (s.state) {
    case 'IDLE': {
      await showMainMenu(user, tt);
      return;
    }

    case 'ASK_NAME': {
      if (!text) return sendText(user, tt('flow.ask_name'));
      s.name = text;
      s.state = 'ASK_IF_DAR';
      saveSession(user, s);
      return sendButtonsMessage({
        to: user,
        body: tt('flow.ask_if_dar'),
        buttons: [
          { id: 'INSIDE_DAR', title: 'Ndani ya Dar' }, // <=20 chars
          { id: 'OUTSIDE_DAR', title: 'Nje ya Dar' },  // <=20 chars
          { id: 'ACTION_BACK', title: tt('menu.back_to_menu') },
        ],
      });
    }

    case 'ASK_IF_DAR': {
      const ans = text.toLowerCase();
      if (['ndio','ndiyo','yes','y'].includes(ans)) return handleInteractive(user, 'INSIDE_DAR', tt);
      if (['hapana','no','sio','siyo','si','n'].includes(ans)) return handleInteractive(user, 'OUTSIDE_DAR', tt);
      return sendButtonsMessage({
        to: user,
        body: tt('flow.ask_if_dar'),
        buttons: [
          { id: 'INSIDE_DAR', title: 'Ndani ya Dar' },
          { id: 'OUTSIDE_DAR', title: 'Nje ya Dar' },
          { id: 'ACTION_BACK', title: tt('menu.back_to_menu') },
        ],
      });
    }

    case 'ASK_DISTRICT': {
      if (!text) return sendText(user, tt('flow.ask_district'));
      s.district = text;
      s.state = 'ASK_PLACE';
      saveSession(user, s);
      return sendText(user, tt('flow.ask_place'));
    }

    case 'ASK_PLACE': {
      if (!text) return sendText(user, tt('flow.ask_place'));
      s.place = text;

      const r = resolveDistanceKm(s.district!, s.place);
      const km = r.km;
      const fee = feeForDarDistance(km);

      s.distanceKm = km;
      s.price = fee;
      s.state = 'SHOW_PRICE';
      saveSession(user, s);

      const cart = getCart(user);
      const subtotal = computeSubtotal(cart);
      const total = subtotal + fee;

      const lines = [
        tt('flow.distance_quote', { place: s.place, district: s.district, km: km.toFixed(2), fee: Math.round(fee).toLocaleString('sw-TZ') }),
      ];
      if (r.from === 'district_avg') lines.push(tt('flow.distance_avg_used', { district: s.district }));
      if (r.from === 'default') lines.push(tt('flow.distance_default_used'));
      lines.push('');
      lines.push(tt('checkout.summary_header'));
      lines.push(tt('checkout.summary_name', { name: s.name ?? '' }));
      lines.push(tt('checkout.summary_address_dar', { place: s.place, district: s.district, km: km.toFixed(2) }));
      lines.push(tt('checkout.summary_total', { total: Math.round(total).toLocaleString('sw-TZ') }));

      await sendText(user, lines.join('\n'));
      await sendPaymentInstructions(user, total);

      s.state = 'WAIT_PROOF';
      saveSession(user, s);
      return sendText(user, tt('proof.ask'));
    }

    case 'SHOW_PRICE': {
      s.state = 'WAIT_PROOF';
      saveSession(user, s);
      return sendText(user, tt('proof.ask'));
    }

    case 'WAIT_PROOF': {
      const cart = getCart(user);
      const deliveryFee = s.price ?? feeForDarDistance(s.distanceKm ?? Number(env.DEFAULT_DISTANCE_KM)) ;
      const mostRecent = s.name ? getMostRecentOrderByName(s.name) : undefined;

      if (incoming.hasImage && s.name) {
        if (!mostRecent || mostRecent.status === 'Delivered') {
          const delivery = s.isDar
            ? { mode: 'dar' as const, district: s.district!, place: s.place!, distanceKm: (s.distanceKm ?? Number(env.DEFAULT_DISTANCE_KM)) || 8, deliveryFee }
            : { mode: 'outside' as const, region: 'Outside Dar', transportMode: 'bus' as const, deliveryFee };
          addOrder({ customerName: s.name, items: cart, delivery });
        }
        const order = getMostRecentOrderByName(s.name)!;
        setOrderProof(order, { type: 'image', imageId: incoming.imageId, receivedAt: new Date().toISOString() });
        clearCart(user);
        resetSession(user);
        await sendText(user, tt('proof.ok_image'));
        await sendText(user, 'Oda imekamilika. Kwa kufuatilia baadaye, taja jina lako hapa tena.');
        return;
      }

      const words = (incoming.text ?? '')
        .split(/\s+/)
        .map(w => w.trim())
        .filter(w => /[A-Za-z\u00C0-\u024F]+/.test(w));
      if (words.length >= 3 && s.name) {
        if (!mostRecent || mostRecent.status === 'Delivered') {
          const delivery = s.isDar
            ? { mode: 'dar' as const, district: s.district!, place: s.place!, distanceKm: (s.distanceKm ?? Number(env.DEFAULT_DISTANCE_KM)) || 8, deliveryFee }
            : { mode: 'outside' as const, region: 'Outside Dar', transportMode: 'bus' as const, deliveryFee };
          addOrder({ customerName: s.name, items: cart, delivery });
        }
        const order = getMostRecentOrderByName(s.name)!;
        setOrderProof(order, { type: 'names', fullNames: incoming.text!, receivedAt: new Date().toISOString() });
        clearCart(user);
        resetSession(user);
        await sendText(user, tt('proof.ok_names', { names: incoming.text }));
        await sendText(user, 'Oda imekamilika. Kwa kufuatilia baadaye, taja jina lako hapa tena.');
        return;
      }

      return sendText(user, tt('proof.invalid'));
    }
  }

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
