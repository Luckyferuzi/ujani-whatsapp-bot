// src/session.ts
// Session with CART support + checkout states + smart-delivery selections.

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
  | 'txn_message'
  // NEW states already referenced in your webhook.ts and our street flow:
  | 'select_district'
  | 'select_ward'
  | 'select_street'
  | 'awaiting_location'
  | 'confirm_delivery';

export type Fulfillment = 'pickup' | 'delivery';

export type CartItem = { productId: string; title: string; priceTZS: number; qty: number };
export type Cart = { items: CartItem[] };

export type CheckoutStage = 'start' | 'asked_name' | 'asked_address' | 'asked_phone' | 'done';

export type Checkout = {
  stage: CheckoutStage;
  // single-product convenience
  productId?: string;
  title?: string;
  totalTZS?: number;

  fulfillment?: Fulfillment;

  customerName?: string;
  contactPhone?: string;

  // legacy / free-text address fields (used elsewhere in your code)
  addressStreet?: string;      // you currently save the *ward* here
  addressCity?: string;        // district
  addressCountry?: string;     // "Dar es Salaam" or "OUTSIDE_DAR"
  addressCountryRegion?: string; // outside-Dar region

  // outside-Dar transport (your webhook uses these as any)
  outsideMode?: 'bus' | 'boat';
  outsideStation?: string;

  // UI helpers cached in webhook.ts
  districtsCache?: string[];
  wardPageIndex?: number;

  // smart delivery (final numbers persisted in summary)
  deliveryKm?: number;
  deliveryFeeTZS?: number;

  // extra telemetry for street flow (optional)
  matchType?: 'street_exact' | 'street_fuzzy' | 'nearest_location' | 'ward_only' | 'derived_min_street';
  matchConfidence?: number;
  resolvedStreet?: string | null;
};

export type Session = {
  lang: Lang;
  expecting: Expecting;

  cart: Cart;

  // last created order id (used by payment attach)
  lastCreatedOrderId?: string;

  checkout?: Checkout;

  // Smart delivery selections
  selectedDistrict?: string;
  selectedWard?: string;
  selectedStreet?: string | null;
  streetPage?: number;

  // WhatsApp location cache
  lastLocationLat?: number | null;
  lastLocationLon?: number | null;
};

/* ------------------------------------------------------------------------ */

const sessions = new Map<string, Session>();

function ensure(phone: string): Session {
  let s = sessions.get(phone);
  if (!s) {
    s = {
      lang: 'sw',
      expecting: 'none',
      cart: { items: [] }
    };
    sessions.set(phone, s);
  }
  return s;
}

/* ------------------------------ Accessors -------------------------------- */

export function getSession(phone: string): Session {
  return ensure(phone);
}

export function setLang(phone: string, lang: Lang) {
  ensure(phone).lang = lang;
}

export function setExpecting(phone: string, expecting: Expecting) {
  ensure(phone).expecting = expecting;
}

/* -------------------------------- CART ----------------------------------- */

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
  const s = ensure(phone);
  return s.cart.items.reduce((sum, it) => sum + it.priceTZS * it.qty, 0);
}

/* ------------------------------ Checkout --------------------------------- */

export function startCheckout(phone: string) {
  const s = ensure(phone);
  s.checkout = { stage: 'start', totalTZS: cartTotal(phone) };
}

export function updateCheckout(phone: string, updates: Partial<Checkout>) {
  const s = ensure(phone);
  s.checkout = { ...(s.checkout ?? { stage: 'start' }), ...updates };
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

/* --------------------------- Smart Delivery ------------------------------ */

export function setSelectedDistrict(phone: string, name: string) {
  const s = ensure(phone);
  s.selectedDistrict = name;
  s.selectedWard = undefined;
  s.selectedStreet = null;
  s.streetPage = 0;
}

export function setSelectedWard(phone: string, name: string) {
  const s = ensure(phone);
  s.selectedWard = name;
  s.selectedStreet = null;
  s.streetPage = 0;
}

export function setSelectedStreet(phone: string, name: string | null) {
  const s = ensure(phone);
  s.selectedStreet = name;
}

export function nextStreetPage(phone: string) {
  const s = ensure(phone);
  s.streetPage = (s.streetPage ?? 0) + 1;
}

export function setLastLocation(phone: string, lat: number | null, lon: number | null) {
  const s = ensure(phone);
  s.lastLocationLat = lat;
  s.lastLocationLon = lon;
}
