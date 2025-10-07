// src/session.ts
// Lightweight in-memory session store for WhatsApp conversations.
// Safe defaults, typed helpers, and the same function names you’ve been using.

export type Lang = "sw" | "en";

/** Conversation state machine */
export type Expecting =
  | "full_name"
  | "in_out_dar"
  | "phone_in_dar"
  | "address_in_dar"
  | "region_outside"
  | "done_in_dar"
  | "done_outside"
  // Delivery pickers (kept for compatibility with your previous flow)
  | "select_district"
  | "select_ward"
  | "select_street"
  | "awaiting_location"
  | "confirm_delivery"
  // Generic/defaults
  | "menu"
  | "none";

export type MatchType =
  | "street_exact"
  | "nearest_location"
  | "ward_only"
  | "derived_min_street"
  | string;

export interface CheckoutState {
  deliveryKm?: number | null;
  deliveryFeeTZS?: number;
  matchType?: MatchType;
  matchConfidence?: number; // 0..1
  resolvedStreet?: string | null;
  ward?: string | null;
  street?: string | null;
  district?: string | null;
  receiverName?: string | null;
  receiverPhone?: string | null;
}

export interface SessionData {
  /** WhatsApp number (msisdn) used as key */
  phone: string;

  /** i18n language */
  lang: Lang;

  /** current expected input */
  expecting: Expecting;

  /** customer data for your order flow */
  fullName?: string | null;
  phoneNumber?: string | null;
  region?: string | null; // outside Dar use-case

  /** delivery choices (UI list flow compatibility) */
  selectedDistrict?: string | null;
  selectedWard?: string | null;
  selectedStreet?: string | null;
  streetPage?: number; // pagination pointer when listing streets

  /** last shared location pin */
  lastLocation?: { lat: number; lon: number; at: number } | null;

  /** last computed delivery info (convenience) */
  delivery?: {
    city?: string | null; // e.g., "Dar es Salaam"
    ward?: string | null;
    street?: string | null;
    district?: string | null;
    distance_km?: number | null;
    fee_tzs?: number | null;
    raw_input?: string | null; // "mtaa, wilaya" free text
  } | null;

  /** checkout-like aggregate for pricing integration */
  checkout?: CheckoutState;

  /** optionally, your cart or other temp data */
  cart?: Record<string, any> | null;

  /** housekeeping */
  createdAt: number;
  updatedAt: number;
}

/* -------------------------------------------------------------------------- */
/*                                In-memory DB                                */
/* -------------------------------------------------------------------------- */

const SESSIONS = new Map<string, SessionData>();

// Optional: expire inactive sessions after N hours (cleanup is lazy)
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
let _lastSweep = Date.now();

function sweepIfNeeded() {
  const now = Date.now();
  if (now - _lastSweep < 10 * 60 * 1000) return; // at most every 10 minutes
  _lastSweep = now;
  for (const [key, s] of SESSIONS) {
    if (now - s.updatedAt > SESSION_TTL_MS) {
      SESSIONS.delete(key);
    }
  }
}

function touch(s: SessionData) {
  s.updatedAt = Date.now();
}

/* -------------------------------------------------------------------------- */
/*                              Session lifecycle                             */
/* -------------------------------------------------------------------------- */

export function getSession(phone: string): SessionData {
  sweepIfNeeded();
  let s = SESSIONS.get(phone);
  if (!s) {
    s = {
      phone,
      lang: "sw",
      expecting: "full_name",
      selectedDistrict: null,
      selectedWard: null,
      selectedStreet: null,
      streetPage: 0,
      lastLocation: null,
      delivery: null,
      checkout: {},
      cart: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    SESSIONS.set(phone, s);
  }
  return s;
}

export function resetSession(phone: string) {
  const base = getSession(phone);
  base.expecting = "full_name";
  base.lang = base.lang || "sw";
  base.fullName = null;
  base.phoneNumber = null;
  base.region = null;
  base.selectedDistrict = null;
  base.selectedWard = null;
  base.selectedStreet = null;
  base.streetPage = 0;
  base.lastLocation = null;
  base.delivery = null;
  base.checkout = {};
  base.cart = null;
  touch(base);
}

/* -------------------------------------------------------------------------- */
/*                                 Mutators                                   */
/* -------------------------------------------------------------------------- */

export function setExpecting(phone: string, expecting: Expecting) {
  const s = getSession(phone);
  s.expecting = expecting;
  touch(s);
}

export function setLang(phone: string, lang: Lang) {
  const s = getSession(phone);
  s.lang = lang;
  touch(s);
}

/** Full name (majina matatu kamili) */
export function setFullName(phone: string, fullName: string) {
  const s = getSession(phone);
  s.fullName = (fullName || "").trim();
  touch(s);
}

/** Delivery phone */
export function setPhoneNumber(phone: string, phoneNumber: string) {
  const s = getSession(phone);
  s.phoneNumber = (phoneNumber || "").trim();
  touch(s);
}

/** Outside Dar region */
export function setRegion(phone: string, region: string) {
  const s = getSession(phone);
  s.region = (region || "").trim();
  touch(s);
}

/** District/Ward/Street selections (compat with your list flow) */
export function setSelectedDistrict(phone: string, district: string | null) {
  const s = getSession(phone);
  s.selectedDistrict = district || null;
  // when district changes, clear downstream selections
  s.selectedWard = null;
  s.selectedStreet = null;
  s.streetPage = 0;
  touch(s);
}

export function setSelectedWard(phone: string, ward: string | null) {
  const s = getSession(phone);
  s.selectedWard = ward || null;
  // when ward changes, clear street
  s.selectedStreet = null;
  s.streetPage = 0;
  touch(s);
}

export function setSelectedStreet(phone: string, street: string | null) {
  const s = getSession(phone);
  s.selectedStreet = street || null;
  touch(s);
}

export function setStreetPage(phone: string, page: number) {
  const s = getSession(phone);
  s.streetPage = Math.max(0, Math.floor(page || 0));
  touch(s);
}

/** Last shared location pin */
export function setLastLocation(
  phone: string,
  lat: number,
  lon: number,
  at: number = Date.now()
) {
  const s = getSession(phone);
  s.lastLocation = { lat, lon, at };
  touch(s);
}

/** Update delivery snapshot (for quick order summaries) */
export function updateDelivery(
  phone: string,
  patch: Partial<NonNullable<SessionData["delivery"]>>
) {
  const s = getSession(phone);
  s.delivery = { ...(s.delivery ?? {}), ...patch };
  touch(s);
}

/** Checkout aggregate used by pricing and order submit */
export function updateCheckout(phone: string, patch: Partial<CheckoutState>) {
  const s = getSession(phone);
  s.checkout = { ...(s.checkout ?? {}), ...patch };
  touch(s);
}

export function getCheckout(phone: string): CheckoutState {
  return getSession(phone).checkout ?? {};
}

export function clearCheckout(phone: string) {
  const s = getSession(phone);
  s.checkout = {};
  touch(s);
}

/* -------------------------------------------------------------------------- */
/*                              Convenience getters                           */
/* -------------------------------------------------------------------------- */

export function getLang(phone: string): Lang {
  return getSession(phone).lang;
}

export function getExpecting(phone: string): Expecting {
  return getSession(phone).expecting;
}

export function getSelectedDistrict(phone: string): string | null | undefined {
  return getSession(phone).selectedDistrict;
}

export function getSelectedWard(phone: string): string | null | undefined {
  return getSession(phone).selectedWard;
}

export function getSelectedStreet(phone: string): string | null | undefined {
  return getSession(phone).selectedStreet;
}

export function getStreetPage(phone: string): number {
  return getSession(phone).streetPage ?? 0;
}

/* -------------------------------------------------------------------------- */
/*                                 Debug utils                                */
/* -------------------------------------------------------------------------- */

export function _dumpSession(phone: string): SessionData {
  return getSession(phone);
}

export function _count(): number {
  return SESSIONS.size;
}

export function _resetAll() {
  SESSIONS.clear();
}
