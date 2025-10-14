// In-memory orders, tracked by customerName (no orderId)

export type OrderStatus =
  | 'Awaiting Proof'
  | 'Proof Received'
  | 'Preparing'
  | 'Shipped'
  | 'Delivered';

export type PaymentProof =
  | { type: 'image'; imageId?: string; imageUrl?: string; receivedAt: string }
  | { type: 'names'; fullNames: string; receivedAt: string };

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
}

export interface DeliveryInfoDar {
  mode: 'dar';
  district: string;
  place: string;
  distanceKm: number;
  deliveryFee: number;
}

export interface DeliveryInfoPickup {
  mode: 'pickup';
  pickupPoint?: string;
}

export interface DeliveryInfoOutside {
  mode: 'outside';
  region: string;
  transportMode: 'bus' | 'boat';
  operator?: string;
  station?: string;
  deliveryFee: number;
}

export type DeliveryInfo = DeliveryInfoDar | DeliveryInfoPickup | DeliveryInfoOutside;

export interface Order {
  createdAt: string;        // ISO timestamp
  customerName: string;     // primary tracking key
  phone?: string;
  items: OrderItem[];
  delivery: DeliveryInfo;
  note?: string;

  status: OrderStatus;
  proof?: PaymentProof;
}

const ORDERS: Order[] = [];

export function addOrder(
  o: Omit<Order, 'createdAt' | 'status'> & Partial<Pick<Order, 'status'>>
): Order {
  const order: Order = {
    createdAt: new Date().toISOString(),
    status: o.status ?? 'Awaiting Proof',
    customerName: o.customerName,
    phone: o.phone,
    items: o.items,
    delivery: o.delivery,
    note: o.note,
    proof: o.proof,
  };
  ORDERS.push(order);
  return order;
}

export function listOrders(): Order[] {
  return ORDERS.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function listOrdersByName(name: string): Order[] {
  const n = norm(name);
  return ORDERS
    .filter(o => norm(o.customerName) === n)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getMostRecentOrderByName(name: string): Order | undefined {
  return listOrdersByName(name)[0];
}

export function setOrderProof(order: Order, proof: PaymentProof): void {
  order.proof = proof;
  order.status = 'Proof Received';
}

export function updateOrderStatus(order: Order, status: OrderStatus): void {
  order.status = status;
}

export function computeSubtotal(items: OrderItem[]): number {
  return items.reduce((sum, it) => sum + it.qty * it.unitPrice, 0);
}

export function computeTotal(order: Order): number {
  const delivery =
    order.delivery.mode === 'dar'
      ? order.delivery.deliveryFee
      : order.delivery.mode === 'outside'
        ? order.delivery.deliveryFee
        : 0;
  return computeSubtotal(order.items) + (delivery || 0);
}

function norm(s: string): string {
  return (s || '')
    .normalize('NFD')
    // @ts-ignore Unicode property escapes supported in Node
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
