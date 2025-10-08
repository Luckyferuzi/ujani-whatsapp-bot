// src/whatsapp.ts
// WhatsApp Cloud API helpers used across the bot.
// - Exports object-arg helpers that your webhook calls:
//     sendText({ to, body })
//     sendInteractiveList({ to, header, body, buttonText, sections })
//     sendInteractiveButtons({ to, body, buttons })
// - Also exposes a low-level sendMessage(payload) passthrough.
// - No new envs required. Uses your existing token & phone number id.
// - Sensible clamping to WhatsApp limits to avoid rejections.

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

const GRAPH_VERSION = "v20.0"; // fixed default; no new env required

/* ----------------------------- Guards ----------------------------- */

function requiredEnv(name: string, value: string) {
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Please set it to your WhatsApp Cloud value.`
    );
  }
}

function normalizeTo(to: string): string {
  return (to || "").toString().trim().replace(/[^\d+]/g, "");
}

/* --------------------------- Clamping ----------------------------- */

const MAX_ROW_TITLE = 24;
const MAX_ROW_DESC = 72;
const MAX_SECTION_TITLE = 24;
const MAX_BUTTON_TITLE = 20;
const MAX_HEADER_TEXT = 60;
const MAX_BODY_TEXT = 1024;

function clamp(str: any, max: number): string {
  const s = (str ?? "").toString();
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

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

/* --------------------------- Public API --------------------------- */

export async function sendMessage(payload: Record<string, any>): Promise<void> {
  await callGraph(payload);
}

/** Send plain text. */
export async function sendText(args: { to: string; body: string }): Promise<void> {
  const to = normalizeTo(args.to);
  await callGraph({
    to,
    type: "text",
    text: { body: clamp(args.body, MAX_BODY_TEXT) },
  });
}

/**
 * Send interactive LIST.
 * @example
 * sendInteractiveList({
 *   to,
 *   header: "Choose Ward",
 *   body: "District: Ilala",
 *   buttonText: "Open",
 *   sections: [{ title: "Wards", rows: [{ id:"ward:Kivukoni", title:"Kivukoni" }]}]
 * })
 */
export async function sendInteractiveList(args: {
  to: string;
  header?: string;
  body: string;
  buttonText?: string;
  sections: {
    title?: string;
    rows: { id: string; title: string; description?: string }[];
  }[];
}): Promise<void> {
  const to = normalizeTo(args.to);

  const safeSections = (args.sections || []).map((s) => ({
    title: s.title ? clamp(s.title, MAX_SECTION_TITLE) : undefined,
    rows: (s.rows || []).slice(0, 10).map((r) => ({
      id: r.id,
      title: clamp(r.title || "", MAX_ROW_TITLE),
      description:
        r.description && r.description.trim()
          ? clamp(r.description, MAX_ROW_DESC)
          : undefined,
    })),
  }));

  await callGraph({
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: args.header
        ? { type: "text", text: clamp(args.header, MAX_HEADER_TEXT) }
        : undefined,
      body: { text: clamp(args.body, MAX_BODY_TEXT) },
      action: {
        button: clamp(args.buttonText || "Open", MAX_BUTTON_TITLE),
        sections: safeSections,
      },
    },
  });
}

/**
 * Send interactive BUTTONS (up to 3).
 * @example
 * sendInteractiveButtons({
 *   to,
 *   body: "Confirm delivery address?",
 *   buttons: [{ id:"confirm_address", title:"Confirm" }, { id:"edit_address", title:"Edit" }]
 * })
 */
export async function sendInteractiveButtons(args: {
  to: string;
  body: string;
  buttons: { id: string; title: string }[];
}): Promise<void> {
  const to = normalizeTo(args.to);
  const safeButtons = (args.buttons || []).slice(0, 3).map((b) => ({
    type: "reply" as const,
    reply: { id: b.id, title: clamp(b.title || "", MAX_BUTTON_TITLE) },
  }));

  await callGraph({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: clamp(args.body, MAX_BODY_TEXT) },
      action: { buttons: safeButtons },
    },
  });
}

/* ----------------- Optional: webhook signature check ----------------- */
/**
 * Verify Meta's X-Hub-Signature-256 header. If APP_SECRET is not set, returns true.
 * Usage: verifyWebhookSignature(rawBody, req.headers["x-hub-signature-256"])
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader?: string
): boolean {
  const appSecret = process.env.APP_SECRET || "";
  if (!appSecret) return true; // not enforced
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
