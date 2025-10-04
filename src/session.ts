// src/session.ts
// Session with CART support + checkout states.

export type Lang = 'en' | 'sw';

export type Expecting =
  | 'none'
  | 'customer_name'
  | 'pickup_phone'
  | 'delivery_address'
  | 'delivery_phone'
  | 'edit_address'
  | 'order_id'
  | 'agent_phone'
  | 'txn_message';

export type Fulfillment = 'pickup' | 'delivery';

export type CartItem = { productId: string; title: string; priceTZS: number; qty: number };
export type Cart = { items: CartItem[] };

export type CheckoutStage = 'start' | 'asked_name' | 'asked_address' | 'asked_phone' | 'done';

export type Checkout = {
  stage: CheckoutStage;
  productId?: string;     // present for single-product path
  title?: string;
  totalTZS?: number;

  fulfillment?: Fulfillment;

  customerName?: string;
  contactPhone?: string;

  addressStreet?: string;
  addressCity?: string;
  addressCountry?: string;
  addressRaw?: string;
};

export type Session = {
  lang: Lang;
  expecting: Expecting;
  cart: Cart;
  checkout?: Checkout;
  agentPhone?: string;
  lastCreatedOrderId?: string;
};

const sessions = new Map<string, Session>();

function ensure(phone: string): Session {
  let s = sessions.get(phone);
  if (!s) {
    s = { lang: 'sw', expecting: 'none', cart: { items: [] } };
    sessions.set(phone, s);
  }
  return s;
}

export function getSession(phone: string): Session {
  return ensure(phone);
}

export function setLang(phone: string, lang: Lang) {
  ensure(phone).lang = lang;
}

export function setExpecting(phone: string, expecting: Expecting) {
  ensure(phone).expecting = expecting;
}

/* ------------------------------- CART ----------------------------------- */
export function addToCart(phone: string, item: CartItem) {
  const s = ensure(phone);
  const existing = s.cart.items.find((x) => x.productId === item.productId);
  if (existing) existing.qty += item.qty;
  else s.cart.items.push(item);
}

export function clearCart(phone: string) {
  ensure(phone).cart.items = [];
}

export function cartTotal(phone: string): number {
  return ensure(phone).cart.items.reduce((sum, it) => sum + it.priceTZS * it.qty, 0);
}

/* ----------------------------- CHECKOUT --------------------------------- */
export function startCheckout(phone: string, productId?: string, title?: string, totalTZS?: number) {
  ensure(phone).checkout = { stage: 'start', productId, title, totalTZS };
}

export function updateCheckout(phone: string, patch: Partial<Checkout>) {
  const s = ensure(phone);
  if (!s.checkout) s.checkout = { stage: 'start' };
  s.checkout = { ...s.checkout, ...patch };
}

export function setCheckoutStage(phone: string, stage: CheckoutStage) {
  const s = ensure(phone);
  if (!s.checkout) s.checkout = { stage: 'start' };
  s.checkout.stage = stage;
}

export function setLastOrderId(phone: string, orderId: string) {
  ensure(phone).lastCreatedOrderId = orderId;
}

export function resetCheckout(phone: string) {
  const s = ensure(phone);
  delete s.checkout;
  s.expecting = 'none';
}
