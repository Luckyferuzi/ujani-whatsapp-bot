// src/whatsapp.ts
import crypto from 'crypto';
import { env } from './config.js';
import {
  getAppSecretEffective,
  getGraphApiVersionEffective,
  getPhoneNumberIdEffective,
getWhatsAppTokenEffective,
getWabaIdEffective,
} from './runtime/companySettings.js';


/* -------------------------------------------------------------------------- */
/*                              Environment helpers                           */
/* -------------------------------------------------------------------------- */

function getToken(): string {
  // Prefer DB-backed runtime config (web Setup Wizard), then env.
  const fromDb = getWhatsAppTokenEffective();
  if (fromDb) return fromDb;

  // Support common naming variants without adding new required envs.
  return (
    (env as any).WABA_TOKEN ||
    (env as any).WHATSAPP_TOKEN ||
    (env as any).ACCESS_TOKEN ||
    ''
  );
}

function getPhoneNumberId(): string {
  // Prefer DB-backed runtime config (web Setup Wizard), then env.
  const fromDb = getPhoneNumberIdEffective();
  if (fromDb) return fromDb;

  return (
    (env as any).PHONE_NUMBER_ID ||
    (env as any).WHATSAPP_PHONE_NUMBER_ID ||
    (env as any).WABA_PHONE_ID ||
    ''
  );
}

// When you have multiple business numbers under one WABA, WhatsApp webhooks include
// a metadata.phone_number_id telling you which number the user messaged.
//
// We cache the most recent phone_number_id per customer wa_id so the bot can
// reply from the correct number without having to thread phone_number_id through
// every internal call site.
const RECENT_PHONE_BY_CUSTOMER = new Map<string, string>();

export function rememberCustomerPhoneNumberId(
  customerWaId: string,
  phoneNumberId: string | null | undefined
) {
  if (!customerWaId) return;
  const pid = (phoneNumberId ?? "").toString().trim();
  if (!pid) return;
  RECENT_PHONE_BY_CUSTOMER.set(customerWaId, pid);
}

export function getRememberedPhoneNumberId(customerWaId: string): string | null {
  return RECENT_PHONE_BY_CUSTOMER.get(customerWaId) ?? null;
}

function resolvePhoneNumberId(explicit?: string | null, customerWaId?: string | null): string {
  if (explicit && String(explicit).trim()) return String(explicit).trim();
  if (customerWaId) {
    const remembered = getRememberedPhoneNumberId(customerWaId);
    if (remembered) return remembered;
  }
  return getPhoneNumberId();
}

const GRAPH_BASE = 'https://graph.facebook.com';
function getGraphVer(): string {
  const fromDb = getGraphApiVersionEffective();
  if (fromDb) return fromDb;

  // Fallbacks (so DB not set doesn’t break runtime)
  return (
    (env as any).GRAPH_API_VERSION ||
    (env as any).GRAPH_VERSION ||
    "v24.0"
  );
}


/* -------------------------------------------------------------------------- */
/*                                HTTP client                                 */
/* -------------------------------------------------------------------------- */


async function apiGet(path: string) {
  const token = getToken();
  const url = `${GRAPH_BASE}/${getGraphVer()}/${path}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

if (!res.ok) {
  const text = await res.text().catch(() => "");
  let payload: any = text;

  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text
  }

  console.error("[whatsapp] GET error", res.status, payload);

  throw new Error(
    `WhatsApp GET error ${res.status}: ${
      typeof payload === "string" ? payload : JSON.stringify(payload)
    }`
  );
}


  return res.json() as Promise<any>;
}

async function apiFetch(path: string, body: unknown) {
  const token = getToken();
  const url = `${GRAPH_BASE}/${getGraphVer()}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let payload: any = text;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      // leave payload as raw text
    }

    console.error("[whatsapp] API error", res.status, payload);

    throw new Error(
      `WhatsApp API error ${res.status}: ${
        typeof payload === "string" ? payload : JSON.stringify(payload)
      }`
    );
  }

  return res;
}

/* -------------------------------------------------------------------------- */
/*                             WhatsApp senders                                */
/* -------------------------------------------------------------------------- */

export async function sendText(
  to: string,
  body: string,
  opts?: { phoneNumberId?: string | null }
) {
  const phoneId = resolvePhoneNumberId(opts?.phoneNumberId ?? null, to);
  if (!phoneId) {
    console.warn('[whatsapp] PHONE_NUMBER_ID missing; cannot sendText');
    return;
  }
  const payload = {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body },
  };
  await apiFetch(`${phoneId}/messages`, payload);
}

type ListRow = { id: string; title: string; description?: string };
type ListSection = { title: string; rows: ListRow[] };


export async function sendListMessage(args: {
  to: string;
  header?: string;
  body: string;
  footer?: string;
  buttonText: string;
  sections: ListSection[];
  phoneNumberId?: string | null;
}) {
  const phoneId = resolvePhoneNumberId(args.phoneNumberId ?? null, args.to);
  if (!phoneId) {
    console.warn('[whatsapp] PHONE_NUMBER_ID missing; cannot sendListMessage');
    return;
  }

  const header =
    args.header && args.header.trim().length
      ? { type: 'text', text: args.header }
      : undefined;

  const payload: any = {
    messaging_product: 'whatsapp',
    to: args.to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header,
      body: { text: args.body || ' ' },
      footer: args.footer ? { text: args.footer } : undefined,
      action: {
        button: args.buttonText || 'Open',
        sections: args.sections.map((s) => ({
          title: s.title || '',
          rows: s.rows.map((r) => ({
            id: r.id,
            title: r.title,
            description: r.description,
          })),
        })),
      },
    },
  };

  await apiFetch(`${phoneId}/messages`, payload);
}

type Button = { id: string; title: string };


export async function sendButtonsMessage(
  to: string,
  body: string,
  buttons: Button[],
  opts?: { phoneNumberId?: string | null }
) {
  const phoneId = resolvePhoneNumberId(opts?.phoneNumberId ?? null, to);
  if (!phoneId) {
    console.warn('[whatsapp] PHONE_NUMBER_ID missing; cannot sendButtonsMessage');
    return;
  }
  const payload: any = {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body || ' ' },
      action: {
        buttons: (buttons || []).slice(0, 3).map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  };
  await apiFetch(`${phoneId}/messages`, payload);
}

/* -------------------------------------------------------------------------- */
/*                         Catalog & CTA URL messages                         */
/* -------------------------------------------------------------------------- */

export async function sendCatalogMessage(
  to: string,
  body: string,
  opts?: { phoneNumberId?: string | null; thumbnailProductRetailerId?: string | null }
) {
  const phoneId = resolvePhoneNumberId(opts?.phoneNumberId ?? null, to);
  if (!phoneId) {
    console.warn("[whatsapp] PHONE_NUMBER_ID missing; cannot sendCatalogMessage");
    return;
  }

  const payload: any = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "catalog_message",
      body: { text: body || " " },
      action: {
        name: "catalog_message",
        parameters: {},
      },
    },
  };

  const thumb = (opts?.thumbnailProductRetailerId ?? "").toString().trim();
  if (thumb) {
    payload.interactive.action.parameters.thumbnail_product_retailer_id = thumb;
  }

  await apiFetch(`${phoneId}/messages`, payload);
}

/**
 * CTA URL button message. WhatsApp supports only a single URL button.
 */
export async function sendCtaUrlMessage(
  to: string,
  body: string,
  displayText: string,
  url: string,
  opts?: { phoneNumberId?: string | null }
) {
  const phoneId = resolvePhoneNumberId(opts?.phoneNumberId ?? null, to);
  if (!phoneId) {
    console.warn("[whatsapp] PHONE_NUMBER_ID missing; cannot sendCtaUrlMessage");
    return;
  }

  const payload: any = {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "cta_url",
      body: { text: body || " " },
      action: {
        name: "cta_url",
        parameters: {
          display_text: displayText,
          url,
        },
      },
    },
  };

  await apiFetch(`${phoneId}/messages`, payload);
}

/* -------------------------------------------------------------------------- */
/*                           Catalog (Graph API) helpers                       */
/* -------------------------------------------------------------------------- */

export type CatalogProduct = {
  id?: string;
  retailer_id?: string;
  name?: string;
  description?: string;
  image_url?: string;
  availability?: string;
  price?: string;
  currency?: string;
};

export async function getConnectedCatalogId(
  wabaId?: string | null
): Promise<string | null> {
  const id = (wabaId ?? getWabaIdEffective() ?? "").toString().trim();
  if (!id) return null;

  const res = await apiGet(`${id}/product_catalogs?fields=id,name`);
  const data = Array.isArray(res?.data) ? res.data : [];
  const first = data[0];
  const catalogId = (first?.id ?? "").toString().trim();
  return catalogId || null;
}

export async function listCatalogProducts(
  catalogId: string
): Promise<CatalogProduct[]> {
  const id = (catalogId ?? "").toString().trim();
  if (!id) return [];

  const res = await apiGet(
    `${id}/products?fields=id,retailer_id,name,description,price,currency,availability,image_url`
  );
  return Array.isArray(res?.data) ? (res.data as CatalogProduct[]) : [];
}

/**
 * Create or update a catalog product (recommended: retailer_id == local SKU).
 */
export async function upsertCatalogProduct(
  catalogId: string,
  input: {
    retailer_id: string;
    name: string;
    description?: string;
    image_url: string;
    price_tzs: number;
    currency?: string;
    availability?: "in stock" | "out of stock";
    allow_upsert?: boolean;
  }
) {
  const id = (catalogId ?? "").toString().trim();
  if (!id) throw new Error("missing_catalog_id");

  const retailerId = (input.retailer_id ?? "").toString().trim();
  if (!retailerId) throw new Error("missing_retailer_id");

  const currency = (input.currency ?? "TZS").toString().trim() || "TZS";
  const priceNum = Math.max(0, Math.floor(Number(input.price_tzs) || 0));

  const payload: any = {
    retailer_id: retailerId,
    name: String(input.name || "").trim(),
    description: input.description ? String(input.description).trim() : undefined,
    image_url: String(input.image_url || "").trim(),
    availability: input.availability ?? "in stock",
    currency,
    price: `${priceNum}.00`,
    allow_upsert: input.allow_upsert !== false,
  };

  Object.keys(payload).forEach((k) => {
    if (payload[k] === undefined || payload[k] === "") delete payload[k];
  });

  return apiFetch(`${id}/products`, payload);
}

export async function markAsRead(
  messageId?: string,
  opts?: { phoneNumberId?: string | null }
) {
  if (!messageId) return;
  const phoneId = resolvePhoneNumberId(opts?.phoneNumberId ?? null);
  if (!phoneId) {
    console.warn('[whatsapp] PHONE_NUMBER_ID missing; cannot markAsRead');
    return;
  }
  const payload = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  };
  await apiFetch(`${phoneId}/messages`, payload);
}

/* -------------------------------------------------------------------------- */
/*                         Payment instruction helper                         */
/* -------------------------------------------------------------------------- */
/**
 * Sends a short block listing payment options (if configured).
 * It’s optional; if nothing is configured, the function is a no-op.
 *
 * Supported envs (all optional — use what you already have in config.ts):
 * - PAYMENT_LINES: a multiline string; each line is shown as-is
 * - PAYMENT_1_LABEL / PAYMENT_1_NUMBER
 * - PAYMENT_2_LABEL / PAYMENT_2_NUMBER
 * - PAYMENT_3_LABEL / PAYMENT_3_NUMBER
 */
export async function sendPaymentInstructions(to: string, total: number) {
  const phoneId = getPhoneNumberId();
  if (!phoneId) {
    console.warn('[whatsapp] PHONE_NUMBER_ID missing; cannot send payment instructions');
    return;
  }

  const lines: string[] = [];

  const LINES = (env as any).PAYMENT_LINES as string | undefined;
  if (LINES) {
    lines.push(...LINES.split(/\r?\n/).filter(Boolean));
  } else {
    const add = (i: number) => {
      const label = (env as any)[`PAYMENT_${i}_LABEL`];
      const num = (env as any)[`PAYMENT_${i}_NUMBER`];
      if (label && num) lines.push(`• ${label}: ${num}`);
    };
    add(1); add(2); add(3);
  }

  if (!lines.length) {
    // Nothing configured — do nothing to avoid noise
    return;
  }

  const msg =
    `💳 Payment\n` +
    `Total: ${Math.round(total).toLocaleString('sw-TZ')} TZS\n` +
    lines.join('\n');

  await sendText(to, msg);
}

/* -------------------------------------------------------------------------- */
/*                           Webhook signature check                           */
/* -------------------------------------------------------------------------- */
/**
 * Verifies Meta's X-Hub-Signature-256.
 * Accepts either (req) or (rawBody, header).
 * Requires env.APP_SECRET to be set to your Meta App Secret.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

export function verifySignature(arg1: any, arg2?: string): boolean {
  try {
    const APP_SECRET = getAppSecretEffective() ?? ((env as any).APP_SECRET as string | undefined);

    // In dev / debugging, don't block just because APP_SECRET is missing
    if (!APP_SECRET) {
      console.warn(
        "[verify] APP_SECRET missing – skipping signature verification"
      );
      return true;
    }

    let raw: Buffer | string | undefined;
    let header: string | undefined;

    if (arg2 !== undefined) {
      // form: (rawBody, header)
      raw = arg1 as Buffer | string;
      header = arg2;
    } else {
      // form: (req)
      const req = arg1 as { headers?: any; rawBody?: Buffer | string };
      header =
        (req.headers?.["x-hub-signature-256"] as string) ||
        (req.headers?.["x-hub-signature"] as string); // legacy fallback
      raw = (req as any).rawBody;
    }

    if (!raw || !header) {
      console.warn(
        "[verify] missing raw body or signature header – skipping verification"
      );
      return true;
    }

    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, "utf8");
    const digest = crypto
      .createHmac("sha256", APP_SECRET)
      .update(buf)
      .digest("hex");
    const expected = `sha256=${digest}`;
    const got = header.trim();

    const ok =
      got.startsWith("sha256=")
        ? timingSafeEqual(got, expected)
        : got.startsWith("sha1=")
        ? timingSafeEqual(got.replace(/^sha1=/, "sha256="), expected)
        : false;

    if (!ok) {
      console.warn(
        "[verify] signature mismatch",
        "\n expected:",
        expected,
        "\n got:",
        got
      );
    }

    return ok;
  } catch (e) {
    console.warn("[verify] error, skipping verification:", e);
    return true;
  }
}

export async function downloadMedia(
  mediaId: string
): Promise<{ buffer: Buffer; contentType: string }> {
  if (!mediaId) throw new Error("Missing mediaId");

  // 1) Metadata: url + mime_type
  const meta = await apiGet(mediaId);
  const url = meta.url as string | undefined;
  const mimeType =
    (meta.mime_type as string | undefined) ?? "application/octet-stream";

  if (!url) {
    throw new Error("Media URL missing from WhatsApp response");
  }

  // 2) Download file
  const token = getToken();
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[whatsapp] media download error", res.status, text);
    throw new Error(`Failed to download media (${res.status})`);
  }

  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  return { buffer, contentType: mimeType };
}

export async function uploadMedia(
  buffer: Buffer,
  filename: string,
  contentType: string,
  opts?: { phoneNumberId?: string | null }
): Promise<string> {
  const phoneId = resolvePhoneNumberId(opts?.phoneNumberId ?? null);
  if (!phoneId) {
    throw new Error("PHONE_NUMBER_ID missing; cannot upload media");
  }

  const token = getToken();

  const form = new FormData();
  // Node 20 has Blob & FormData globally
  const blob = new Blob([buffer], { type: contentType });
  form.append("file", blob, filename);
  form.append("messaging_product", "whatsapp");
  form.append("type", contentType);

  const url = `${GRAPH_BASE}/${getGraphVer()}/${phoneId}/media`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form as any,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("[whatsapp] upload media error", res.status, text);
    throw new Error(`Failed to upload media (${res.status})`);
  }

  const body = (await res.json()) as { id: string };
  if (!body.id) {
    throw new Error("WhatsApp did not return media id");
  }
  return body.id;
}

export async function sendMediaById(
  to: string,
  kind: "image" | "video" | "audio" | "document",
  mediaId: string,
  caption?: string,
  opts?: { phoneNumberId?: string | null }
) {
  const phoneId = resolvePhoneNumberId(opts?.phoneNumberId ?? null);
  if (!phoneId) {
    console.warn("[whatsapp] PHONE_NUMBER_ID missing; cannot sendMediaById");
    return;
  }

  const payload: any = {
    messaging_product: "whatsapp",
    to,
    type: kind,
    [kind]: {
      id: mediaId,
    },
  };

  if (caption && (kind === "image" || kind === "video" || kind === "document")) {
    payload[kind].caption = caption;
  }

  await apiFetch(`${phoneId}/messages`, payload);
}

export type WhatsAppBusinessProfile = {
  about?: string | null;
  address?: string | null;
  description?: string | null;
  email?: string | null;
  profile_picture_url?: string | null;
  websites?: string[] | null;
  vertical?: string | null;
};

export type WhatsAppPhoneNumberSummary = {
  ok: true;
  id: string;
  display_phone_number: string | null;
  verified_name: string | null;
};

export async function getPhoneNumberSummary(): Promise<WhatsAppPhoneNumberSummary | null> {
  const phoneId = getPhoneNumberId();
  if (!phoneId) return null;

  try {
    const data = await apiGet(`${phoneId}?fields=display_phone_number,verified_name`);
    return {
      ok: true,
      id: data?.id ?? phoneId,
      display_phone_number: data?.display_phone_number ?? null,
      verified_name: data?.verified_name ?? null,
    };
  } catch (err: any) {
    console.warn("[whatsapp] getPhoneNumberSummary failed:", err?.message ?? String(err));
    return null;
  }
}
const PROFILE_FIELDS_PRIMARY =
  "about,address,description,email,profile_picture_url,websites,vertical";

// Some Meta setups randomly 500 on these fields; safe fallback:
const PROFILE_FIELDS_SAFE =
  "about,address,description,email,websites";

export async function getBusinessProfile(): Promise<WhatsAppBusinessProfile | null> {
  const phoneId = getPhoneNumberId();
  if (!phoneId) return null;

  try {
let data: any;

try {
  data = await apiGet(`${phoneId}/whatsapp_business_profile?fields=${PROFILE_FIELDS_PRIMARY}`);
} catch (e) {
  // fallback to safe fields (prevents WA: Unknown due to Meta 131000)
  data = await apiGet(`${phoneId}/whatsapp_business_profile?fields=${PROFILE_FIELDS_SAFE}`);
}


    // Meta responses often come as { data: [ {...} ] }
    const profile = Array.isArray(data?.data) ? data.data[0] : data;
    if (!profile) return null;

    return {
      about: profile.about ?? null,
      address: profile.address ?? null,
      description: profile.description ?? null,
      email: profile.email ?? null,
      profile_picture_url: profile.profile_picture_url ?? null,
      websites: Array.isArray(profile.websites) ? profile.websites : [],
      vertical: profile.vertical ?? null,
    };
  } catch (err: any) {
    // Avoid crashing / noisy logs. Common causes:
    // - PHONE_NUMBER_ID wrong
    // - token missing permissions
    // - token doesn't belong to this WABA / number
    const msg = err?.message ?? String(err);

    // If apiGet throws an Error with the full JSON string, keep it readable
    console.warn("[whatsapp] getBusinessProfile failed:", msg);

    return null;
  }
}

export async function updateBusinessProfile(update: WhatsAppBusinessProfile): Promise<void> {
  const phoneId = getPhoneNumberId();
  if (!phoneId) {
    console.warn("[whatsapp] PHONE_NUMBER_ID missing; cannot update business profile");
    return;
  }

  // Only send fields that are present (avoid overwriting with nulls unintentionally)
  const payload: any = {
    messaging_product: "whatsapp",
  };

  const pick = (k: keyof WhatsAppBusinessProfile) => {
    const v = update[k];
    if (v === undefined) return;
    payload[k] = v;
  };

  pick("about");
  pick("address");
  pick("description");
  pick("email");
  pick("profile_picture_url");
  pick("vertical");

  if (update.websites !== undefined) {
    // WhatsApp typically supports up to 2 websites; we enforce that here
    payload.websites = (update.websites ?? []).filter(Boolean).slice(0, 2);
  }

  // Uses existing apiFetch() POST helper
  await apiFetch(`${phoneId}/whatsapp_business_profile`, payload);
}
