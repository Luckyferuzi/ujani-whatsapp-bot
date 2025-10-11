// src/whatsapp.ts
// Robust WhatsApp Cloud API helpers.
// - Accepts flexible inputs (id can be string or { id: string }) and normalizes.
// - Guarantees required interactive fields (avoids WA #100 errors).
// - No new env vars; uses your existing token & phone id envs.

import { request } from "undici";
import crypto from "crypto";

/* ------------------------------ Env ------------------------------ */

const ACCESS_TOKEN =
  process.env.WHATSAPP_ACCESS_TOKEN ||
  process.env.WHATSAPP_TOKEN ||
  "";

const PHONE_NUMBER_ID =
  process.env.WHATSAPP_PHONE_NUMBER_ID ||
  process.env.WHATSAPP_PHONE_ID ||
  process.env.WHATSAPP_SENDER_ID ||
  "";

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v20.0";

/* ----------------------------- Utilities ----------------------------- */

function requiredEnv(name: string, value: string) {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Please set it to your WhatsApp Cloud value.`
    );
  }
}

function normalizeTo(to: string): string {
  // strip spaces/dashes etc. keep digits and optional leading +
  return (to || "").toString().trim().replace(/[^\d+]/g, "");
}

function toStringStrict(v: any): string {
  if (typeof v === "string") return v;
  if (v == null) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v?.id === "string") return v.id;
  if (typeof v?.title === "string") return v.title;
  if (typeof v?.name === "string") return v.name;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/* --------------------------- Clamping ----------------------------- */

const MAX_ROW_TITLE = 24;
const MAX_ROW_DESC = 72;
const MAX_SECTION_TITLE = 24;
const MAX_BUTTON_TITLE = 20;
const MAX_HEADER_TEXT = 60;
const MAX_BODY_TEXT = 1024;

function clamp(s: any, n: number): string {
  const str = toStringStrict(s);
  return str.length > n ? str.slice(0, n - 1) + "…" : str;
}
function clampRowTitle(s: any) { return clamp(s, MAX_ROW_TITLE); }
function clampRowDesc(s: any) { return clamp(s, MAX_ROW_DESC); }
function clampSection(s: any) { return clamp(s, MAX_SECTION_TITLE); }
function clampHeader(s: any) { return clamp(s, MAX_HEADER_TEXT); }
function clampBody(s: any) { return clamp(s, MAX_BODY_TEXT); }
function clampButtonTitle(s: any) { return clamp(s, MAX_BUTTON_TITLE); }

/* ------------------------- Low-level call ------------------------- */

async function callGraph(body: Record<string, any>): Promise<void> {
  requiredEnv("WHATSAPP_ACCESS_TOKEN/WHATSAPP_TOKEN", ACCESS_TOKEN);
  requiredEnv(
    "WHATSAPP_PHONE_NUMBER_ID/WHATSAPP_PHONE_ID/WHATSAPP_SENDER_ID",
    PHONE_NUMBER_ID
  );

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PHONE_NUMBER_ID}/messages`;

  const { statusCode, body: res } = await request(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      ...body,
    }),
  });

  if (statusCode >= 400) {
    const text = await res.text();
    throw new Error(`WhatsApp send failed (${statusCode}): ${text}`);
  }
  res.resume(); // drain
}

/* ----------------------------- Public API ----------------------------- */

export async function sendMessage(payload: Record<string, any>): Promise<void> {
  await callGraph(payload);
}

/** Send plain text (guarantees non-empty). */
export async function sendText(args: { to: string; body: any }): Promise<void> {
  const to = normalizeTo(args.to);
  const bodyText = clampBody(args.body ?? "");
  await callGraph({
    to,
    type: "text",
    text: { body: bodyText || "…" },
  });
}

/* ---------------- Permissive input types to avoid TS friction ---------------- */

export type ListRowInput = {
  id: any;                 // accept string or { id: string } etc.
  title: any;
  description?: any;
};
export type ListSectionInput = {
  title?: any;
  rows: ListRowInput[];
};
export type ButtonInput = {
  id: any;                 // accept string or { id: string }
  title: any;
};

/* ---------------------- Interactive: LIST ---------------------- */

export async function sendInteractiveList(args: {
  to: string;
  header?: any;
  body?: any;             // optional; will fill if empty
  buttonText?: any;
  sections: ListSectionInput[];
}): Promise<void> {
  const to = normalizeTo(args.to);

  const safeSections = (args.sections || []).map((s) => {
    const safeRows = (s.rows || []).slice(0, 10).map((r) => {
      // Normalize id and strings
      const idRaw = r.id;
      const id =
        typeof idRaw === "string"
          ? idRaw
          : typeof idRaw?.id === "string"
          ? idRaw.id
          : toStringStrict(idRaw);
      const title = clampRowTitle(r.title ?? id ?? "—");
      const descRaw = toStringStrict(r.description);
      const description =
        descRaw && descRaw.trim() ? clampRowDesc(descRaw) : undefined;
      return { id, title, description };
    });
    return {
      title: s.title ? clampSection(s.title) : undefined,
      rows: safeRows,
    };
  });

  const bodyRaw = toStringStrict(args.body);
  const bodyText = clampBody(bodyRaw && bodyRaw.trim() ? bodyRaw : "Please choose an option");

  await callGraph({
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: args.header
        ? { type: "text", text: clampHeader(args.header) }
        : undefined,
      body: { text: bodyText },
      action: {
        button: clampButtonTitle(args.buttonText || "Open"),
        sections: safeSections,
      },
    },
  });
}

/* -------------------- Interactive: BUTTONS (<=3) -------------------- */

export async function sendInteractiveButtons(args: {
  to: string;
  body?: any;               // optional; will fill if empty
  buttons: ButtonInput[];
}): Promise<void> {
  const to = normalizeTo(args.to);
  const safeButtons = (args.buttons || []).slice(0, 3).map((b) => {
    const idRaw = b.id;
    const id =
      typeof idRaw === "string"
        ? idRaw
        : typeof idRaw?.id === "string"
        ? idRaw.id
        : toStringStrict(idRaw);
    const title = clampButtonTitle(b.title ?? id ?? "—");
    return { type: "reply" as const, reply: { id, title } };
  });

  const bodyRaw = toStringStrict(args.body);
  const bodyText = clampBody(bodyRaw && bodyRaw.trim() ? bodyRaw : "Please choose");

  await callGraph({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: { buttons: safeButtons },
    },
  });
}

/* ----------------- Optional: webhook signature check ----------------- */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader?: string
): boolean {
  const appSecret = process.env.APP_SECRET || "";
  if (!appSecret) return true;
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", appSecret)
    .update(typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody)
    .digest("hex");

  const got = signatureHeader.replace(/^sha256=/, "").trim();
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(got, "hex")
    );
  } catch {
    return false;
  }
}

/* ---------------------------- Default export ---------------------------- */

const WhatsApp = {
  sendMessage,
  sendText,
  sendInteractiveList,
  sendInteractiveButtons,
  verifyWebhookSignature,
};

export default WhatsApp;
