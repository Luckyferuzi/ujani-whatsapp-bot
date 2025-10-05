// src/routes/webhook.ts
import type { Request, Response } from 'express';
import { Router } from 'express';
import crypto from 'node:crypto';
import pino from 'pino';
import { env } from '../config.js';

import {
  getSession, setExpecting, setLang,
  startCheckout, updateCheckout, setCheckoutStage, resetCheckout, setLastOrderId,
  addToCart, clearCart, cartTotal
} from '../session.js';
import { t } from '../i18n.js';
import { sendInteractiveButtons, sendInteractiveList, sendText } from '../whatsapp.js';
import {
  PRODUCTS, PROMAX_PACKAGES, PROMAX_PRICE_TZS,
  isProMaxPackageId, promaxPackageSummary, promaxPackageTitle,
  productTitle, formatTZS
} from '../menu.js';
import {
  createOrder, getOrder, updateOrderAddress,
  attachTxnMessage, attachTxnImage, OrderItem
} from '../orders.js';
import { resolveWardDistrictFromFreeText, getDistanceKm } from '../wards.js';
import { feeForDarDistance, OUTSIDE_DAR_FLAT } from '../delivery.js';

const logger = pino({ name: 'webhook' });
export const webhook = Router();

/* ---------- WhatsApp UI limits & clamp helpers ---------- */
const MAX_ROW_TITLE = 24, MAX_ROW_DESC = 72, MAX_SECTION_TITLE = 24, MAX_BUTTON_TITLE = 20, MAX_HEADER_TEXT = 60, MAX_BODY_TEXT = 1024;
const clamp = (s: string | null | undefined, n: number) => ((s ?? '') + '').length > n ? ((s ?? '') + '').slice(0, n - 1) + '…' : ((s ?? '') + '');
const clampTitle = (s: string) => clamp(s, MAX_ROW_TITLE);
const clampDesc = (s: string) => clamp(s, MAX_ROW_DESC);
const clampSection = (s: string) => clamp(s, MAX_SECTION_TITLE);
const clampButton = (s: string) => clamp(s, MAX_BUTTON_TITLE);
const clampHeader = (s: string) => clamp(s, MAX_HEADER_TEXT);
const clampBody = (s: string) => clamp(s, MAX_BODY_TEXT);

/* ---------- Small pacing helper to avoid WA dropping extra messages ---------- */
const SLEEP_MS = 450; // 300–600ms works well; adjust if needed
const nap = (ms = SLEEP_MS) => new Promise((r) => setTimeout(r, ms));

/* -------------------------------- Verify -------------------------------- */
webhook.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === env.VERIFY_TOKEN) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

/* ------------------------------ Signatures ------------------------------- */
function verifySignature(req: Request): boolean {
  if (!env.APP_SECRET) return true;
  try {
    const sig256 = (req.headers['x-hub-signature-256'] || '').toString();
    if (!sig256.startsWith('sha256=')) return false;
    const received = sig256.slice(7);
    const hmac = crypto.createHmac('sha256', env.APP_SECRET);
    hmac.update((req as any).rawBody || Buffer.from(''));
    const expected = hmac.digest('hex');
    return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  } catch {
    return false;
  }
}

/* -------------------------------- Helpers -------------------------------- */
function plainTZS(n: number): string {
  return formatTZS(n).replace(/\u00A0/g, ' ');
}
function productListTitleShort(id: string): string {
  if (id === 'product_kiboko') return clampTitle('Ujani Kiboko');
  if (id === 'product_furaha') return clampTitle('Furaha ya Ndoa');
  if (id === 'product_promax') return clampTitle('Ujani Pro Max');
  return clampTitle(id);
}
function productListDescShort(k: string, lang: 'en' | 'sw'): string {
  if (k === 'product_kiboko') {
    const p = PRODUCTS.find(p => p.id === 'product_kiboko')?.priceTZS ?? 0;
    return clampDesc(lang === 'en' ? `Topical · ${plainTZS(p)}` : `Ya kupaka · ${plainTZS(p)}`);
  }
  if (k === 'product_furaha') {
    const p = PRODUCTS.find(p => p.id === 'product_furaha')?.priceTZS ?? 0;
    return clampDesc(lang === 'en' ? `Oral · ${plainTZS(p)}` : `Ya kunywa · ${plainTZS(p)}`);
  }
  if (k === 'product_promax') return clampDesc(`A/B/C · ${plainTZS(PROMAX_PRICE_TZS)}`);
  return '';
}

async function sendMainMenu(to: string, lang: 'en' | 'sw') {
  const productsRows = [
    { id: 'product_kiboko', title: productListTitleShort('product_kiboko'), description: productListDescShort('product_kiboko', lang) },
    { id: 'product_furaha', title: productListTitleShort('product_furaha'), description: productListDescShort('product_furaha', lang) },
    { id: 'product_promax', title: productListTitleShort('product_promax'), description: productListDescShort('product_promax', lang) },
  ];
  const helpRows = [
    { id: 'view_cart', title: clampTitle(lang === 'sw' ? 'Angalia Kikapu' : 'View Cart'), description: '' },
    { id: 'talk_agent', title: clampTitle(t(lang, 'talk_agent_title')), description: clampDesc(t(lang, 'talk_agent_desc')) },
    { id: 'track_order', title: clampTitle(t(lang, 'track_order_title')), description: clampDesc(t(lang, 'track_order_desc')) },
  ];
  const settingsRows = [{ id: 'change_language', title: clampTitle(t(lang, 'change_lang_title')), description: clampDesc(t(lang, 'change_lang_desc')) }];

  await sendInteractiveList({
    to,
    header: clampHeader('UJANI'),
    body: clampBody(t(lang, 'menu_body')),
    buttonText: clampButton(t(lang, 'menu_button')),
    sections: [
      { title: clampSection(t(lang, 'section_products')), rows: productsRows },
      { title: clampSection(t(lang, 'section_help')), rows: helpRows },
      { title: clampSection(t(lang, 'section_settings')), rows: settingsRows },
    ]
  });
}

async function showProductActionsList(to: string, lang: 'en' | 'sw', productId: string) {
  const rows = [
    { id: `action_buy_${productId}`,  title: clampTitle(lang === 'sw' ? 'Nunua sasa' : 'Buy now'), description: '' },
    { id: `action_info_${productId}`, title: clampTitle(lang === 'sw' ? 'Maelezo zaidi' : 'More details'), description: '' },
    { id: `action_add_${productId}`,  title: clampTitle(lang === 'sw' ? 'Ongeza kikapuni' : 'Add to cart'), description: '' },
    { id: 'view_cart',                title: clampTitle(lang === 'sw' ? 'Angalia Kikapu' : 'View Cart'), description: '' },
    { id: 'back_menu',                title: clampTitle(lang === 'sw' ? 'Rudi menyu' : 'Back to menu'), description: '' }
  ];

  await sendInteractiveList({
    to,
    header: clampHeader(productTitle(productId, lang)),
    body: clampBody(lang === 'sw' ? 'Chagua hatua unayotaka' : 'Choose an action'),
    buttonText: clampButton(t(lang, 'menu_button')),
    sections: [{ title: clampSection(lang === 'sw' ? 'Chaguo' : 'Options'), rows }]
  });
}

async function showAgentOptions(to: string, lang: 'en' | 'sw') {
  await sendInteractiveList({
    to,
    header: clampHeader(lang === 'sw' ? 'Ongea na Wakala' : 'Talk to Agent'),
    body: clampBody(t(lang, 'agent_body')),
    buttonText: clampButton(t(lang, 'menu_button')),
    sections: [
      {
        title: clampSection(lang === 'sw' ? 'Aina ya mawasiliano' : 'Contact types'),
        rows: [
          { id: 'agent_text',        title: clampTitle(t(lang, 'agent_text_title')), description: clampDesc(t(lang, 'agent_text_desc')) },
          { id: 'agent_wa_call',     title: clampTitle(t(lang, 'agent_wa_call_title')), description: clampDesc(t(lang, 'agent_wa_call_desc')) },
          { id: 'agent_normal_call', title: clampTitle(t(lang, 'agent_phone_title')), description: clampDesc(t(lang, 'agent_phone_desc')) },
          { id: 'back_menu',         title: clampTitle(t(lang, 'row_back_menu')), description: '' },
        ]
      }
    ]
  });
}

async function pickProMaxPackage(to: string, lang: 'en' | 'sw') {
  await sendInteractiveList({
    to,
    header: clampHeader('Ujani Pro Max'),
    body: clampBody(t(lang, 'promax_pick_package')),
    buttonText: clampButton(t(lang, 'menu_button')),
    sections: [
      {
        title: clampSection(t(lang, 'section_promax')),
        rows: PROMAX_PACKAGES.map(p => ({
          id: p.id,
          title: clampTitle(promaxPackageTitle(p.id, lang)),
          description: clampDesc(promaxPackageSummary(p.id, lang)),
        }))
      }
    ]
  });
}

/* ----------------------------- Address parsing --------------------------- */
function parseAddress(input: string): { street: string; city: string; country: string } | null {
  const parts = input.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  const country = parts[parts.length - 1];
  const city = parts[parts.length - 2];
  const street = parts.slice(0, parts.length - 2).join(', ');
  if (!street || !city || !country) return null;
  return { street, city, country };
}
function normalizePhone(raw: string): string | null {
  const s = raw.replace(/\s+/g, '');
  if (/^0\d{8,10}$/.test(s)) return `+255${s.slice(1)}`;
  if (/^\+\d{9,15}$/.test(s)) return s;
  if (/^\d{9,15}$/.test(s))   return `+${s}`;
  return null;
}

/* ------------------------------- Webhook POST ---------------------------- */
webhook.post('/', async (req: Request, res: Response) => {
  try {
    if (!verifySignature(req)) { logger.warn('Signature check failed'); return res.sendStatus(200); }

    const entry = req.body?.entry?.[0];
    const messages = entry?.changes?.[0]?.value?.messages;
    if (!messages || !messages.length) return res.sendStatus(200);

    const msg = messages[0];
    const from: string = msg.from;
    const textBody: string | undefined = msg.text?.body?.trim();
    const buttonReplyId: string | undefined = msg.interactive?.button_reply?.id;
    const listReplyId: string | undefined = msg.interactive?.list_reply?.id;
    const image = msg.image, document = msg.document, media = image || document;

    // Language selection
    if (textBody === 'EN') { setLang(from, 'en'); await sendMainMenu(from, 'en'); return res.sendStatus(200); }
    if (textBody === 'SW') { setLang(from, 'sw'); await sendMainMenu(from, 'sw'); return res.sendStatus(200); }
    const lang = getSession(from).lang || 'sw';

    // Main menu entry
    if (textBody === 'MENU' || buttonReplyId === 'back_menu') { await sendMainMenu(from, lang); return res.sendStatus(200); }

    // Product pick from list
    if (listReplyId === 'product_promax') { await pickProMaxPackage(from, lang); return res.sendStatus(200); }
    if (listReplyId && isProMaxPackageId(listReplyId)) { await showProductActionsList(from, lang, listReplyId); return res.sendStatus(200); }

    // Product actions
    if (listReplyId?.startsWith('action_info_')) {
      const pid = listReplyId.replace('action_info_', '');
      const key = pid === 'product_kiboko' ? 'kiboko_more_bullets'
               : pid === 'product_furaha' ? 'furaha_more_bullets'
               : (isProMaxPackageId(pid) ? 'promax_detail_promax_a' : null);
      if (key) await sendText({ to: from, body: t(lang, key) });
      else     await sendText({ to: from, body: t(lang, 'not_found') });
      await nap();
      await showProductActionsList(from, lang, pid);
      return res.sendStatus(200);
    }

    if (listReplyId?.startsWith('action_add_')) {
      const pid = listReplyId.replace('action_add_', '');
      const title = isProMaxPackageId(pid) ? `${productTitle('product_promax', lang)} — ${promaxPackageTitle(pid, lang)}` : productTitle(pid, lang);
      const price =
        pid === 'product_kiboko' ? (PRODUCTS.find(p => p.id === 'product_kiboko')?.priceTZS ?? 0) :
        pid === 'product_furaha' ? (PRODUCTS.find(p => p.id === 'product_furaha')?.priceTZS ?? 0) :
        PROMAX_PRICE_TZS;

      addToCart(from, { productId: pid, title, priceTZS: price, qty: 1 });
      await sendText({ to: from, body: t(lang, 'cart_added', { title }) });
      await nap();
      await showCartSummary(from, lang);
      return res.sendStatus(200);
    }

    if (listReplyId?.startsWith('action_buy_')) {
      const pid = listReplyId.replace('action_buy_', '');
      let totalTZS = 0; let title = '';
      if (isProMaxPackageId(pid)) { title = `${productTitle('product_promax', lang)} — ${promaxPackageTitle(pid, lang)}`; totalTZS = PROMAX_PRICE_TZS; }
      else { title = productTitle(pid, lang); totalTZS = PRODUCTS.find(p => p.id === pid)?.priceTZS ?? 0; }
      startCheckout(from, pid, title, totalTZS);

      await sendInteractiveButtons({
        to: from,
        body: clampBody(lang === 'sw' ? 'Je, uko ndani ya Dar es Salaam au nje ya Dar es Salaam?' : 'Are you within Dar es Salaam or outside Dar es Salaam?'),
        buttons: [
          { id: 'area_dar',     title: clampButton(lang === 'sw' ? 'Ndani ya Dar es Salaam' : 'Within Dar') },
          { id: 'area_outside', title: clampButton(lang === 'sw' ? 'Nje ya Dar es Salaam'   : 'Outside Dar') },
          { id: 'back_menu',    title: clampButton(t(lang, 'btn_back_menu')) },
        ]
      });
      return res.sendStatus(200);
    }

    if (listReplyId === 'view_cart') { await showCartSummary(from, lang); return res.sendStatus(200); }
    if (listReplyId === 'back_menu') { await sendMainMenu(from, lang); return res.sendStatus(200); }

    // Cart actions
    if (buttonReplyId === 'cart_checkout') {
      const items = getSession(from).cart.items;
      if (!items.length) { await sendText({ to: from, body: t(lang, 'cart_empty') }); await sendMainMenu(from, lang); return res.sendStatus(200); }
      startCheckout(from);
      await sendInteractiveButtons({
        to: from,
        body: clampBody(lang === 'sw' ? 'Je, uko ndani ya Dar es Salaam au nje ya Dar es Salaam?' : 'Are you within Dar es Salaam or outside Dar es Salaam?'),
        buttons: [
          { id: 'area_dar',     title: clampButton(lang === 'sw' ? 'Ndani ya Dar es Salaam' : 'Within Dar') },
          { id: 'area_outside', title: clampButton(lang === 'sw' ? 'Nje ya Dar es Salaam'   : 'Outside Dar') },
          { id: 'back_menu',    title: clampButton(t(lang, 'btn_back_menu')) },
        ]
      });
      return res.sendStatus(200);
    }
    if (buttonReplyId === 'cart_clear') { clearCart(from); await sendText({ to: from, body: t(lang, 'cart_empty') }); await sendMainMenu(from, lang); return res.sendStatus(200); }

    // Area choice
    if (buttonReplyId === 'area_dar') {
      updateCheckout(from, { addressCountry: 'Dar es Salaam' } as any);
      await sendInteractiveButtons({
        to: from,
        body: clampBody(t(lang, 'choose_fulfillment')),
        buttons: [
          { id: 'fulfill_pickup',   title: clampButton(t(lang, 'btn_pickup')) },
          { id: 'fulfill_delivery', title: clampButton(t(lang, 'btn_delivery')) },
          { id: 'back_menu',        title: clampButton(t(lang, 'btn_back_menu')) },
        ]
      });
      return res.sendStatus(200);
    }
    if (buttonReplyId === 'area_outside') {
      updateCheckout(from, { addressCountry: 'OUTSIDE_DAR' } as any);
      setCheckoutStage(from, 'asked_name'); setExpecting(from, 'customer_name');
      await sendText({ to: from, body: lang === 'sw' ? 'Tuma majina matatu kamili ya mteja.' : 'Send the customer\'s full name (three parts).' });
      return res.sendStatus(200);
    }

    // Outside Dar: transport mode
    if (buttonReplyId === 'outside_mode_bus' || buttonReplyId === 'outside_mode_boat') {
      const mode = buttonReplyId === 'outside_mode_bus' ? 'Bus' : 'Boat';
      updateCheckout(from, { outsideMode: mode } as any);
      setExpecting(from, 'delivery_address');
      await sendText({ to: from, body: lang === 'sw' ? (mode === 'Bus' ? 'Taja jina la basi (mf. Aboud).' : 'Taja jina la boti.') : (mode === 'Bus' ? 'Type the bus name (e.g., Aboud).' : 'Type the boat name.') });
      return res.sendStatus(200);
    }

    // Fulfillment pick → ask name
    if (buttonReplyId === 'fulfill_pickup' || buttonReplyId === 'fulfill_delivery') {
      updateCheckout(from, { fulfillment: buttonReplyId === 'fulfill_pickup' ? 'pickup' : 'delivery' });
      setCheckoutStage(from, 'asked_name'); setExpecting(from, 'customer_name');
      await sendText({ to: from, body: t(lang, 'ask_full_name') });
      return res.sendStatus(200);
    }

    // Agent
    if (listReplyId === 'talk_agent') { await showAgentOptions(from, lang); return res.sendStatus(200); }
    if (listReplyId === 'agent_text') { await sendText({ to: from, body: t(lang, 'agent_text_ack') }); return res.sendStatus(200); }
    if (listReplyId === 'agent_wa_call') { logger.info({ type: 'wa_call_request', from }, 'User requested WhatsApp call'); await sendText({ to: from, body: t(lang, 'agent_wa_call_ack') }); return res.sendStatus(200); }
    if (listReplyId === 'agent_normal_call') { setExpecting(from, 'agent_phone'); await sendText({ to: from, body: t(lang, 'agent_prompt_phone') }); return res.sendStatus(200); }

    // Track order
    if (listReplyId === 'track_order') { setExpecting(from, 'order_id'); await sendText({ to: from, body: t(lang, 'prompt_order_id') }); return res.sendStatus(200); }

    if (textBody && getSession(from).expecting === 'order_id') {
      const id = textBody.replace(/\s+/g, ''); const o = getOrder(id);
      if (!o) { await sendText({ to: from, body: t(lang, 'status_not_found') }); setExpecting(from, 'none'); return res.sendStatus(200); }
      const paid = o.paidTZS ?? 0; const due = Math.max(0, (o.totalTZS ?? 0) - paid);
      await sendText({ to: from, body: `*${t(lang, 'order_created_title')}*\n*Order:* ${o.orderId}\n*Title:* ${o.title}\n*Name:* ${o.customerName || ''}\n*Address:* ${o.addressStreet || ''} ${o.addressCity || ''} ${o.addressCountry || ''}\n*Total:* ${plainTZS(o.totalTZS ?? 0)}\n*Paid:* ${plainTZS(paid)}\n*Balance:* ${plainTZS(due)}\n` });
      setExpecting(from, 'none'); return res.sendStatus(200);
    }

    // Agent phone
    if (textBody && getSession(from).expecting === 'agent_phone') {
      const normalized = normalizePhone(textBody);
      if (!normalized) { await sendText({ to: from, body: t(lang, 'phone_invalid') }); return res.sendStatus(200); }
      logger.info({ type: 'normal_call_request', from, phone: normalized }, 'User requested normal phone call');
      await sendText({ to: from, body: t(lang, 'agent_phone_ack', { phone: normalized }) });
      setExpecting(from, 'none'); return res.sendStatus(200);
    }

    // Checkout: Full name (branches by area)
    if (textBody && getSession(from).expecting === 'customer_name') {
      updateCheckout(from, { customerName: textBody });
      const s = (getSession(from).checkout ?? {}) as any; const outside = s.addressCountry === 'OUTSIDE_DAR'; const isPickup = s.fulfillment === 'pickup';
      if (outside) { setCheckoutStage(from, 'asked_address'); setExpecting(from, 'delivery_address'); await sendText({ to: from, body: lang === 'sw' ? 'Taja mkoa (region) uliopo.' : 'Type your region.' }); return res.sendStatus(200); }
      if (isPickup) { setCheckoutStage(from, 'asked_phone'); setExpecting(from, 'pickup_phone'); await sendText({ to: from, body: t(lang, 'ask_phone') }); return res.sendStatus(200); }
      setCheckoutStage(from, 'asked_address'); setExpecting(from, 'delivery_address');
      await sendText({ to: from, body: lang === 'sw' ? 'Taja *ward na district* (mf. "tabata kimanga ilala").' : 'Type *ward and district* (e.g., "tabata kimanga ilala").' });
      return res.sendStatus(200);
    }

    // Pickup: Phone → create order
    if (textBody && getSession(from).expecting === 'pickup_phone') {
      const normalized = normalizePhone(textBody);
      if (!normalized) { await sendText({ to: from, body: t(lang, 'phone_invalid') }); return res.sendStatus(200); }
      updateCheckout(from, { contactPhone: normalized });
      const s = (getSession(from).checkout ?? {}) as any;
      let items: OrderItem[] = [];
      if (!s.productId) items = getSession(from).cart.items.map((it: any) => ({ ...it }));
      else {
        let price = isProMaxPackageId(s.productId) ? PROMAX_PRICE_TZS : (PRODUCTS.find(p => p.id === s.productId)?.priceTZS ?? 0);
        const title = isProMaxPackageId(s.productId) ? `${productTitle('product_promax', lang)} — ${promaxPackageTitle(s.productId, lang)}` : productTitle(s.productId, lang);
        items.push({ productId: s.productId, title, qty: 1, priceTZS: price });
      }
      const fee = Math.max(0, Math.floor((s as any).deliveryFeeTZS || 0));
      if (fee > 0) items.push({ productId: 'delivery_fee', title: lang === 'sw' ? 'Nauli ya Usafiri' : 'Delivery Fee', qty: 1, priceTZS: fee });

      const order = createOrder({ items, lang, customerPhone: from, contactPhone: s.contactPhone, fulfillment: 'pickup', customerName: s.customerName, addressStreet: s.addressStreet, addressCity: s.addressCity, addressCountry: s.addressCountry });
      setLastOrderId(from, order.orderId); clearCart(from);

      await sendText({ to: from, body: t(lang, 'pickup_thanks', { customerName: order.customerName || '' }) });
      resetCheckout(from); return res.sendStatus(200);
    }

    // Address handler (multi-step)
    if (textBody && getSession(from).expecting === 'delivery_address') {
      const s = (getSession(from).checkout ?? {}) as any;
      const outside = s.addressCountry === 'OUTSIDE_DAR'; const isDarDelivery = s.addressCountry === 'Dar es Salaam' && s.fulfillment === 'delivery';

      // Outside Dar — Step 1: Region
      if (outside && !s.addressCountryRegion) {
        updateCheckout(from, { addressCountryRegion: textBody } as any);
        await sendInteractiveButtons({
          to: from,
          body: clampBody(lang === 'sw' ? 'Chagua aina ya usafiri:' : 'Choose transport type:'),
          buttons: [
            { id: 'outside_mode_bus',  title: clampButton(lang === 'sw' ? 'Basi' : 'Bus') },
            { id: 'outside_mode_boat', title: clampButton(lang === 'sw' ? 'Boti' : 'Boat') },
          ]
        });
        return res.sendStatus(200);
      }

      // Outside Dar — Step 2: Transport name
      if (outside && s.addressCountryRegion && s.outsideMode && !s.outsideTransportName) {
        updateCheckout(from, { outsideTransportName: textBody } as any);
        await sendText({ to: from, body: lang === 'sw' ? 'Taja kituo/stendi unachopendelea (mf. Kisamvu, Morogoro).' : 'Type the preferred station (e.g., Kisamvu, Morogoro).' });
        return res.sendStatus(200);
      }

      // Outside Dar — Step 3: Station → fee → summary → phone
      if (outside && s.addressCountryRegion && s.outsideMode && s.outsideTransportName && !s.outsideStation) {
        updateCheckout(from, { outsideStation: textBody, deliveryFeeTZS: OUTSIDE_DAR_FLAT } as any);
        const fee = OUTSIDE_DAR_FLAT; const total = (s.totalTZS ?? cartTotal(from)) + fee;
        const summary = lang === 'sw'
          ? `📦 *Muhtasari (Nje ya Dar)*\nJina: ${s.customerName || ''}\nMkoa: ${s.addressCountryRegion}\nUsafiri: ${s.outsideMode} - ${s.outsideTransportName}\nKituo: ${textBody}\nNauli: ${plainTZS(fee)}\nJumla: ${plainTZS(total)}`
          : `📦 *Summary (Outside Dar)*\nName: ${s.customerName || ''}\nRegion: ${s.addressCountryRegion}\nTransport: ${s.outsideMode} - ${s.outsideTransportName}\nStation: ${textBody}\nDelivery: ${plainTZS(fee)}\nTotal: ${plainTZS(total)}`;
        await sendText({ to: from, body: summary });
        await nap();
        setCheckoutStage(from, 'asked_phone'); setExpecting(from, 'delivery_phone');
        await sendText({ to: from, body: t(lang, 'ask_phone') });
        return res.sendStatus(200);
      }

      // Inside Dar — Delivery: ward+district → distance + fee → summary → phone
      if (isDarDelivery && !s.addressStreet && !s.addressCity) {
        const resolved = resolveWardDistrictFromFreeText(textBody);
        if (!resolved) { await sendText({ to: from, body: lang === 'sw' ? 'Hatukupata eneo lako. Taja tena ward + district (mf. Kimanga Ilala).' : 'Could not resolve. Please type ward + district (e.g., Kimanga Ilala).' }); return res.sendStatus(200); }
        const km = getDistanceKm(resolved.district, resolved.ward) ?? 0; const fee = feeForDarDistance(km);
        updateCheckout(from, { addressStreet: resolved.ward, addressCity: resolved.district, addressCountry: 'Dar es Salaam', deliveryKm: km, deliveryFeeTZS: fee } as any);
        const total = (s.totalTZS ?? cartTotal(from)) + fee;
        const summary = lang === 'sw'
          ? `📦 *Muhtasari (Delivery Dar)*\nJina: ${s.customerName || ''}\nMahali: ${resolved.ward}, ${resolved.district}\nUmbali: ${km.toFixed(2)} km\nNauli: ${plainTZS(fee)}\nJumla: ${plainTZS(total)}`
          : `📦 *Summary (Dar Delivery)*\nName: ${s.customerName || ''}\nPlace: ${resolved.ward}, ${resolved.district}\nDistance: ${km.toFixed(2)} km\nDelivery: ${plainTZS(fee)}\nTotal: ${plainTZS(total)}`;
        await sendText({ to: from, body: summary });
        await nap();
        setCheckoutStage(from, 'asked_phone'); setExpecting(from, 'delivery_phone');
        await sendText({ to: from, body: t(lang, 'ask_phone') });
        return res.sendStatus(200);
      }

      // Structured fallback
      const parsed = parseAddress(textBody);
      if (!parsed) { await sendText({ to: from, body: t(lang, 'address_invalid') }); return res.sendStatus(200); }
      updateCheckout(from, { addressRaw: textBody, addressStreet: parsed.street, addressCity: parsed.city, addressCountry: parsed.country });
      setCheckoutStage(from, 'asked_phone'); setExpecting(from, 'delivery_phone');
      await sendText({ to: from, body: t(lang, 'ask_phone') });
      return res.sendStatus(200);
    }

    // Delivery: Phone → create order → summary + actions (+ proof hint)
    if (textBody && getSession(from).expecting === 'delivery_phone') {
      const normalized = normalizePhone(textBody);
      if (!normalized) { await sendText({ to: from, body: t(lang, 'phone_invalid') }); return res.sendStatus(200); }
      updateCheckout(from, { contactPhone: normalized });

      const s = (getSession(from).checkout ?? {}) as any;
      let items: OrderItem[] = [];
      if (!s.productId) items = getSession(from).cart.items.map((it: any) => ({ ...it }));
      else {
        const price = isProMaxPackageId(s.productId) ? PROMAX_PRICE_TZS : (PRODUCTS.find((p) => p.id === s.productId)?.priceTZS ?? 0);
        const title = isProMaxPackageId(s.productId) ? `${productTitle('product_promax', lang)} — ${promaxPackageTitle(s.productId, lang)}` : productTitle(s.productId, lang);
        items.push({ productId: s.productId, title, qty: 1, priceTZS: price });
      }
      const fee = Math.max(0, Math.floor((s as any).deliveryFeeTZS || 0));
      if (fee > 0) items.push({ productId: 'delivery_fee', title: lang === 'sw' ? 'Nauli ya Usafiri' : 'Delivery Fee', qty: 1, priceTZS: fee });

      const order = createOrder({ items, lang, customerPhone: from, contactPhone: s.contactPhone, fulfillment: 'delivery', customerName: s.customerName, addressStreet: s.addressStreet, addressCity: s.addressCity, addressCountry: s.addressCountry });
      setLastOrderId(from, order.orderId); clearCart(from);

      const isMulti = order.items.length > 1;
      await sendText({
        to: from,
        body:
          `*${t(lang, 'order_created_title')}*\n\n` +
          (isMulti
            ? t(lang, 'order_created_body_total', { total: plainTZS(order.totalTZS), customerName: order.customerName || '', street: order.addressStreet || '', city: order.addressCity || '', country: order.addressCountry || '' })
            : t(lang, 'order_created_body_single', { title: order.title, total: plainTZS(order.totalTZS), customerName: order.customerName || '', street: order.addressStreet || '', city: order.addressCity || '', country: order.addressCountry || '' }))
      });
      await nap();

      await sendInteractiveButtons({
        to: from,
        body: clampBody(t(lang, 'order_next_actions')),
        buttons: [
          { id: 'pay_now',     title: clampButton(t(lang, 'btn_pay_now')) },
          { id: 'edit_address',title: clampButton(t(lang, 'btn_edit_address')) },
          { id: 'back_menu',   title: clampButton(t(lang, 'btn_back_menu')) },
        ],
      });
      await nap();

      resetCheckout(from);
      await sendText({ to: from, body: lang === 'sw'
        ? 'Thibitisha malipo yako: Tuma *majina matatu kamili ya mlipaji*, *kiasi*, na *muda* ulipolipa, au tuma *screenshot*.'
        : 'Confirm payment: Send the *payer’s three full names*, *amount*, and *time*, or send a *screenshot*.' });
      return res.sendStatus(200);
    }

    // Edit address after order created
    if (textBody && getSession(from).expecting === 'edit_address') {
      const oid = getSession(from).lastCreatedOrderId;
      if (!oid) { await sendText({ to: from, body: t(lang, 'status_not_found') }); setExpecting(from, 'none'); return res.sendStatus(200); }

      const parsed = parseAddress(textBody);
      if (!parsed) { await sendText({ to: from, body: t(lang, 'address_invalid') }); return res.sendStatus(200); }

      const updated = updateOrderAddress(oid, parsed.street, parsed.city, parsed.country);
      if (!updated) { await sendText({ to: from, body: t(lang, 'status_not_found') }); setExpecting(from, 'none'); return res.sendStatus(200); }

      await sendText({
        to: from,
        body:
          t(lang, 'address_updated', { street: updated.addressStreet || '', city: updated.addressCity || '', country: updated.addressCountry || '' }) +
          `\n\n*${t(lang, 'order_created_title')}*\n` +
          `*Order:* ${updated.orderId}\n*Title:* ${updated.title}\n*Name:* ${updated.customerName || ''}\n*Address:* ${updated.addressStreet || ''} ${updated.addressCity || ''} ${updated.addressCountry || ''}\n*Total:* ${plainTZS(updated.totalTZS)}`
      });
      await nap();

      await sendInteractiveButtons({
        to: from,
        body: clampBody(t(lang, 'order_next_actions')),
        buttons: [
          { id: 'pay_now',     title: clampButton(t(lang, 'btn_pay_now')) },
          { id: 'edit_address',title: clampButton(t(lang, 'btn_edit_address')) },
          { id: 'back_menu',   title: clampButton(t(lang, 'btn_back_menu')) },
        ],
      });

      setExpecting(from, 'none'); return res.sendStatus(200);
    }

    // Pay now (send manual proof)
    if (buttonReplyId === 'pay_now') {
      const oid = getSession(from).lastCreatedOrderId || '—';
      setExpecting(from, 'txn_message');
      await sendText({ to: from, body: t(lang, 'prompt_txn_message', { orderId: oid }) });
      return res.sendStatus(200);
    }

    // Transaction message or image
    if (getSession(from).expecting === 'txn_message' && (textBody || media)) {
      const oid = getSession(from).lastCreatedOrderId;
      if (!oid) { await sendText({ to: from, body: t(lang, 'status_not_found') }); setExpecting(from, 'none'); return res.sendStatus(200); }

      if (textBody) { const updated = attachTxnMessage(oid, textBody); await sendText({ to: from, body: t(lang, 'txn_ok_text', { orderId: updated?.orderId ?? oid }) }); }
      else if (image) { const updated = attachTxnImage(oid, image.id, image.caption || ''); await sendText({ to: from, body: t(lang, 'txn_ok_image', { orderId: updated?.orderId ?? oid }) }); }
      else if (document) { const updated = attachTxnImage(oid, document.id, document.caption || ''); await sendText({ to: from, body: t(lang, 'txn_ok_image', { orderId: updated?.orderId ?? oid }) }); }

      setExpecting(from, 'none'); return res.sendStatus(200);
    }

    // Default
    await sendMainMenu(from, lang);
    return res.sendStatus(200);
  } catch (err) {
    logger.error({ err }, 'Webhook processing error');
    return res.sendStatus(200);
  }
});

/* ----------------------------- Cart summary ------------------------------ */
async function showCartSummary(to: string, lang: 'en' | 'sw') {
  const items = getSession(to).cart.items;
  if (!items.length) { await sendText({ to, body: t(lang, 'cart_empty') }); await sendMainMenu(to, lang); return; }

  const lines = items.map((it: any) => `• ${it.title} x${it.qty} — ${plainTZS(it.priceTZS * it.qty)}`).join('\n');
  await sendText({ to, body: `${t(lang, 'cart_summary_header')}\n${lines}\n\n` + t(lang, 'cart_summary_total', { total: plainTZS(cartTotal(to)) }) });
  await nap();
  await sendInteractiveButtons({
    to,
    body: clampBody(t(lang, 'cart_actions')),
    buttons: [
      { id: 'cart_checkout', title: clampButton(t(lang, 'btn_cart_checkout')) },
      { id: 'cart_clear',    title: clampButton(t(lang, 'btn_cart_clear')) },
      { id: 'back_menu',     title: clampButton(t(lang, 'btn_cart_back')) },
    ],
  });
}

export default webhook;
