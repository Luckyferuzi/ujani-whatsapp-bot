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
} from '../whatsapp.js';
import { feeForDarDistance } from '../delivery.js';
import {
  buildMainMenu,
  getProductBySkuAsync,
  resolveProductForSkuAsync,
} from '../menu.js';

import { getSession, saveSession, resetSession } from '../session.js';
// backend/src/routes/webhook.ts
import {
  upsertCustomerByWa,
  getOrCreateConversation,
  insertInboundMessage,
  insertOutboundMessage,
  updateConversationLastUserMessageAt,
  createOrderWithPayment,
  findOrderById,
  findLatestOrderByCustomerName,
  updateOrderPaymentMode,
  getOrdersForCustomer,
} from "../db/queries.js";


import { emit } from '../sockets.js';
import db from '../db/knex.js';

export const webhook = Router();



/**
 * Send a text message from the bot and ALSO log it as an outbound message
 * so that it appears in the Inbox thread.
 */
async function sendBotText(user: string, body: string) {
  // 1) Send to WhatsApp
  await sendText(user, body);

  // 2) Persist and emit for the inbox
  try {
    const customerId = await upsertCustomerByWa(user, undefined, user);
    const conversationId = await getOrCreateConversation(customerId);

    const inserted = await insertOutboundMessage(conversationId, "text", body);

    emit("message.created", {
      conversation_id: conversationId,
      message: inserted,
    });
    emit("conversation.updated", {});
  } catch (err) {
    console.error("[webhook] failed to log bot message:", err);
  }
}


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
  if (tail) desc = desc ? `${tail} • ${desc}` : tail; // overflow to description
  if (title.length > MAX_LIST_TITLE) title = title.slice(0, MAX_LIST_TITLE);
  if (desc.length > MAX_LIST_DESC) desc = desc.slice(0, MAX_LIST_DESC);
  return { title, description: desc || undefined };
}

async function sendListMessageSafe(p: SafeListPayload) {
  const rawSections = p.sections || [];

  const sections = rawSections
    .map((sec) => ({
      title: (sec.title || "").slice(0, MAX_SECTION_TITLE) || "—",
      rows: (sec.rows || []).slice(0, MAX_LIST_ROWS).map((r) => {
        const { title, description } = clampRow(r.title, r.description);
        return { id: r.id, title, description };
      }),
    }))
    .filter((sec) => (sec.rows?.length ?? 0) > 0);

  // If no rows, just behave as a normal bot text message (and log it)
  if (!sections.length) {
    return sendBotText(p.to, p.body || " ");
  }

  // 1) Send the actual interactive list to WhatsApp
  await sendListMessage({
    to: p.to,
    header: p.header,
    body: p.body || " ",
    footer: p.footer,
    buttonText: (p.buttonText || "Open").slice(0, MAX_BUTTON_TITLE),
    sections,
  } as any);

  // 2) Build a JSON payload that the web UI can render as buttons
  const summaryPayload = {
    kind: "menu",
    subtype: "list",
    header: p.header || null,
    body: p.body || null,
    sections: sections.map((sec) => ({
      title: sec.title || null,
      rows: (sec.rows || []).map((r) => r.title || ""),
    })),
  };

  const summaryBody = `[MENU]${JSON.stringify(summaryPayload)}`;

  // 3) Log it as an outbound message for the admin inbox
  try {
    const customerId = await upsertCustomerByWa(p.to, undefined, p.to);
    const conversationId = await getOrCreateConversation(customerId);
    const inserted = await insertOutboundMessage(
      conversationId,
      "text",
      summaryBody
    );

    emit("message.created", {
      conversation_id: conversationId,
      message: inserted,
    });
    emit("conversation.updated", {});
  } catch (err) {
    console.error("[webhook] failed to log list menu:", err);
  }
}


type Button = { id: string; title: string };

async function sendButtonsMessageSafe(
  to: string,
  body: string,
  buttons: Button[]
) {
  const trimmed = (buttons || []).slice(0, 3).map((b) => ({
    id: b.id,
    title: (b.title || "").slice(0, MAX_BUTTON_TITLE) || "•",
  }));

  // If there are no buttons, fall back to a normal bot text message (and log it)
  if (!trimmed.length) {
    return sendBotText(to, body);
  }

  // 1) Send the actual buttons message to WhatsApp
  await sendButtonsMessage(to, (body || " ").slice(0, 1000), trimmed);

  // 2) Build a JSON payload for the admin UI
  const summaryPayload = {
    kind: "menu",
    subtype: "buttons",
    header: null,
    body: body || null,
    buttons: trimmed.map((b) => b.title),
  };

  const summaryBody = `[MENU]${JSON.stringify(summaryPayload)}`;

  // 3) Log it as an outbound message for the admin inbox
  try {
    const customerId = await upsertCustomerByWa(to, undefined, to);
    const conversationId = await getOrCreateConversation(customerId);
    const inserted = await insertOutboundMessage(
      conversationId,
      "text",
      summaryBody
    );

    emit("message.created", {
      conversation_id: conversationId,
      message: inserted,
    });
    emit("conversation.updated", {});
  } catch (err) {
    console.error("[webhook] failed to log buttons menu:", err);
  }
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

function otherLang(l: Lang): Lang { return l === 'sw' ? 'en' : 'sw'; }
function normId(id?: string) { return (id ?? '').toString().trim().toUpperCase(); }

/** Payment choices from your envs first, then PAYMENT_n_* as fallback */
function getPaymentOptions() {
  const opts: Array<{ id: string; label: string; value: string }> = [];

  // 1) MIXXBYYAS LIPANAMB (Lipa Namba Till)
  const mixxTill = process.env.LIPA_NAMBA_TILL;
  const mixxName = process.env.LIPA_NAMBA_NAME;
  if (mixxTill) {
    opts.push({
      id: 'PAY_MIXX',
      label: 'MIXXBYYAS LIPANAMB',
      value: mixxName ? `${mixxTill} • ${mixxName}` : mixxTill,
    });
  }

  // 2) VODALIPANMBA (Vodacom Lipa Namba Till)
  const vodaTill = process.env.VODA_LNM_TILL;
  const vodaName = process.env.VODA_LNM_NAME;
  if (vodaTill) {
    opts.push({
      id: 'PAY_VODA_LNM',
      label: 'VODALIPANMBA',
      value: vodaName ? `${vodaTill} • ${vodaName}` : vodaTill,
    });
  }

  // 3) Vodacom P2P
  const vodaMsisdn = process.env.VODA_P2P_MSISDN;
  const vodaP2PName = process.env.VODA_P2P_NAME;
  if (vodaMsisdn) {
    opts.push({
      id: 'PAY_VODA_P2P',
      label: 'Voda P2P',
      value: vodaP2PName ? `${vodaMsisdn} • ${vodaP2PName}` : vodaMsisdn,
    });
  }

  // 4) Generic fallback
  for (let i = 1; i <= 5; i++) {
    const label = (process.env as any)[`PAYMENT_${i}_LABEL`];
    const value = (process.env as any)[`PAYMENT_${i}_NUMBER`];
    if (label && value) opts.push({ id: `PAY_${i}`, label: String(label), value: String(value) });
  }

  return opts;
}

async function showPaymentOptions(user: string, lang: Lang, total: number) {
  const opts = getPaymentOptions();

  if (!opts.length) {
    await sendText(user, t(lang, 'payment.none'));
    return;
  }

  // Human-readable list first
  const lines: string[] = [
    t(lang, 'flow.payment_choose'),
    ...opts.map(o => `• *${o.label}*: ${o.value}`),
  ];
  await sendText(user, lines.join('\n'));

  // Selectable list
  await sendListMessageSafe({
    to: user,
    header: t(lang, 'checkout.summary_total', { total: fmtTZS(total) }),
    body: t(lang, 'flow.payment_choose'),
    footer: '',
    buttonText: t(lang, 'generic.choose'),
    sections: [{
      title: t(lang, 'flow.payment_choose'),
      rows: opts.map(o => ({ id: o.id, title: o.label, description: o.value })),
    }],
  });
}

function paymentChoiceById(id: string) {
  const N = (id || '').toUpperCase().trim();

  if (N === 'PAY_MIXX') {
    const till = process.env.LIPA_NAMBA_TILL;
    const name = process.env.LIPA_NAMBA_NAME;
    if (till) return { label: 'MIXXBYYAS LIPANAMB', value: name ? `${till} • ${name}` : till };
  }
  if (N === 'PAY_VODA_LNM') {
    const till = process.env.VODA_LNM_TILL;
    const name = process.env.VODA_LNM_NAME;
    if (till) return { label: 'VODALIPANMBA', value: name ? `${till} • ${name}` : till };
  }
  if (N === 'PAY_VODA_P2P') {
    const msisdn = process.env.VODA_P2P_MSISDN;
    const name = process.env.VODA_P2P_NAME;
    if (msisdn) return { label: 'Voda P2P', value: name ? `${msisdn} • ${name}` : msisdn };
  }

  if (N.startsWith('PAY_')) {
    const n = Number(id.replace(/^PAY_/, ''));
    if (!Number.isNaN(n)) {
      const label = (process.env as any)[`PAYMENT_${n}_LABEL`];
      const value = (process.env as any)[`PAYMENT_${n}_NUMBER`];
      if (label && value) return { label, value };
    }
  }
  return null;
}

function getOrderStatusLabel(lang: Lang, rawStatus: string | null | undefined): string {
  const status = rawStatus || "pending";
  const key = `orders.status.${status}`;
  return t(lang, key);
}

type OrderSummaryForBot = {
  id: number;
  code: string;
  status: string;
  totalAmount: number;
  createdAt: string;
};

/**
 * Load recent orders for this WhatsApp user (by wa_id).
 * Uses the same customer table as the rest of the bot.
 */
async function getOrdersForWhatsappUser(
  user: string,
  limit = 10
): Promise<OrderSummaryForBot[]> {
  const customer = await db("customers").where({ wa_id: user }).first();
  if (!customer) return [];

  const rows = await getOrdersForCustomer(customer.id as number, limit);

  return rows.map((row: any) => ({
    id: row.id,
    code: row.order_code ?? `UJ-${row.id}`,
    status: row.status ?? "pending",
    totalAmount: Number(row.total_amount ?? 0),
    createdAt: (row.created_at as any)?.toISOString
      ? (row.created_at as Date).toISOString()
      : String(row.created_at ?? ""),
  }));
}


/* -------------------------------------------------------------------------- */
/*                              In-memory state                               */
/* -------------------------------------------------------------------------- */

export type CartItem = { sku: string; name: string; qty: number; unitPrice: number };

const USER_LANG = new Map<string, Lang>();
const CART = new Map<string, CartItem[]>();
const PENDING = new Map<string, CartItem | null>();
const PENDING_QTY = new Map<string, { sku: string; name: string; unitPrice: number }>();

// New granular flow (we keep Session.state minimal)
type FlowStep =
  | 'ASK_IF_DAR'       // buttons: inside/outside
  | 'ASK_IN_DAR_MODE'  // buttons: delivery/pickup
  | 'ASK_NAME_IN'
  | 'ASK_PHONE_IN'
  | 'ASK_GPS'
  | 'ASK_NAME_PICK'
  | 'ASK_PHONE_PICK'
  | 'ASK_NAME_OUT'
  | 'ASK_PHONE_OUT'
  | 'ASK_REGION_OUT'
  | 'TRACK_ASK_NAME';

const FLOW = new Map<string, FlowStep | null>();
const CONTACT = new Map<string, { name?: string; phone?: string; region?: string }>();

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

webhook.post("/webhook", async (req: Request, res: Response) => {
  try {
    console.log(
      "[webhook] POST /webhook body:",
      JSON.stringify(req.body, null, 2)
    );

    if (!verifySignature(req)) {
      console.warn("[webhook] verifySignature failed – returning 401");
      return res.sendStatus(401);
    }

    const entries = req.body?.entry ?? [];
    for (const entry of entries) {
      const changes = entry?.changes ?? [];
      for (const ch of changes) {
        const messages = ch?.value?.messages ?? [];
        for (const msg of messages) {
          const from = msg?.from as string;
          const mid = msg?.id as string | undefined;
          if (!from) continue;
          //if (mid) await markAsRead(mid).catch(() => {});

          const lang = getLang(from);
          const s = getSession(from);

          const type = msg?.type as string | undefined;
          const text: string | undefined = type === 'text' ? (msg.text?.body as string) : undefined;

          // Interactive reply id (and debug)
// Interactive reply id + label (what the user actually clicked)
let interactiveId: string | undefined;
let interactiveTitle: string | undefined;

if (type === "interactive") {
  const itype = msg.interactive?.type;
  console.log(
    "[webhook] interactive type:",
    itype,
    "payload:",
    JSON.stringify(msg.interactive)
  );

  if (itype === "list_reply") {
    interactiveId = msg.interactive?.list_reply?.id;
    interactiveTitle = msg.interactive?.list_reply?.title || undefined;
  }

  if (itype === "button_reply") {
    interactiveId = msg.interactive?.button_reply?.id;
    interactiveTitle = msg.interactive?.button_reply?.title || undefined;
  }
}

if (interactiveId) {
  console.log(
    "[webhook] interactive id:",
    interactiveId,
    "title:",
    interactiveTitle
  );
}


          // Location pin
          const hasLocation = type === 'location';
          const lat = hasLocation ? Number(msg.location?.latitude) : undefined;
          const lon = hasLocation ? Number(msg.location?.longitude) : undefined;

          // --- DB persistence + realtime for every inbound message ---
                  // --- DB persistence + realtime ---
// --- DB persistence + realtime for every inbound message ---
try {
  // 1) Ensure customer + conversation exist
  const customerId = await upsertCustomerByWa(from, undefined, from);
  const conversationId = await getOrCreateConversation(customerId);
// 2) Pick a body to store (text, user's choice label, location coords, or media)
let bodyForDb: string | null = text ?? null;

// Interactive replies: store the label the customer saw (e.g. "Kuhusu bidhaa")
if (!bodyForDb && interactiveId) {
  if (interactiveTitle && interactiveTitle.trim().length > 0) {
    bodyForDb = interactiveTitle.trim();
  } else {
    // Fallback for older / weird payloads
    bodyForDb = `[interactive:${interactiveId}]`;
  }
}

  // Location pin
  if (
    !bodyForDb &&
    hasLocation &&
    typeof lat === "number" &&
    typeof lon === "number"
  ) {
    bodyForDb = `LOCATION ${lat},${lon}`;
  }

  // Media messages: store a marker MEDIA:<kind>:<mediaId>
  if (!bodyForDb) {
    if (type === "image" && msg.image?.id) {
      bodyForDb = `MEDIA:image:${msg.image.id}`;
    } else if (type === "video" && msg.video?.id) {
      bodyForDb = `MEDIA:video:${msg.video.id}`;
    } else if (type === "audio" && msg.audio?.id) {
      bodyForDb = `MEDIA:audio:${msg.audio.id}`;
    } else if (type === "document" && msg.document?.id) {
      bodyForDb = `MEDIA:document:${msg.document.id}`;
    }
  }

  // 3) Insert inbound message row
  const inserted = await insertInboundMessage(
    conversationId,
    mid ?? null,
    type ?? "text",
    bodyForDb
  );


  // 4) Update conversation activity + emit realtime
  await updateConversationLastUserMessageAt(conversationId);


  emit("message.created", { conversation_id: conversationId, message: inserted });
  emit("conversation.updated", {});
} catch (err) {
  console.error("inbound persist error:", err);
}


            // If this conversation is in agent mode, do not let the bot answer.
          // We still saved the message above and emitted events for the admin UI.
          const agentAllowed = await isAgentAllowed(from);
          if (agentAllowed) {
            console.log("[webhook] agent mode for", from, "— skipping bot reply");
          continue;
          }

          // --- end DB persistence + realtime ---

          // --- end DB persistence + realtime ---
          
          // 1) handle interactive first
          // 1) handle interactive first
          // 1) handle interactive first
          if (interactiveId) {
            await onInteractive(from, interactiveId, lang);
            continue;
          }

          // 2) Extract the raw text (for list selections etc.)
          const rawText = (text || "").trim();

          // If the text looks like an order line with "(#<id>)", show order details.
          // This is a fallback so that even if the interactive payload is weird,
          // selecting an order from "Angalia oda zako" still works.
          if (rawText) {
            const match = rawText.match(/#(\d+)\)/);
            if (match) {
              const orderId = Number(match[1]);
              if (Number.isFinite(orderId)) {
                await showOrderDetailsAndActions(from, orderId, lang);
                continue;
              }
            }
          }

          // 3) if we are waiting for a quantity for a product, handle that first
          if (rawText && PENDING_QTY.has(from)) {

            const pending = PENDING_QTY.get(from)!;
            const qty = Number.parseInt(rawText, 10);

            if (!Number.isFinite(qty) || qty <= 0) {
              await sendText(from, t(lang, "cart.ask_quantity_invalid"));
              continue;
            }

            const item: CartItem = {
              sku: pending.sku,
              name: pending.name,
              qty,
              unitPrice: pending.unitPrice,
            };

            addToCart(from, item);
            PENDING_QTY.delete(from);

            await sendText(
              from,
              t(lang, "cart.added_with_qty", {
                title: item.name,
                qty: String(item.qty),
              })
            );

            // Show updated cart summary (already formats "title ×qty — price")
            await showCart(from, lang);

            continue;
          }

          // 3) start menu on greetings if idle (existing logic)
          const activeFlow = FLOW.get(from);
          const txt = rawText.toLowerCase();


// 1) start menu on greetings if idle
if ((!s || s.state === "IDLE") && !activeFlow) {
  if (
    !text ||
    ["hi", "hello", "mambo", "start", "anza", "menu", "menyu"].includes(txt)
  ) {
    await showMainMenu(from, lang);
    continue;
  }
}


          // 3) route
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
    res.sendStatus(200);
  }
});

/* -------------------------------------------------------------------------- */
/*                                   Screens                                  */
/* -------------------------------------------------------------------------- */

async function showMainMenu(user: string, lang: Lang) {
  // buildMainMenu is now async and uses DB-backed products (with fallback)
  const model = await buildMainMenu((key: string) => t(lang, key));

  // Show OTHER language label on the toggle row
  const sections = model.sections.map((sec) => ({
    title: sec.title,
    rows: sec.rows.map((r) =>
      r.id === "ACTION_CHANGE_LANGUAGE"
        ? { ...r, title: t(otherLang(lang), "menu.change_language") }
        : r
    ),
  }));

  await sendListMessageSafe({
    to: user,
    header: model.header,
    body: t(lang, "menu.header"),
    footer: model.footer,
    buttonText: t(lang, "generic.open"),
    sections,
  });
}

async function showCart(user: string, lang: Lang) {
  const items = getCart(user);
  if (!items.length) return sendBotText(user, t(lang, "cart.empty"));

  const lines = [t(lang, "cart.summary_header")];
  let total = 0;
  for (const it of items) {
    total += it.unitPrice * it.qty;
    lines.push(
      t(lang, "cart.summary_line", {
        title: it.name,
        qty: it.qty,
        price: fmtTZS(it.unitPrice * it.qty),
      })
    );
  }
  lines.push("");
  lines.push(t(lang, "cart.summary_total", { total: fmtTZS(total) }));
  await sendBotText(user, lines.join("\n"));

  await sendButtonsMessageSafe(user, t(lang, "cart.choose_action"), [
    { id: "ACTION_CHECKOUT", title: t(lang, "menu.checkout") },
    { id: "ACTION_BACK", title: t(lang, "menu.back_to_menu") },
  ]);
}

async function showProductActions(user: string, sku: string, lang: Lang) {
  // Resolve via DB-backed products first, then fallback to static
  const prod = await resolveProductForSkuAsync(sku);
  if (!prod) return;

  // If we know stock and it's empty -> tell customer it's unavailable
  if (typeof prod.stockQty === "number" && prod.stockQty <= 0) {
    await sendText(user, t(lang, "product.unavailable", { name: prod.name }));
    return;
  }

  await sendText(user, `*${prod.name}* — ${fmtTZS(prod.price)} TZS`);
  const hasVariants = !!(prod.children && prod.children.length);

  const buttons: Button[] = [
    ...(hasVariants
      ? [{ id: `VARIANTS_${prod.sku}`, title: t(lang, "menu.choose_variant") }]
      : []),
    { id: `ADD_${prod.sku}`, title: t(lang, "menu.add_to_cart") },
    { id: `BUY_${prod.sku}`, title: t(lang, "menu.buy_now") },
    { id: `DETAILS_${prod.sku}`, title: t(lang, "menu.more_details") },
  ];
  await sendButtonsMessageSafe(user, t(lang, "menu.actions_section"), buttons);
}

async function showOrderDetailsAndActions(
  user: string,
  orderId: number,
  lang: Lang
) {
  const found = await findOrderById(orderId);
  if (!found || !found.order) {
    await sendBotText(user, t(lang, "orders.none"));
    return;
  }

  const { order } = found;
  const code = (order.order_code as string | null) ?? `UJ-${order.id}`;
  const statusText = getOrderStatusLabel(
    lang,
    order.status as string | null
  );

  // Load products in this order
  const items = await db("order_items")
    .where({ order_id: order.id })
    .select("name", "qty");

  const lines: string[] = [];
  lines.push(t(lang, "orders.detail_header", { code }));

  if (items.length > 0) {
    lines.push(t(lang, "orders.detail_items_header"));
    for (const it of items) {
      lines.push(
        t(lang, "orders.detail_line", {
          title: String(it.name ?? ""),
          qty: String(it.qty ?? 0),
        })
      );
    }
  } else {
    lines.push(t(lang, "orders.detail_no_items"));
  }

  const createdRaw = order.created_at as any;
  const createdAt =
    createdRaw instanceof Date
      ? createdRaw.toISOString().slice(0, 10)
      : String(createdRaw ?? "").slice(0, 10);

  lines.push(
    "",
    t(lang, "orders.detail_status", { status: statusText }),
    t(lang, "orders.detail_created_at", { date: createdAt })
  );

  // 🔹 Send & log the details so admin sees them
  await sendBotText(user, lines.join("\n"));

  // 🔹 Build buttons based on status
  const buttons: Button[] = [];

  // Pending → allow modify + cancel
  if ((order.status as string | null) === "pending") {
    buttons.push(
      {
        id: `ORDER_CANCEL_${order.id}`,
        title: lang === "sw" ? "Ghairi oda" : "Cancel order",
      },
      {
        id: `ORDER_MODIFY_${order.id}`,
        title: lang === "sw" ? "Badili oda" : "Modify order",
      }
    );
  }

  // Always allow back to menu
  buttons.push({
    id: "ACTION_BACK",
    title: t(lang, "menu.back_to_menu"),
  });

  await sendButtonsMessageSafe(
    user,
    t(lang, "cart.choose_action"),
    buttons
  );
}


async function showVariants(user: string, parentSku: string, lang: Lang) {
  const parent = await getProductBySkuAsync(parentSku);
  if (!parent?.children?.length) return;

  await sendListMessageSafe({
    to: user,
    header: parent.name,
    body: t(lang, "menu.choose_variant"),
    footer: "",
    buttonText: t(lang, "generic.choose"),
    sections: [
      {
        title: t(lang, "menu.choose_variant"),
        rows: parent.children!.map((v) => ({
          id: `PRODUCT_${v.sku}`,
          title: `${v.name} — ${fmtTZS(v.price)} TZS`,
          description:
            lang === "sw" ? "Gusa kuona vitendo" : "Tap to view actions",
        })),
      },
    ],
  });
}


/* -------------------------------------------------------------------------- */
/*                            Interactive handling                            */
/* -------------------------------------------------------------------------- */

const OUTSIDE_DAR_FEE = 10_000;
const PICKUP_INFO_SW = 'Tupo Keko Modern Furniture, mkabala na Omax Bar. Wasiliana nasi kwa maelezo zaidi.';
const PICKUP_INFO_EN = 'We are at Keko Modern Furniture, opposite Omax Bar. Contact us for more details.';

async function onInteractive(user: string, id: string, lang: Lang) {
  const N = normId(id);
    // --- Agent handover actions (talk to agent / back to bot) ---
  if (id === 'ACTION_BACK') return showMainMenu(user, lang);

  if (id === 'ACTION_TALK_TO_AGENT') {
    const customerId = await upsertCustomerByWa(user, undefined, user);
    const conversationId = await getOrCreateConversation(customerId);

    await db('conversations')
      .where({ id: conversationId })
      .update({ agent_allowed: true });

    emit('conversation.updated', { id: conversationId, agent_allowed: true });

    await sendText(user, t(lang, 'agent.reply'));

    await sendButtonsMessage(
      user,
      lang === 'sw'
        ? 'Ukimaliza kuongea na mhudumu, unaweza kurudi kwa bot.'
        : 'When you are done with the agent, you can go back to the bot.',
      [
        {
          id: 'ACTION_RETURN_TO_BOT',
          title: lang === 'sw' ? 'Rudi kwa bot' : 'Return to bot',
        },
      ]
    );

    return;
  }

  if (id === 'ACTION_RETURN_TO_BOT') {
    const customerId = await upsertCustomerByWa(user, undefined, user);
    const conversationId = await getOrCreateConversation(customerId);

    await db('conversations')
      .where({ id: conversationId })
      .update({ agent_allowed: false });

    emit('conversation.updated', { id: conversationId, agent_allowed: false });

    return showMainMenu(user, lang);
  }

  /* --------- Location / service selection FIRST (robust to truncation) -------- */
  if (N.startsWith('DAR_INSIDE')) {
    setFlow(user, 'ASK_IN_DAR_MODE');
    await sendButtonsMessageSafe(user, t(lang, 'flow.choose_in_dar_mode'), [
      { id: 'IN_DAR_DELIVERY', title: t(lang, 'in_dar.delivery') },
      { id: 'IN_DAR_PICKUP',   title: t(lang, 'in_dar.pickup') },
    ]);
    return;
  }
  if (N.startsWith('DAR_OUTSIDE')) {
    setFlow(user, 'ASK_NAME_OUT');
    CONTACT.set(user, {});
    await sendText(user, t(lang, 'flow.ask_name'));
    return;
  }
  if (N.startsWith('IN_DAR_DELIVERY')) {
    setFlow(user, 'ASK_NAME_IN');
    CONTACT.set(user, {});
    await sendText(user, t(lang, 'flow.ask_name'));
    return;
  }
  if (N.startsWith('IN_DAR_PICKUP')) {
  // ✅ New behavior: ONLY send the pickup message; no name/phone/muhtasari
  setFlow(user, null);
  await sendText(user, (lang === 'sw'
    ? 'Tupo Keko Modern Furniture, mkabala na Omax Bar. Wasiliana nasi kwa maelezo zaidi.'
    : 'We are at Keko Modern Furniture, opposite Omax Bar. Contact us for more details.'
  ));
  return;
}

  /* ------------------------ Payment mode (Dar customers) ---------------------- */
  if (id === "PAYMODE_PHONE") {
    const s = getSession(user);
    const total = s.price ?? 0;
    const lastOrderId = (s as any).lastOrderId as number | undefined;

    // Try to mark the order as "prepay" in DB
    if (lastOrderId) {
      updateOrderPaymentMode(lastOrderId, "prepay").catch((err) => {
        console.error("[orders] failed to set payment_mode=prepay", err);
      });
    }

    // Show the usual payment options + "Nimemaliza kulipa"
    await sendButtonsMessageSafe(user, t(lang, "payment.done_cta"), [
      { id: "ACTION_PAYMENT_DONE", title: t(lang, "payment.done_button") },
    ]);

    await showPaymentOptions(user, lang, total);
    return;
  }

  if (id === "PAYMODE_COD") {
    const s = getSession(user);
    const lastOrderId = (s as any).lastOrderId as number | undefined;

    // Mark this order as COD
    if (lastOrderId) {
      updateOrderPaymentMode(lastOrderId, "cod").catch((err) => {
        console.error("[orders] failed to set payment_mode=cod", err);
      });
    }

    await sendText(user, t(lang, "payment.cod_confirm"));
    // No payment options shown now; order will be paid on delivery.
    return;
  }

  /* -------------------------- Payment choice selected ------------------------- */
  if (N.startsWith('PAY_')) {
    const choice = paymentChoiceById(id);
    if (choice) {
      await sendText(user, t(lang, 'payment.selected', { label: choice.label, value: choice.value }));
      const s = getSession(user);
      s.state = 'WAIT_PROOF';
      saveSession(user, s);
      await sendText(user, t(lang, 'proof.ask'));
      return;
    }
    await sendText(user, t(lang, 'payment.none'));
    return;
  }

  /* ------------------------------- Cart actions ------------------------------- */
  if (id === 'ACTION_VIEW_CART') return showCart(user, lang);

  if (id === 'ACTION_CHECKOUT') {
    setFlow(user, 'ASK_IF_DAR');
    CONTACT.set(user, {});
    await sendButtonsMessageSafe(user, t(lang, 'flow.choose_dar'), [
      { id: 'DAR_INSIDE',  title: t(lang, 'flow.option_inside_dar') },
      { id: 'DAR_OUTSIDE', title: t(lang, 'flow.option_outside_dar') },
    ]);
    return;
  }

    if (id === 'ACTION_CHANGE_LANGUAGE') {
    const next = otherLang(getLang(user));
    setLang(user, next);
    return showMainMenu(user, next);
  }

  if (id === 'ACTION_BACK') return showMainMenu(user, lang);

  // --- NEW: customer asks to talk to an agent ---
if (id === 'ACTION_TALK_TO_AGENT') {
  const customerId = await upsertCustomerByWa(user, undefined, user);
  const conversationId = await getOrCreateConversation(customerId);

  await db('conversations')
    .where({ id: conversationId })
    .update({ agent_allowed: true });

  emit('conversation.updated', { id: conversationId, agent_allowed: true });

  await sendText(user, t(lang, 'agent.reply'));
}

  // --- NEW: customer goes back from agent to bot ---
  if (id === 'ACTION_RETURN_TO_BOT') {
    const customerId = await upsertCustomerByWa(user, undefined, user);
    const conversationId = await getOrCreateConversation(customerId);

    // Turn agent off so the bot talks again
    await db('conversations')
      .where({ id: conversationId })
      .update({ agent_allowed: false });

    emit('conversation.updated', { id: conversationId, agent_allowed: false });

    await sendText(
      user,
      'Umerudi kwa bot 🤖. Tutaendelea na menyu ya kawaida ya oda.'
    );

    // Show the normal main menu again
    return showMainMenu(user, lang);
  }

  if (id === "ACTION_TRACK_BY_NAME") {
    // Show a list of this customer's orders ("Kufuatilia oda")
    const orders = await getOrdersForWhatsappUser(user, 20);

    if (!orders.length) {
      await sendText(user, t(lang, "orders.none"));
      return;
    }

    const rows = orders.map((o) => {
      const statusText = getOrderStatusLabel(lang, o.status);
      // Very simple date: YYYY-MM-DD
      const date = o.createdAt ? o.createdAt.slice(0, 10) : "";
      const code = o.code || `UJ-${o.id}`;
      return {
        // This is what will be clicked in the next step:
        id: `ORDER_DETAIL_${o.id}`,
        // Show both code + numeric id so customer "clicks the ID":
        title: `${code} (#${o.id})`,
        description: `${statusText} • ${date}`,
      };
    });

    await sendListMessageSafe({
      to: user,
      header: t(lang, "orders.list_header"),
      body: t(lang, "orders.list_body"),
      footer: "",
      buttonText: t(lang, "generic.choose"),
      sections: [
        {
          title: t(lang, "orders.list_section"),
          rows,
        },
      ],
    });

    return;
  }


  if (id === "ACTION_FAQ") {
  await sendText(user, t(lang, "faq.intro"));
  await sendText(user, t(lang, "faq.list"));
  return showMainMenu(user, lang);;
}


  /* ------------------------------ Product flows ------------------------------ */
/* ------------------------------ Product flows ------------------------------ */
  if (id.startsWith("PRODUCT_")) {
    const sku = id.replace("PRODUCT_", "");
    if (sku === "PROMAX") return showVariants(user, "PROMAX", lang);
    return showProductActions(user, sku, lang);
  }

  if (id.startsWith("VARIANTS_")) {
    const parentSku = id.replace("VARIANTS_", "");
    return showVariants(user, parentSku, lang);
  }

  // Second-level product details (ABOUT / USAGE / WARN)
  if (id.startsWith("DETAILS2_")) {
    // ID pattern: DETAILS2_<SKU>_<SECTION>
    const parts = id.split("_"); // ["DETAILS2", "<SKU>", "<SECTION>"]
    const sku = parts[1];
    const section = parts[2] as "ABOUT" | "USAGE" | "WARN";

    if (!sku || !section) return;

    // Use async resolver (DB-backed + fallback) – no getProductBySku here
    const prod = await resolveProductForSkuAsync(sku);
    if (!prod) return;

    const label =
      section === "ABOUT"
        ? lang === "sw"
          ? "Kuhusu bidhaa"
          : "About product"
        : section === "USAGE"
        ? lang === "sw"
          ? "Jinsi ya kutumia"
          : "How to use"
        : lang === "sw"
        ? "Tahadhari muhimu"
        : "Important warnings";

    const txt = detailsSectionForSku(lang, sku, section);
    await sendText(user, `ℹ️ *${prod.name}* — ${label}\n\n${txt}`);

    // After showing the chosen details, show normal product actions again
    return showProductActions(user, sku, lang);
  }

  // Add / Buy / Details (first click on "Maelezo zaidi")
  if (
    id.startsWith("ADD_") ||
    id.startsWith("BUY_") ||
    id.startsWith("DETAILS_")
  ) {
    const mode = id.split("_")[0]; // ADD | BUY | DETAILS
    const sku = id.substring(mode.length + 1);

    // Async product resolve (DB-backed + static fallback)
    const prod = await resolveProductForSkuAsync(sku);
    if (!prod) return;

    // First-level "Maelezo zaidi" -> show 3 options
    if (mode === "DETAILS") {
      const baseLabel =
        lang === "sw"
          ? "Chagua maelezo unayotaka:"
          : "Choose which information you want:";

      await sendButtonsMessageSafe(user, `${baseLabel} *${prod.name}*`, [
        {
          id: `DETAILS2_${sku}_ABOUT`,
          title: lang === "sw" ? "Kuhusu bidhaa" : "About product",
        },
        {
          id: `DETAILS2_${sku}_USAGE`,
          title: lang === "sw" ? "Jinsi ya kutumia" : "How to use",
        },
        {
          id: `DETAILS2_${sku}_WARN`,
          title: lang === "sw" ? "Tahadhari muhimu" : "Important warnings",
        },
      ]);
      return;
    }

  if (id.startsWith("ORDER_DETAIL_")) {
    const rawId = id.substring("ORDER_DETAIL_".length);
    const orderId = Number(rawId);

    if (!Number.isFinite(orderId)) {
      await sendText(user, t(lang, "orders.none"));
      return;
    }

    const found = await findOrderById(orderId);
    if (!found || !found.order) {
      await sendText(user, t(lang, "orders.none"));
      return;
    }

    const { order, payment } = found;
    const code = (order.order_code as string | null) ?? `UJ-${order.id}`;
    const statusRaw = (order.status as string | null) ?? "pending";
    const statusText = getOrderStatusLabel(lang, statusRaw);

    // Load products in this order
    const items = await db("order_items")
      .where({ order_id: order.id })
      .select("name", "qty");

    const lines: string[] = [];
    lines.push(t(lang, "orders.detail_header", { code }));

    if (items.length > 0) {
      lines.push(t(lang, "orders.detail_items_header"));
      for (const it of items) {
        lines.push(
          t(lang, "orders.detail_line", {
            title: String(it.name ?? ""),
            qty: String(it.qty ?? 0),
          })
        );
      }
    } else {
      lines.push(t(lang, "orders.detail_no_items"));
    }

    // ===== Payment amounts: total / paid / remaining (for installments too) =====
    const totalTzs = Number((order as any).total_tzs ?? 0);
    const paidTzs = Number((payment as any)?.amount_tzs ?? 0);
    const remainingTzs = Math.max(totalTzs - paidTzs, 0);

    const totalStr = totalTzs ? totalTzs.toLocaleString("sw-TZ") : "0";
    const paidStr = paidTzs ? paidTzs.toLocaleString("sw-TZ") : "0";
    const remainingStr = remainingTzs
      ? remainingTzs.toLocaleString("sw-TZ")
      : "0";

    lines.push(
      "",
      t(lang, "track.line_payment_amounts", {
        total: totalStr,
        paid: paidStr,
        remaining: remainingStr,
      })
    );

    const createdRaw = order.created_at as any;
    const createdAt =
      createdRaw instanceof Date
        ? createdRaw.toISOString().slice(0, 10)
        : String(createdRaw ?? "").slice(0, 10);

    lines.push(
      "",
      t(lang, "orders.detail_status", { status: statusText }),
      t(lang, "orders.detail_created_at", { date: createdAt })
    );

    // 1) Send + log order details so admin sees them
    await sendText(user, lines.join("\n"));

    // 2) Decide which actions to show based on status
    const buttons: { id: string; title: string }[] = [];

    if (statusRaw === "pending") {
      // Pending: 4 actions (we add 3 here, plus Return below)
      buttons.push(
        {
          // 1) Pay now
          id: `ORDER_PAY_${order.id}`,
          title: lang === "sw" ? "Lipa sasa" : "Pay now",
        },
        {
          // 2) Modify order
          id: `ORDER_MODIFY_${order.id}`,
          title: lang === "sw" ? "Badili oda" : "Modify order",
        },
        {
          // 3) Cancel order
          id: `ORDER_CANCEL_${order.id}`,
          title: lang === "sw" ? "Ghairi oda" : "Cancel order",
        }
      );
    } else {
      // NOT pending: 2 actions (Delete + Return below)
      buttons.push({
        id: `ORDER_DELETE_${order.id}`,
        title: lang === "sw" ? "Futa oda" : "Delete order",
      });
    }

    // 3) Always allow returning to main menu
    buttons.push({
      id: "ACTION_BACK",
      title: t(lang, "menu.back_to_menu"),
    });

    // 4) Send + log the buttons menu
    await sendButtonsMessageSafe(
      user,
      t(lang, "cart.choose_action"),
      buttons
    );

    return;
  }

    if (id.startsWith("ORDER_PAY_")) {
    const rawId = id.substring("ORDER_PAY_".length);
    const orderId = Number(rawId);
    if (!Number.isFinite(orderId)) {
      await sendText(user, t(lang, "orders.none"));
      return;
    }

    const found = await findOrderById(orderId);
    if (!found || !found.order) {
      await sendText(user, t(lang, "orders.none"));
      return;
    }

    const { order, payment } = found;
    const code = (order.order_code as string | null) ?? `UJ-${order.id}`;
    const statusRaw = (order.status as string | null) ?? "pending";

    // Only pending orders can be paid from here
    if (statusRaw !== "pending") {
      await sendText(
        user,
        t(lang, "orders.pay_not_pending", { code })
      );
      return;
    }

    const totalTzs = Number((order as any).total_tzs ?? 0);
    const paidTzs = Number((payment as any)?.amount_tzs ?? 0);
    const remainingTzs = Math.max(totalTzs - paidTzs, 0);

    if (!remainingTzs || remainingTzs <= 0) {
      await sendText(
        user,
        t(lang, "orders.pay_nothing_due", { code })
      );
      return;
    }

    // Remember this order as the "current order being paid"
    const s = getSession(user);
    (s as any).lastOrderId = order.id;
    saveSession(user, s);

    // Tell the user which order they're paying for
    await sendText(
      user,
      t(lang, "orders.pay_header", { code })
    );

    // Reuse existing payment options flow (manual proof)
    await showPaymentOptions(user, lang, remainingTzs);

    return;
  }

    if (id.startsWith("ORDER_CANCEL_")) {
    const rawId = id.substring("ORDER_CANCEL_".length);
    const orderId = Number(rawId);
    if (!Number.isFinite(orderId)) {
      await sendText(user, t(lang, "orders.none"));
      return;
    }

    const found = await findOrderById(orderId);
    if (!found || !found.order) {
      await sendText(user, t(lang, "orders.none"));
      return;
    }

    const { order } = found;
    const code = (order.order_code as string | null) ?? `UJ-${order.id}`;

    if ((order.status as string | null) !== "pending") {
      await sendText(
        user,
        t(lang, "orders.cancel_not_pending", { code })
      );
      return;
    }

    await db("orders")
      .where({ id: orderId })
      .update({
        status: "cancelled",
        updated_at: new Date(),
      });

    // Notify web UI / dashboards
    emit("orders.updated", { order_id: orderId, status: "cancelled" });

    await sendText(user, t(lang, "orders.cancel_success", { code }));
    return;
  }

  if (id.startsWith("ORDER_MODIFY_")) {
    const rawId = id.substring("ORDER_MODIFY_".length);
    const orderId = Number(rawId);
    if (!Number.isFinite(orderId)) {
      await sendText(user, t(lang, "orders.none"));
      return;
    }

    const found = await findOrderById(orderId);
    if (!found || !found.order) {
      await sendText(user, t(lang, "orders.none"));
      return;
    }

    const { order } = found;
    const code = (order.order_code as string | null) ?? `UJ-${order.id}`;

    // Tell the customer what's happening
    await sendText(
      user,
      t(lang, "orders.modify_info", { code })
    );

    // Reuse the existing "talk to agent" logic:
    const customerId = await upsertCustomerByWa(user, undefined, user);
    const conversationId = await getOrCreateConversation(customerId);

    await db("conversations")
      .where({ id: conversationId })
      .update({ agent_allowed: true });

    emit("conversation.updated", {
      id: conversationId,
      agent_allowed: true,
    });

    // Reuse existing agent intro message
    await sendText(user, t(lang, "agent.reply"));

    return;
  }

    if (id.startsWith("ORDER_DELETE_")) {
    const rawId = id.substring("ORDER_DELETE_".length);
    const orderId = Number(rawId);
    if (!Number.isFinite(orderId)) {
      await sendText(user, t(lang, "orders.none"));
      return;
    }

    const found = await findOrderById(orderId);
    if (!found || !found.order) {
      await sendText(user, t(lang, "orders.none"));
      return;
    }

    const { order } = found;
    const code = (order.order_code as string | null) ?? `UJ-${order.id}`;
    const statusRaw = (order.status as string | null) ?? "pending";

    // Only non-pending orders can be deleted from the customer's view
    if (statusRaw === "pending") {
      await sendText(
        user,
        t(lang, "orders.delete_not_allowed_pending", { code })
      );
      return;
    }

    await db("orders")
      .where({ id: orderId })
      .update({
        deleted_at: new Date(),
        updated_at: new Date(),
      });

    await sendText(
      user,
      t(lang, "orders.delete_success", { code })
    );

    return;
  }
  
    // ---------------- NEW: ADD asks for quantity first ----------------
    if (mode === "ADD") {
      // Remember which product we are adding for this user
      PENDING_QTY.set(user, {
        sku: prod.sku,
        name: prod.name,
        unitPrice: prod.price,
      });

      // Ask the user for quantity
      await sendText(
        user,
        t(lang, "cart.ask_quantity", {
          title: prod.name,
          price: fmtTZS(prod.price),
        })
      );
      // We do NOT add to cart yet; we wait for the next text reply
      return;
    }

    // BUY logic stays the same
    if (mode === "BUY") {
      const item: CartItem = {
        sku: prod.sku,
        name: prod.name,
        qty: 1,
        unitPrice: prod.price,
      };

      setPending(user, item);
      setFlow(user, "ASK_IF_DAR"); // start with inside/outside Dar
      CONTACT.set(user, {});
      await sendButtonsMessageSafe(user, t(lang, "flow.choose_dar"), [
        { id: "DAR_INSIDE", title: t(lang, "flow.option_inside_dar") },
        { id: "DAR_OUTSIDE", title: t(lang, "flow.option_outside_dar") },
      ]);
      return;
    }
  }


  if (id === 'ACTION_PAYMENT_DONE') {
  const s = getSession(user);
  s.state = 'WAIT_PROOF';
  saveSession(user, s);
  await sendText(user, t(lang, 'proof.ask'));
  return;
}

}

async function sendProductDetailsOptions(
  toWaId: string,
  productSku: string,
  lang: Lang
) {
  const product = await getProductBySkuAsync(productSku);
  if (!product) {
    await sendText(toWaId, t(lang, "errors.product_not_found"));
    return;
  }

  // Static labels; content comes from DB
  const buttons = [
    {
      id: `PRODUCT_INFO_${productSku}_ABOUT`,
      title: "Kuhusu bidhaa",
    },
    {
      id: `PRODUCT_INFO_${productSku}_USAGE`,
      title: "Jinsi ya kutumia",
    },
    {
      id: `PRODUCT_INFO_${productSku}_WARN`,
      title: "Tahadhari muhimu",
    },
  ];

  await sendButtonsMessageSafe(
    toWaId,
    `Umechagua *${product.name}*.\n\nChagua maelezo unayotaka:`,
    buttons
  );
}


async function isAgentAllowed(waId: string): Promise<boolean> {
  // Reuse your existing helpers
  const customerId = await upsertCustomerByWa(waId, undefined, waId);
  const conversationId = await getOrCreateConversation(customerId);

  const row = await db("conversations")
    .where({ id: conversationId })
    .select("agent_allowed")
    .first();

  return !!row?.agent_allowed;
}


/* -------------------------------------------------------------------------- */
/*                            Flow / message handling                          */
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
    /* ----------------------------- Waiting on buttons ---------------------------- */
    case 'ASK_IF_DAR':
    case 'ASK_IN_DAR_MODE':
      return;

    /* ----------------------- INSIDE Dar — DELIVERY path ------------------------- */
    case 'ASK_NAME_IN': {
      if (!txt) return sendBotText(user, t(lang, 'flow.ask_name'));
      contact.name = txt; CONTACT.set(user, contact);
      setFlow(user, 'ASK_PHONE_IN');
      return sendBotText(user, t(lang, 'flow.ask_phone'));
    }
    case 'ASK_PHONE_IN': {
      if (!txt) return sendBotText(user, t(lang, 'flow.ask_phone'));
      contact.phone = txt; CONTACT.set(user, contact);
      setFlow(user, 'ASK_GPS');
      return sendBotText(user, t(lang, 'flow.ask_gps'));
    }
    case "ASK_GPS": {
      if (m.hasLocation && typeof m.lat === "number" && typeof m.lon === "number") {
        const km = haversineKm(KEKO.lat, KEKO.lon, m.lat, m.lon);
        const fee = feeForDarDistance(km);
        const items = pendingOrCart(user);
        const sub = items.reduce((a, it) => a + it.unitPrice * it.qty, 0);
        const total = sub + fee;

        // Save distance + total in session for later use
        const s = getSession(user);
        s.distanceKm = km;
        s.price = total;
        saveSession(user, s);

        await sendBotText(
          user,
          t(lang, "flow.distance_quote", {
            place: "GPS Pin",
            district: "",
            km: km.toFixed(1),
            fee: fmtTZS(fee),
          })
        );

        await sendBotText(
          user,
          [
            t(lang, "checkout.summary_header"),
            t(lang, "checkout.summary_name", { name: contact.name || "" }),
            t(lang, "checkout.summary_phone", { phone: contact.phone || "" }),
            t(lang, "checkout.summary_total", { total: fmtTZS(total) }),
          ].join("\n")
        );

        // Persist order in DB
        try {
          const customerId = await upsertCustomerByWa(
            user,
            contact.name,
            contact.phone ?? user
          );

          const { orderId, orderCode } = await createOrderWithPayment({
            customerId,
            deliveryMode: "delivery",
            status: "pending",
            km,
            feeTzs: fee,
            totalTzs: total,
            phone: contact.phone ?? null,
            region: contact.region ?? null,
            lat: m.lat,
            lon: m.lon,
            items: items.map((it) => ({
              sku: it.sku,
              name: it.name,
              qty: it.qty,
              unitPrice: it.unitPrice,
            })),
          });

          // 🧠 remember this order in the session
          const s2 = getSession(user);
          (s2 as any).lastOrderId = orderId;
          saveSession(user, s2);

          emit("products.updated", {
            reason: "whatsapp_order_created",
            order_id: orderId,
          });

          const codeToShow = orderCode || `UJ-${orderId}`;
          await sendBotText(
            user,
            `Namba ya order yako ni: *${codeToShow}*.\nTafadhali ihifadhi kwa ajili ya ufuatiliaji.`
          );
        } catch (err) {
          console.error("[checkout] failed to persist ASK_GPS order:", err);
          // We still continue so the customer is not blocked.
        }

        // Ask HOW they want to pay (phone vs COD)
        await sendButtonsMessageSafe(
          user,
          t(lang, "payment.mode_choose"),
          [
            { id: "PAYMODE_PHONE", title: t(lang, "payment.method_phone") },
            { id: "PAYMODE_COD", title: t(lang, "payment.method_cod") },
          ]
        );

        setFlow(user, null);
        return;
      }

      return sendBotText(user, t(lang, "flow.ask_gps"));
    }


    /* ------------------------ INSIDE Dar — PICKUP path -------------------------- */
    case 'ASK_NAME_PICK': {
      if (!txt) return sendBotText(user, t(lang, 'flow.ask_name'));
      contact.name = txt; CONTACT.set(user, contact);
      setFlow(user, 'ASK_PHONE_PICK');
      return sendBotText(user, t(lang, 'flow.ask_phone'));
    }
    case 'ASK_PHONE_PICK': {
      if (!txt) return sendBotText(user, t(lang, 'flow.ask_phone'));
      contact.phone = txt; CONTACT.set(user, contact);

      const items = pendingOrCart(user);
      const sub = items.reduce((a, it) => a + it.unitPrice * it.qty, 0);
      const total = sub;

      await sendText(user, (lang === 'sw' ? PICKUP_INFO_SW : PICKUP_INFO_EN));
      await sendText(user, [
        t(lang, 'checkout.summary_header'),
        t(lang, 'checkout.summary_name', { name: contact.name || '' }),
        t(lang, 'checkout.summary_phone', { phone: contact.phone || '' }),
        t(lang, 'checkout.summary_total', { total: fmtTZS(total) }),
      ].join('\n'));

      await showPaymentOptions(user, lang, total);
      setFlow(user, null);
      return;
    }

    /* ----------------------------- OUTSIDE Dar path ----------------------------- */
    case 'ASK_NAME_OUT': {
      if (!txt) return sendBotText(user, t(lang, 'flow.ask_name'));
      contact.name = txt; CONTACT.set(user, contact);
      setFlow(user, 'ASK_PHONE_OUT');
      return sendBotText(user, t(lang, 'flow.ask_phone'));
    }
    case 'ASK_PHONE_OUT': {
      if (!txt) return sendBotText(user, t(lang, 'flow.ask_phone'));
      contact.phone = txt; CONTACT.set(user, contact);
      setFlow(user, 'ASK_REGION_OUT');
      return sendBotText(user, t(lang, 'flow.ask_region'));
    }
        case "ASK_REGION_OUT": {
      if (!txt) return sendBotText(user, t(lang, "flow.ask_region"));
      contact.region = txt;
      CONTACT.set(user, contact);

      const items = pendingOrCart(user);
      const sub = items.reduce((a, it) => a + it.unitPrice * it.qty, 0);
      const total = sub + OUTSIDE_DAR_FEE;

      await sendText(
        user,
        [
          t(lang, "checkout.summary_header"),
          t(lang, "checkout.summary_name", { name: contact.name || "" }),
          t(lang, "checkout.summary_phone", { phone: contact.phone || "" }),
          t(lang, "checkout.summary_region", { region: contact.region || "" }),
          t(lang, "checkout.summary_total", { total: fmtTZS(total) }),
        ].join("\n")
      );

      // NEW: persist order + initial payment in Neon
      try {
        const customerId = await upsertCustomerByWa(
          user,
          contact.name,
          contact.phone ?? user
        );

       const { orderId, orderCode } = await createOrderWithPayment({
      customerId,
      deliveryMode: "delivery", // still treated as a delivery
      status: "pending",
      km: null,
      feeTzs: OUTSIDE_DAR_FEE,
      totalTzs: total,
      phone: contact.phone ?? null,
      region: contact.region ?? null,
      lat: null,
      lon: null,
      items: items.map((it) => ({
        sku: it.sku,
        name: it.name,
        qty: it.qty,
        unitPrice: it.unitPrice,
      })),
    });

    const codeToShow = orderCode || `UJ-${orderId}`;
    await sendBotText(
      user,
      `Namba ya order yako ni: *${codeToShow}*.\nTafadhali ihifadhi kwa ajili ya ufuatiliaji.`
    );

      } catch (err) {
        console.error("[checkout] failed to persist ASK_REGION_OUT order:", err);
      }

      await sendButtonsMessageSafe(user, t(lang, "payment.done_cta"), [
        { id: "ACTION_PAYMENT_DONE", title: t(lang, "payment.done_button") },
      ]);

      await showPaymentOptions(user, lang, total);
      setFlow(user, null);
      return;
    }


    /* ------------------------------- Tracking stub ------------------------------ */
    /* ------------------------------- Tracking stub ------------------------------ */
/* ---------------------------- Tracking by name/code ---------------------------- */
case "TRACK_ASK_NAME": {
  if (!txt) {
    await sendBotText(user, t(lang, "track.ask_name"));
    return;
  }

  const query = txt.trim();
  let result: { order: any; payment: any } | null = null;

  // 1) If looks like "UJ-3" (or uj-3), treat as order id
  const match = /^uj-(\d+)$/i.exec(query);
  if (match) {
    const id = Number(match[1]);
    if (Number.isFinite(id)) {
      result = await findOrderById(id);
    }
  }

  // 2) If not found by code, or query didn't look like code, try by customer name
  if (!result) {
    result = await findLatestOrderByCustomerName(query);
  }

  if (!result) {
    await sendBotText(user, t(lang, "track.not_found", { query }));
    setFlow(user, null);
    return;
  }

  const { order, payment } = result;

  const orderCode = `UJ-${order.id}`;
  const paymentStatusRaw = payment?.status ?? "none";
  const orderStatusRaw = order.status ?? "pending";

  // Map payment status to friendly text (Swahili/English-friendly)
  let paymentStatusText = "";
  switch (paymentStatusRaw) {
    case "awaiting":
    case "none":
      paymentStatusText = "Tunasubiri malipo yako.";
      break;
    case "verifying":
      paymentStatusText = "Malipo yako yanakaguliwa.";
      break;
    case "paid":
      paymentStatusText = "✅ Malipo yamethibitishwa.";
      break;
    case "failed":
      paymentStatusText = "Malipo yameshindikana / yamekataliwa.";
      break;
    default:
      paymentStatusText = paymentStatusRaw;
      break;
  }

  // Map order fulfillment status to friendly text
  let orderStatusText = "";
  switch (orderStatusRaw) {
    case "pending":
      orderStatusText = "Oda yako imesajiliwa, inasubiri maandalizi.";
      break;
    case "preparing":
      orderStatusText = "Bidhaa zinaandaliwa kwa ajili ya kusafirishwa.";
      break;
    case "out_for_delivery":
      orderStatusText = "Bidhaa zimekabidhiwa mpeleka mzigo, ziko njiani.";
      break;
    case "delivered":
      orderStatusText = "Bidhaa zimefikishwa kwa mlengwa.";
      break;
    case "cancelled":
      orderStatusText = "Oda imeghairishwa.";
      break;
    default:
      orderStatusText = orderStatusRaw;
      break;
  }

  const agentPhone: string | null =
    (order.delivery_agent_phone as string | undefined) ?? null;

  const totalTzs = Number(order.total_tzs ?? 0);
  const paidTzs = Number(payment?.amount_tzs ?? 0);
  const remainingTzs =totalTzs - paidTzs;

  const totalStr = totalTzs ? totalTzs.toLocaleString("sw-TZ") : "0";
  const paidStr = paidTzs ? paidTzs.toLocaleString("sw-TZ") : "0";
  const remainingStr = remainingTzs
    ? remainingTzs.toLocaleString("sw-TZ")
    : "0";

  const lines: string[] = [];
  lines.push(t(lang, "track.header"));
  lines.push(
    t(lang, "track.line_code", {
      code: orderCode,
    })
  );
  lines.push(
    t(lang, "track.line_status_payment", {
      paymentStatus: paymentStatusText,
    })
  );
  lines.push(
    t(lang, "track.line_status_order", {
      orderStatus: orderStatusText,
    })
  );
  lines.push(
    t(lang, "track.line_payment_amounts", {
      total: totalStr,
      paid: paidStr,
      remaining: remainingStr,
    })
  );
  if (agentPhone) {
    lines.push(
      t(lang, "track.line_agent_phone", {
        agentPhone,
      })
    );
  }

  await sendBotText(user, lines.join("\n"));

  setFlow(user, null);
  return;
}
  }
}

async function onSessionMessage(user: string, m: Incoming, lang: Lang) {
  const s = getSession(user);
  const txt = (m.text || "").trim();

  switch (s.state) {
    case "IDLE": {
      return showMainMenu(user, lang);
    }
    case "SHOW_PRICE": {
      s.state = "WAIT_PROOF";
      saveSession(user, s);
      return sendBotText(user, t(lang, "proof.ask"));
    }
    case "WAIT_PROOF": {
      // Accept proof as 2+ names OR (media handled by infra)
      const words = txt.split(/\s+/).filter(Boolean);
      if (words.length >= 2) {
        clearCart(user);
        setPending(user, null);
        resetSession(user);
        return sendBotText(user, t(lang, "proof.ok_names", { names: txt }));
      }
      return sendBotText(user, t(lang, "proof.invalid"));
    }
  }

  return showMainMenu(user, lang);
}

/* -------------------------------------------------------------------------- */
/*                              Details resolver                              */
/* -------------------------------------------------------------------------- */
function detailsForSku(lang: Lang, sku: string): string {
  const code = (sku || "").toUpperCase();
  let body: string;

  if (code === "PROMAX") {
    body = [
      "• " + t(lang, "product.promax.package_a"),
      "• " + t(lang, "product.promax.package_b"),
      "• " + t(lang, "product.promax.package_c"),
    ].join("\n");
  } else if (code === "PROMAX_A") {
    body = t(lang, "product.promax.package_a");
  } else if (code === "PROMAX_B") {
    body = t(lang, "product.promax.package_b");
  } else if (code === "PROMAX_C") {
    body = t(lang, "product.promax.package_c");
  } else if (code === "KIBOKO") {
    body = t(lang, "product.kiboko.details");
  } else if (code === "FURAHA") {
    body = t(lang, "product.furaha.details");
  } else {
    body =
      lang === "sw"
        ? "Maelezo yatapatikana hivi karibuni."
        : "Details coming soon.";
  }

  const disclaimer = t(lang, "disclaimer.general");
  return `${body}\n\n${disclaimer}`;
}


function detailsSectionForSku(
  lang: Lang,
  sku: string,
  section: "ABOUT" | "USAGE" | "WARN"
): string {
  // ABOUT = re-use the old detailsForSku (includes disclaimer)
  if (section === "ABOUT") {
    return detailsForSku(lang, sku);
  }

  if (section === "USAGE") {
    if (sku === "KIBOKO") {
      return lang === "sw"
        ? "Tumia Ujani Kiboko kama ilivyoelekezwa kwenye maelekezo ya dawa. Mara nyingi hupakwa mara 2 kwa siku (asubuhi na jioni), isipokuwa kama umeelekezwa vingine na mtaalamu."
        : "Use Ujani Kiboko exactly as directed on the package. Typically applied twice a day (morning and evening) unless your consultant advises otherwise.";
    }

    if (sku.startsWith("PROMAX")) {
      return lang === "sw"
        ? "Kwa Ujani Pro Max, fuata maelekezo ya kila dawa (za kunywa na za kupaka) kama yalivyoandikwa kwenye vifurushi. Usizidishe dozi bila ushauri wa mtaalamu."
        : "For Ujani Pro Max, follow the usage instructions for each oral and topical medicine as written on the packages. Do not increase the dose without professional advice.";
    }

    return lang === "sw"
      ? "Tumia bidhaa hii kama ilivyoelekezwa kwenye kifurushi au na mtaalamu wa Ujani. Usibadilishe mpangilio wa matumizi bila kushauriana."
      : "Use this product as directed on the packaging or by your Ujani consultant. Do not change the schedule without consulting them.";
  }

  if (section === "WARN") {
    if (sku.startsWith("PROMAX")) {
      return lang === "sw"
        ? "Tahadhari: Usitumie Ujani Pro Max iwapo una mzio kwa viambato vyake. Usizidishe dozi. Kama una presha, matatizo ya moyo au maradhi sugu, wasiliana kwanza na daktari au mtaalamu kabla ya matumizi."
        : "Warning: Do not use Ujani Pro Max if you are allergic to any of its ingredients. Do not exceed the recommended dose. If you have hypertension, heart disease or other chronic conditions, consult your doctor or consultant before use.";
    }

    return lang === "sw"
      ? "Tahadhari: Usizidishe dozi iliyopendekezwa. Usitumie kama una mzio wa viambato vya dawa. Ukiona dalili zisizo za kawaida, acha kutumia mara moja na wasiliana na mtaalamu au daktari."
      : "Warning: Do not exceed the recommended dose. Do not use if you are allergic to any of the ingredients. If you notice unusual symptoms, stop using immediately and contact your consultant or doctor.";
  }

  // Fallback: if something weird happens, just send the combined details
  return detailsForSku(lang, sku);
}
