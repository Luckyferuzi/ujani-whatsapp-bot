// src/session.ts
// Lightweight in-memory session store tailored to the current webhook.
// Exposes helpers used throughout the flow (cart, checkout, language, etc.)

// ----------------------------- Types ---------------------------------

export type Lang = "sw" | "en";
export type Expecting = string | null;

export interface CartItem {
  productId: string;
  title: string;
  qty: number;
  priceTZS: number;
}

export interface Cart {
  items: CartItem[];
}

export interface Checkout {
  // High-level flow
  stage?: string;                         // e.g., asked_name, asked_district, asked_ward, asked_street, asked_phone
  fulfillment?: "pickup" | "delivery";    // chosen fulfillment for Inside Dar
  outsideMode?: "Bus" | "Boat";           // Outside Dar transport mode

  // Product shortcut buy
  productId?: string;
  title?: string;
  priceTZS?: number;

  // Customer/contact
  customerName?: string;
  contactPhone?: string;

  // Location (Inside Dar)
  addressCountry?: string;                // "Dar es Salaam" | "OUTSIDE_DAR" | other
  addressCity?: string;                   // district
  addressWard?: string;                   // ward
  addressStreet?: string;                 // street (typed)
  addressRaw?: string;                    // free-form (for outside Dar)

  // Paging/caches for pickers
  districtsCache?: string[];
  wardPageIndex?: number;

  // Delivery math (Dar)
  deliveryKm?: number;                    // rounded display km (e.g., 1.2)
  deliveryFeeTZS?: number;                // fee rounded to next 500

  // Optional order math snapshot
  totalTZS?: number;
}

export interface Session {
  userId: string;              // normalized WA id
  lang: Lang;              // "sw" | "en"
  expecting: Expecting;        // current awaiting input marker
  cart: Cart;                  // simple cart
  checkout?: Checkout;         // ephemeral checkout context
  lastCreatedOrderId?: string; // for quick follow-ups

  createdAt: number;
  updatedAt: number;
}

// ----------------------------- Store ---------------------------------

const SESSIONS = new Map<string, Session>();
const SESSION_TTL_MIN = Number(process.env.SESSION_TTL_MIN ?? 240); // 4h default

// --------------------------- Utilities --------------------------------

function now() {
  return Date.now();
}

function isExpired(sess: Session): boolean {
  const ageMin = (now() - sess.updatedAt) / 60000;
  return ageMin > SESSION_TTL_MIN;
}

function normalizeId(id: string): string {
  // Keep digits and leading +. WhatsApp wa_id typically fits this.
  const trimmed = (id || "").toString().trim();
  const cleaned = trimmed.replace(/[^\d+]/g, "");
  if (!cleaned) return trimmed || "unknown";
  // Standardize +255..., 0xxxxxxxxx -> +255xxxxxxxxx, 255xxxxxxxxx -> +255xxxxxxxxx
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.startsWith("0")) return "+255" + cleaned.slice(1);
  if (cleaned.startsWith("255")) return "+" + cleaned;
  return "+" + cleaned;
}

function freshSession(userId: string): Session {
  const ts = now();
  return {
    userId,
    lang: "sw",
    expecting: null,
    cart: { items: [] },
    checkout: undefined,
    lastCreatedOrderId: undefined,
    createdAt: ts,
    updatedAt: ts,
  };
}

// --------------------------- Core API ---------------------------------

export function getSession(rawUserId: string): Session {
  const uid = normalizeId(rawUserId);
  const existing = SESSIONS.get(uid);
  if (existing) {
    if (isExpired(existing)) {
      SESSIONS.delete(uid);
      const fresh = freshSession(uid);
      SESSIONS.set(uid, fresh);
      return fresh;
    }
    existing.updatedAt = now();
    return existing;
  }
  const sess = freshSession(uid);
  SESSIONS.set(uid, sess);
  return sess;
}

export function setLang(rawUserId: string, lang: Lang): Session {
  const sess = getSession(rawUserId);
  sess.lang = lang === "en" ? "en" : "sw";
  sess.updatedAt = now();
  return sess;
}

export function setExpecting(rawUserId: string, expecting: Expecting): Session {
  const sess = getSession(rawUserId);
  sess.expecting = expecting;
  sess.updatedAt = now();
  return sess;
}

export function setLastOrderId(rawUserId: string, orderId: string): Session {
  const sess = getSession(rawUserId);
  sess.lastCreatedOrderId = (orderId || "").trim() || undefined;
  sess.updatedAt = now();
  return sess;
}

// --------------------------- Checkout API ------------------------------

/**
 * Begin checkout. Can be called with just userId, or with quick-buy details.
 */
export function startCheckout(
  rawUserId: string,
  productId?: string,
  title?: string,
  priceTZS?: number
): Session {
  const sess = getSession(rawUserId);
  sess.checkout = {
    ...(sess.checkout || {}),
    productId: productId ?? (sess.checkout?.productId),
    title: title ?? (sess.checkout?.title),
    priceTZS: typeof priceTZS === "number" ? priceTZS : (sess.checkout?.priceTZS),
  };
  sess.updatedAt = now();
  return sess;
}

/**
 * Merge-patch the checkout object.
 */
export function updateCheckout(
  rawUserId: string,
  patch: Partial<Checkout>
): Session {
  const sess = getSession(rawUserId);
  const base: Checkout = sess.checkout || {};
  sess.checkout = { ...base, ...(patch || {}) };
  sess.updatedAt = now();
  return sess;
}

export function setCheckoutStage(
  rawUserId: string,
  stage: string | undefined
): Session {
  return updateCheckout(rawUserId, { stage });
}

/**
 * Clear the entire checkout object.
 */
export function resetCheckout(rawUserId: string): Session {
  const sess = getSession(rawUserId);
  sess.checkout = undefined;
  sess.expecting = null;
  sess.updatedAt = now();
  return sess;
}

// ----------------------------- Cart API --------------------------------

export function addToCart(
  rawUserId: string,
  item: { productId: string; title: string; qty: number; priceTZS: number }
): Session {
  const sess = getSession(rawUserId);
  const qty = Math.max(1, Math.round(item.qty || 1));
  const price = Math.max(0, Math.round(item.priceTZS || 0));

  const existingIdx = sess.cart.items.findIndex(
    (i) => i.productId === item.productId && i.title === item.title
  );
  if (existingIdx >= 0) {
    sess.cart.items[existingIdx].qty += qty;
    // Keep the latest price if provided
    if (price > 0) sess.cart.items[existingIdx].priceTZS = price;
  } else {
    sess.cart.items.push({
      productId: item.productId,
      title: item.title,
      qty,
      priceTZS: price,
    });
  }
  sess.updatedAt = now();
  return sess;
}

export function clearCart(rawUserId: string): Session {
  const sess = getSession(rawUserId);
  sess.cart.items = [];
  sess.updatedAt = now();
  return sess;
}

export function cartTotal(rawUserId: string): number {
  const sess = getSession(rawUserId);
  let total = 0;
  for (const it of sess.cart.items) total += (it.priceTZS || 0) * (it.qty || 0);
  return Math.max(0, Math.round(total));
}

// ---------------------------- Admin / Dev -------------------------------

/**
 * Danger: wipe all sessions (tests/dev only).
 */
export function __dangerouslyClearAllSessions(): void {
  SESSIONS.clear();
}

/**
 * Snapshot current sessions (read-only clones).
 */
export function __sessionsSnapshot(): Array<Session> {
  return Array.from(SESSIONS.values()).map((s) => ({
    ...s,
    cart: { items: s.cart.items.map((i) => ({ ...i })) },
    checkout: s.checkout ? { ...s.checkout } : undefined,
  }));
}
