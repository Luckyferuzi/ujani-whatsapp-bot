// src/orders.ts
// In-memory Orders store compatible with the current webhook + status routes.
// - createOrder({ items, lang, customerPhone, customerName, addressStreet, addressCity, addressCountry })
// - getOrder(orderId), updateOrderAddress, attachTxnMessage, attachTxnImage
// - listOrders, getOrdersSnapshot, updateOrderStatus, setOrderNotes, __seedOrder

import crypto from "crypto";

// ----------------------------- Types ---------------------------------

export type Lang = "sw" | "en";

export type OrderStatus =
  | "created"
  | "confirmed"
  | "packed"
  | "dispatched"
  | "delivered"
  | "closed"
  | "cancelled";

export interface OrderItem {
  productId: string;
  title: string;
  qty: number;
  priceTZS: number;
}

export interface OrderAttachmentMessage {
  ts: number; // epoch ms
  text: string;
}

export interface OrderAttachmentImage {
  ts: number; // epoch ms
  imageId: string; // WhatsApp media id
  caption?: string;
}

export interface Order {
  orderId: string;            // e.g., UJANI-2025-0001
  status: OrderStatus;

  lang: Lang;
  currency: "TZS";

  // Financials
  subtotalTZS: number;        // products only (no delivery)
  deliveryFeeTZS: number;     // aggregated from delivery line items
  totalTZS: number;           // subtotal + delivery
  paidTZS?: number;           // optional running total of received payments

  // Items snapshot
  items: OrderItem[];
  title?: string;             // convenience title when a single main item

  // Customer & address
  customerPhone: string;      // WA id / phone
  customerName?: string;
  addressStreet?: string;
  addressWard?: string;
  addressCity?: string;       // District for Inside Dar
  addressCountry?: string;    // "Dar es Salaam" | "OUTSIDE_DAR" | ...

  // Attachments (manual proof of payment etc.)
  attachments?: {
    messages: OrderAttachmentMessage[];
    images: OrderAttachmentImage[];
  };

  // Misc
  notes?: string;
  createdAt: number;
  updatedAt: number;
  requestId?: string;         // optional tracing id
}

// ----------------------------- Store ---------------------------------

const orders = new Map<string, Order>();

let seqYear = new Date().getFullYear();
let seqCounter = 0;

function nextOrderId(): string {
  const y = new Date().getFullYear();
  if (y !== seqYear) {
    seqYear = y;
    seqCounter = 0;
  }
  seqCounter += 1;
  return `UJANI-${y}-${String(seqCounter).padStart(4, "0")}`;
}

// --------------------------- Calculations -----------------------------

function isDeliveryLine(it: OrderItem): boolean {
  const id = (it.productId || "").toLowerCase();
  return id === "delivery_fee" || id.startsWith("delivery");
}

function computeTotals(items: OrderItem[]): {
  subtotalTZS: number;
  deliveryFeeTZS: number;
  totalTZS: number;
} {
  let subtotal = 0;
  let delivery = 0;
  for (const it of items) {
    const line = Math.max(0, Math.round((it.priceTZS || 0) * (it.qty || 0)));
    if (isDeliveryLine(it)) delivery += line;
    else subtotal += line;
  }
  return { subtotalTZS: subtotal, deliveryFeeTZS: delivery, totalTZS: subtotal + delivery };
}

// --------------------------- Public API --------------------------------

/**
 * Create an order from caller-provided items and lightweight customer/address fields.
 * NOTE: Delivery can be passed either as a separate line item (recommended),
 *       or you can omit it and handle delivery externally.
 */
export function createOrder(input: {
  items: OrderItem[];
  lang: Lang;
  customerPhone: string;
  customerName?: string;
  addressStreet?: string;
  addressWard?: string;
  addressCity?: string;
  addressCountry?: string;
  requestId?: string;
}): Order {
  const items = (input.items || []).map((i) => ({
    productId: i.productId,
    title: i.title,
    qty: Math.max(1, Math.round(i.qty || 1)),
    priceTZS: Math.max(0, Math.round(i.priceTZS || 0)),
  }));

  const { subtotalTZS, deliveryFeeTZS, totalTZS } = computeTotals(items);
  const singleMainItem = items.filter((i) => !isDeliveryLine(i));
  const title = singleMainItem.length === 1 ? singleMainItem[0].title : undefined;

  const order: Order = {
    orderId: nextOrderId(),
    status: "created",
    lang: input.lang === "en" ? "en" : "sw",
    currency: "TZS",

    subtotalTZS,
    deliveryFeeTZS,
    totalTZS,
    paidTZS: 0,

    items,
    title,

    customerPhone: input.customerPhone,
    customerName: input.customerName,
    addressStreet: input.addressStreet,
    addressWard: input.addressWard,
    addressCity: input.addressCity,
    addressCountry: input.addressCountry,

    attachments: { messages: [], images: [] },

    notes: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    requestId: input.requestId,
  };

  orders.set(order.orderId, order);
  return clone(order);
}

/** Read an order by id (alias for getOrderById). */
export function getOrder(orderId: string): Order | null {
  return getOrderById(orderId);
}

/** Read an order by id. */
export function getOrderById(orderId: string): Order | null {
  const o = orders.get((orderId || "").trim());
  return o ? clone(o) : null;
}

/** Update the free-form address text (used by "Edit Address" flow). */
export function updateOrderAddress(orderId: string, addressText: string): Order | null {
  const o = orders.get((orderId || "").trim());
  if (!o) return null;
  const text = (addressText || "").trim();
  if (text) o.addressStreet = text;
  o.updatedAt = Date.now();
  return clone(o);
}

/** Attach the payer's textual proof (free-form). */
export function attachTxnMessage(orderId: string, text: string): Order | null {
  const o = orders.get((orderId || "").trim());
  if (!o) return null;
  const msg: OrderAttachmentMessage = { ts: Date.now(), text: (text || "").trim() };
  if (!o.attachments) o.attachments = { messages: [], images: [] };
  o.attachments.messages.push(msg);
  o.updatedAt = Date.now();
  return clone(o);
}

/** Attach a screenshot/image proof (WhatsApp media id + caption). */
export function attachTxnImage(orderId: string, imageId: string, caption?: string): Order | null {
  const o = orders.get((orderId || "").trim());
  if (!o) return null;
  const img: OrderAttachmentImage = { ts: Date.now(), imageId: (imageId || "").trim(), caption: (caption || "").trim() || undefined };
  if (!o.attachments) o.attachments = { messages: [], images: [] };
  o.attachments.images.push(img);
  o.updatedAt = Date.now();
  return clone(o);
}

/** Update order status (guarding terminal states lightly). */
export function updateOrderStatus(orderId: string, next: OrderStatus): Order | null {
  const o = orders.get((orderId || "").trim());
  if (!o) return null;

  const terminal: OrderStatus[] = ["closed", "cancelled"];
  if (terminal.includes(o.status)) return clone(o);

  const valid: OrderStatus[] = [
    "created", "confirmed", "packed", "dispatched", "delivered", "closed", "cancelled",
  ];
  if (!valid.includes(next)) return clone(o);

  o.status = next;
  o.updatedAt = Date.now();
  return clone(o);
}

/** Set/replace order notes (admin or agent). */
export function setOrderNotes(orderId: string, notes: string): Order | null {
  const o = orders.get((orderId || "").trim());
  if (!o) return null;
  o.notes = (notes || "").trim();
  o.updatedAt = Date.now();
  return clone(o);
}

/** List orders with optional filters. */
export function listOrders(filter?: {
  userId?: string; // alias: customerPhone
  status?: OrderStatus;
  since?: number; // epoch ms
  until?: number; // epoch ms
}): Order[] {
  const arr = Array.from(orders.values());
  const out = arr.filter((o) => {
    if (filter?.userId && o.customerPhone !== filter.userId) return false;
    if (filter?.status && o.status !== filter.status) return false;
    if (filter?.since && o.createdAt < filter.since) return false;
    if (filter?.until && o.createdAt > filter.until) return false;
    return true;
  });
  out.sort((a, b) => b.createdAt - a.createdAt);
  return out.map(clone);
}

/** Compact snapshot for dashboards/tables. */
export function getOrdersSnapshot(): Array<{
  orderId: string;
  userId: string;
  status: OrderStatus;
  subtotal: number;
  deliveryFee: number;
  total: number;
  createdAt: number;
  district?: string;
  ward?: string;
  street?: string;
  distanceKm?: number; // optional if you choose to populate it elsewhere
}> {
  const data = Array.from(orders.values()).map((o) => ({
    orderId: o.orderId,
    userId: o.customerPhone,
    status: o.status,
    subtotal: o.subtotalTZS,
    deliveryFee: o.deliveryFeeTZS,
    total: o.totalTZS,
    createdAt: o.createdAt,
    district: o.addressCity,
    ward: o.addressWard,
    street: o.addressStreet,
    distanceKm: undefined,
  }));
  data.sort((a, b) => b.createdAt - a.createdAt);
  return data;
}

// --------------------------- Dev / Testing -------------------------------

/** Danger: clear all orders (tests). */
export function __dangerouslyClearAllOrders(): void {
  orders.clear();
  seqCounter = 0;
}

/** Seed a fake order for local/status UI testing. */
export function __seedOrder(partial?: Partial<Order>): Order {
  const baseItems: OrderItem[] =
    partial?.items ??
    [{ productId: "product_kiboko", title: "Ujani Kiboko", qty: 1, priceTZS: 120000 }];

  const { subtotalTZS, deliveryFeeTZS, totalTZS } = computeTotals(baseItems);

  const o: Order = {
    orderId: nextOrderId(),
    status: partial?.status ?? "created",
    lang: partial?.lang ?? "sw",
    currency: "TZS",

    subtotalTZS,
    deliveryFeeTZS,
    totalTZS,
    paidTZS: partial?.paidTZS ?? 0,

    items: baseItems,
    title: baseItems.length === 1 ? baseItems[0].title : undefined,

    customerPhone: partial?.customerPhone ?? "+255700000000",
    customerName: partial?.customerName ?? "Test Buyer",
    addressStreet: partial?.addressStreet ?? "Msimbazi",
    addressWard: partial?.addressWard ?? "Kivukoni",
    addressCity: partial?.addressCity ?? "Ilala",
    addressCountry: partial?.addressCountry ?? "Dar es Salaam",

    attachments: { messages: [], images: [] },

    notes: partial?.notes,
    createdAt: partial?.createdAt ?? Date.now(),
    updatedAt: partial?.updatedAt ?? Date.now(),
    requestId: partial?.requestId ?? crypto.randomUUID(),
  };

  orders.set(o.orderId, o);
  return clone(o);
}

// ------------------------------ Utils ---------------------------------

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}
