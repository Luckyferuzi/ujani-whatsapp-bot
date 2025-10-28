// src/orders.ts
// In-memory orders & helpers used by the webhook flow.

export type OrderItem = {
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
};

export type DeliveryDar = {
  mode: 'dar';
  district: string;   // 'GPS'
  place: string;      // address/name from pin if any
  km: number;
  deliveryFee: number;
};

export type DeliveryOutside = {
  mode: 'outside';
  region: string;
  transportMode: 'bus';
  deliveryFee: number;
};

export type DeliveryPickup = {
  mode: 'pickup';
};

export type OrderDelivery = DeliveryDar | DeliveryOutside | DeliveryPickup;

export type OrderProof =
  | { type: 'image'; imageId: string; receivedAt: string }
  | { type: 'text'; text: string; receivedAt: string };

export type Order = {
  id: string;
  customerName: string;
  phone?: string;
  items: OrderItem[];
  delivery: OrderDelivery;
  status: 'Pending' | 'Paid' | 'Shipped' | 'Delivered';
  createdAt: string;
  proof?: OrderProof;
};

const ORDERS: Order[] = [];

function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
}

/* ------------------------------ Calculations ------------------------------ */

export function computeSubtotal(items: OrderItem[]): number {
  return items.reduce((sum, it) => sum + it.unitPrice * it.qty, 0);
}

export function computeTotal(order: Order): number {
  const sub = computeSubtotal(order.items);
  const fee =
    order.delivery.mode === 'dar'
      ? order.delivery.deliveryFee
      : order.delivery.mode === 'outside'
      ? order.delivery.deliveryFee
      : 0;
  return sub + fee;
}

/* --------------------------------- CRUD ----------------------------------- */

export function addOrder(input: {
  customerName: string;
  phone?: string;
  items: OrderItem[];
  delivery: OrderDelivery;
}): Order {
  const order: Order = {
    id: genId(),
    customerName: input.customerName,
    phone: input.phone,
    items: input.items.map(i => ({ ...i })),
    delivery: input.delivery,
    status: 'Pending',
    createdAt: new Date().toISOString(),
  };
  ORDERS.unshift(order);
  return order;
}

export function setOrderProof(order: Order, proof: OrderProof) {
  order.proof = proof;
  order.status = 'Paid';
}

export function listOrdersByName(name: string): Order[] {
  const n = (name || '').trim().toLowerCase();
  return ORDERS.filter(o => o.customerName.trim().toLowerCase() === n);
}

export function getMostRecentOrderByName(name: string): Order | undefined {
  const matches = listOrdersByName(name);
  return matches[0]; // newest first
}

/* ------------------------------ Admin helpers ----------------------------- */

export function listAllOrders(): Order[] {
  return ORDERS.slice();
}
