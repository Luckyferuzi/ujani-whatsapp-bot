import type { Lang } from "./i18n.js";
import db from "./db/knex.js";

export type State =
  | "IDLE"
  | "ASK_IF_DAR"
  | "ASK_DISTRICT"
  | "ASK_PLACE"
  | "SHOW_PRICE"
  | "WAIT_PROOF";

export type FlowStep =
  | "ASK_IF_DAR"
  | "ASK_IN_DAR_MODE"
  | "ASK_NAME_IN"
  | "ASK_PHONE_IN"
  | "ASK_GPS"
  | "ASK_NAME_PICK"
  | "ASK_PHONE_PICK"
  | "ASK_NAME_OUT"
  | "ASK_PHONE_OUT"
  | "ASK_REGION_OUT"
  | "TRACK_ASK_NAME";

export type CartItem = {
  sku: string;
  name: string;
  qty: number;
  unitPrice: number;
};

export type PendingQty = {
  sku: string;
  name: string;
  unitPrice: number;
};

export type ContactState = {
  name?: string;
  phone?: string;
  region?: string;
};

export interface Session {
  state: State;
  lang: Lang;
  flow: FlowStep | null;
  cart: CartItem[];
  pending: CartItem | null;
  pendingQty: PendingQty | null;
  contact: ContactState;
  district?: string;
  place?: string;
  distanceKm?: number;
  price?: number;
  lastOrderId?: number | null;
}

export interface ChatSessionRow {
  wa_id: string;
  payload: unknown;
  expires_at: string | Date | null;
}

export interface ChatSessionRepo {
  get(waId: string): Promise<ChatSessionRow | null>;
  upsert(args: { waId: string; payload: Session; expiresAt: Date }): Promise<void>;
  delete(waId: string): Promise<void>;
  clearExpired(before: Date): Promise<number>;
}

const DEFAULT_TTL_HOURS = 24;

export const DEFAULT_SESSION: Session = {
  state: "IDLE",
  lang: "sw",
  flow: null,
  cart: [],
  pending: null,
  pendingQty: null,
  contact: {},
  district: undefined,
  place: undefined,
  distanceKm: undefined,
  price: undefined,
  lastOrderId: null,
};

function getSessionTtlHours(): number {
  const raw = Number(process.env.WA_CHAT_SESSION_TTL_HOURS ?? DEFAULT_TTL_HOURS);
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_TTL_HOURS;
  return raw;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeCartItem(value: unknown): CartItem | null {
  if (!isRecord(value)) return null;

  const sku = asString(value.sku);
  const name = asString(value.name);
  const qty = asNumber(value.qty);
  const unitPrice = asNumber(value.unitPrice);

  if (!sku || !name || !qty || qty <= 0 || unitPrice == null) return null;
  return { sku, name, qty, unitPrice };
}

function normalizePendingQty(value: unknown): PendingQty | null {
  if (!isRecord(value)) return null;

  const sku = asString(value.sku);
  const name = asString(value.name);
  const unitPrice = asNumber(value.unitPrice);

  if (!sku || !name || unitPrice == null) return null;
  return { sku, name, unitPrice };
}

function normalizeContact(value: unknown): ContactState {
  if (!isRecord(value)) return {};
  const contact: ContactState = {};
  const name = asString(value.name);
  const phone = asString(value.phone);
  const region = asString(value.region);
  if (name) contact.name = name;
  if (phone) contact.phone = phone;
  if (region) contact.region = region;
  return contact;
}

export function normalizeSession(value: unknown): Session {
  const session: Session = {
    ...DEFAULT_SESSION,
    cart: [],
    contact: {},
  };

  if (!isRecord(value)) return session;

  const state = asString(value.state);
  if (
    state === "IDLE" ||
    state === "ASK_IF_DAR" ||
    state === "ASK_DISTRICT" ||
    state === "ASK_PLACE" ||
    state === "SHOW_PRICE" ||
    state === "WAIT_PROOF"
  ) {
    session.state = state;
  }

  const lang = asString(value.lang);
  if (lang === "sw" || lang === "en") session.lang = lang;

  const flow = asString(value.flow);
  if (
    flow === "ASK_IF_DAR" ||
    flow === "ASK_IN_DAR_MODE" ||
    flow === "ASK_NAME_IN" ||
    flow === "ASK_PHONE_IN" ||
    flow === "ASK_GPS" ||
    flow === "ASK_NAME_PICK" ||
    flow === "ASK_PHONE_PICK" ||
    flow === "ASK_NAME_OUT" ||
    flow === "ASK_PHONE_OUT" ||
    flow === "ASK_REGION_OUT" ||
    flow === "TRACK_ASK_NAME"
  ) {
    session.flow = flow;
  }

  if (Array.isArray(value.cart)) {
    session.cart = value.cart
      .map((item) => normalizeCartItem(item))
      .filter((item): item is CartItem => !!item);
  }

  session.pending = normalizeCartItem(value.pending);
  session.pendingQty = normalizePendingQty(value.pendingQty);
  session.contact = normalizeContact(value.contact);
  session.district = asString(value.district);
  session.place = asString(value.place);
  session.distanceKm = asNumber(value.distanceKm);
  session.price = asNumber(value.price);

  const lastOrderId = asNumber(value.lastOrderId);
  session.lastOrderId = lastOrderId ?? null;

  return session;
}

function cloneSession(session: Session): Session {
  return normalizeSession(session);
}

function computeExpiry(now = new Date(), ttlHours = getSessionTtlHours()): Date {
  return new Date(now.getTime() + ttlHours * 60 * 60 * 1000);
}

function isExpired(expiresAt: string | Date | null | undefined, now = new Date()): boolean {
  if (!expiresAt) return false;
  const value = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(value.getTime())) return false;
  return value.getTime() <= now.getTime();
}

function hasTransientState(session: Session): boolean {
  return !!(
    session.flow ||
    session.state !== "IDLE" ||
    session.cart.length > 0 ||
    session.pending ||
    session.pendingQty ||
    session.contact.name ||
    session.contact.phone ||
    session.contact.region ||
    session.district ||
    session.place ||
    session.distanceKm != null ||
    session.price != null ||
    session.lastOrderId
  );
}

function shouldPersist(session: Session): boolean {
  return session.lang !== "sw" || hasTransientState(session);
}

function createDbRepo(): ChatSessionRepo {
  return {
    async get(waId) {
      const row = await db("chat_sessions")
        .where({ wa_id: waId })
        .select("wa_id", "payload", "expires_at")
        .first();
      return (row as ChatSessionRow) ?? null;
    },
    async upsert({ waId, payload, expiresAt }) {
      await db("chat_sessions")
        .insert({
          wa_id: waId,
          payload,
          expires_at: expiresAt,
          updated_at: db.fn.now(),
        })
        .onConflict("wa_id")
        .merge({
          payload,
          expires_at: expiresAt,
          updated_at: db.fn.now(),
        });
    },
    async delete(waId) {
      await db("chat_sessions").where({ wa_id: waId }).del();
    },
    async clearExpired(before) {
      const deleted = await db("chat_sessions").where("expires_at", "<=", before).del();
      return Number(deleted ?? 0);
    },
  };
}

export function createSessionStore(repo: ChatSessionRepo) {
  async function loadSession(userId: string): Promise<Session> {
    if (!userId) return cloneSession(DEFAULT_SESSION);

    const row = await repo.get(userId);
    if (!row) return cloneSession(DEFAULT_SESSION);

    if (isExpired(row.expires_at)) {
      await repo.delete(userId).catch(() => {});
      return cloneSession(DEFAULT_SESSION);
    }

    return normalizeSession(row.payload);
  }

  async function saveSession(userId: string, data: Session): Promise<Session> {
    const normalized = normalizeSession(data);
    if (!userId) return normalized;

    if (!shouldPersist(normalized)) {
      await repo.delete(userId).catch(() => {});
      return normalized;
    }

    await repo.upsert({
      waId: userId,
      payload: normalized,
      expiresAt: computeExpiry(),
    });

    return normalized;
  }

  async function resetSession(userId: string): Promise<Session> {
    const current = await loadSession(userId);
    const next: Session = {
      ...DEFAULT_SESSION,
      lang: current.lang,
    };
    return saveSession(userId, next);
  }

  async function clearExpiredSessions(): Promise<number> {
    return repo.clearExpired(new Date());
  }

  async function updateSession(
    userId: string,
    updater: (current: Session) => Session | Promise<Session>
  ): Promise<Session> {
    const current = await loadSession(userId);
    const next = await updater(cloneSession(current));
    return saveSession(userId, next);
  }

  return {
    loadSession,
    saveSession,
    resetSession,
    clearExpiredSessions,
    updateSession,
  };
}

const store = createSessionStore(createDbRepo());

export const loadSession = store.loadSession.bind(store);
export const saveSession = store.saveSession.bind(store);
export const resetSession = store.resetSession.bind(store);
export const clearExpiredSessions = store.clearExpiredSessions.bind(store);
export const updateSession = store.updateSession.bind(store);
