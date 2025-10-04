// src/orders.ts
// Supports multi-item orders (cart) and single-item orders.

import { productTitle, promaxPackageTitle, isProMaxPackageId } from './menu.js';

export type OrderStatus = 'awaiting' | 'partial' | 'paid';
export type Fulfillment = 'pickup' | 'delivery';

export type OrderItem = { productId: string; title: string; qty: number; priceTZS: number };

export type Order = {
  orderId: string;
  items: OrderItem[];
  productId?: string; // for backward compatibility
  title: string;      // convenient display (single item or summary)
  lang: 'en' | 'sw';
  customerPhone: string;
  contactPhone?: string;
  fulfillment: Fulfillment;
  totalTZS: number;
  createdAt: string;

  customerName?: string;

  addressStreet?: string;
  addressCity?: string;
  addressCountry?: string;

  txnMessage?: string;
  txnImageId?: string;
  txnImageCaption?: string;
};

const ordersById = new Map<string, Order>();
const paymentsByOrderId = new Map<string, number>();

let seq = 0;
function nextOrderId(): string {
  const y = new Date().getFullYear();
  seq = (seq + 1) % 10000;
  const n = String(seq).padStart(4, '0');
  return `UJANI-${y}-${n}`;
}

export function createOrder(params: {
  // Either provide items[] OR productId+title+price via totalTZS
  items?: OrderItem[];
  productId?: string;
  lang: 'en' | 'sw';
  customerPhone: string;
  contactPhone?: string;
  fulfillment: Fulfillment;
  totalTZS?: number;       // used if single-item
  customerName?: string;
  addressStreet?: string;
  addressCity?: string;
  addressCountry?: string;
}): Order {
  const orderId = nextOrderId();

  let items: OrderItem[] = params.items ?? [];
  let title = '';
  let total = 0;

  if (!items.length && params.productId) {
    // Single item
    const t = isProMaxPackageId(params.productId)
      ? `${productTitle('product_promax', params.lang)} — ${promaxPackageTitle(params.productId, params.lang)}`
      : productTitle(params.productId, params.lang);
    const price = Math.max(0, Math.floor(params.totalTZS ?? 0));
    items = [{ productId: params.productId, title: t, qty: 1, priceTZS: price }];
  }

  total = items.reduce((s, it) => s + it.priceTZS * it.qty, 0);
  title = items.length === 1 ? items[0].title : (params.lang === 'sw' ? `Bidhaa nyingi (${items.length})` : `Multiple items (${items.length})`);

  const order: Order = {
    orderId,
    items,
    productId: params.productId,
    title,
    lang: params.lang,
    customerPhone: params.customerPhone,
    contactPhone: params.contactPhone,
    fulfillment: params.fulfillment,
    totalTZS: total,
    createdAt: new Date().toISOString(),
    customerName: params.customerName,
    addressStreet: params.addressStreet,
    addressCity: params.addressCity,
    addressCountry: params.addressCountry,
  };

  ordersById.set(orderId, order);
  paymentsByOrderId.set(orderId, 0);
  return order;
}

function deriveStatus(total: number, paid: number): OrderStatus {
  if (paid <= 0) return 'awaiting';
  if (paid < total) return 'partial';
  return 'paid';
}

export function getOrder(orderId: string): (Order & {
  status: OrderStatus;
  paidTZS: number;
  balanceTZS: number;
}) | undefined {
  const o = ordersById.get(orderId);
  if (!o) return undefined;
  const paid = Math.max(0, Math.floor(paymentsByOrderId.get(orderId) ?? 0));
  const balance = Math.max(0, o.totalTZS - paid);
  const status = deriveStatus(o.totalTZS, paid);
  return { ...o, status, paidTZS: paid, balanceTZS: balance };
}

export function listOrders(): Array<Order & {
  status: OrderStatus;
  paidTZS: number;
  balanceTZS: number;
}> {
  return Array.from(ordersById.values()).map(o => {
    const paid = Math.max(0, Math.floor(paymentsByOrderId.get(o.orderId) ?? 0));
    const balance = Math.max(0, o.totalTZS - paid);
    const status = deriveStatus(o.totalTZS, paid);
    return { ...o, status, paidTZS: paid, balanceTZS: balance };
  });
}

export function updateOrderAddress(orderId: string, street: string, city: string, country: string) {
  const o = ordersById.get(orderId);
  if (!o) return undefined;
  o.addressStreet = street;
  o.addressCity = city;
  o.addressCountry = country;
  return getOrder(orderId);
}

export function attachTxnMessage(orderId: string, msg: string) {
  const o = ordersById.get(orderId);
  if (!o) return undefined;
  o.txnMessage = msg;
  return getOrder(orderId);
}

export function attachTxnImage(orderId: string, imageId: string, caption?: string) {
  const o = ordersById.get(orderId);
  if (!o) return undefined;
  o.txnImageId = imageId;
  o.txnImageCaption = caption;
  return getOrder(orderId);
}

export function markPaid(orderId: string, amountTZS: number) {
  const o = ordersById.get(orderId);
  if (!o) return getOrder(orderId);
  const amt = Math.max(0, Math.floor(amountTZS || 0));
  paymentsByOrderId.set(orderId, Math.max(0, (paymentsByOrderId.get(orderId) ?? 0) + amt));
  return getOrder(orderId);
}
