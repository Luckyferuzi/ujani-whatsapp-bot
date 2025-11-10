// src/whatsapp.ts
import crypto from 'crypto';
import { env } from './config.js';

/* -------------------------------------------------------------------------- */
/*                              Environment helpers                           */
/* -------------------------------------------------------------------------- */

function getToken(): string {
  // Support common naming variants without adding new required envs.
  return (
    (env as any).WABA_TOKEN ||
    (env as any).WHATSAPP_TOKEN ||
    (env as any).ACCESS_TOKEN ||
    ''
  );
}

function getPhoneNumberId(): string {
  return (
    (env as any).PHONE_NUMBER_ID ||
    (env as any).WHATSAPP_PHONE_NUMBER_ID ||
    (env as any).WABA_PHONE_ID ||
    ''
  );
}

const GRAPH_BASE = 'https://graph.facebook.com';
const GRAPH_VER = (env as any).GRAPH_API_VERSION || 'v19.0';

/* -------------------------------------------------------------------------- */
/*                                HTTP client                                 */
/* -------------------------------------------------------------------------- */

async function apiFetch(path: string, body: unknown) {
  const token = getToken();
  const url = `${GRAPH_BASE}/${GRAPH_VER}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    try {
      const json = text ? JSON.parse(text) : null;
      console.error('[whatsapp] API error', res.status, json || text);
    } catch {
      console.error('[whatsapp] API error', res.status, text);
    }
  }
  return res;
}

/* -------------------------------------------------------------------------- */
/*                             WhatsApp senders                                */
/* -------------------------------------------------------------------------- */

export async function sendText(to: string, body: string) {
  const phoneId = getPhoneNumberId();
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
}) {
  const phoneId = getPhoneNumberId();
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
  buttons: Button[]
) {
  const phoneId = getPhoneNumberId();
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

export async function markAsRead(messageId?: string) {
  if (!messageId) return;
  const phoneId = getPhoneNumberId();
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
    const APP_SECRET = (env as any).APP_SECRET as string | undefined;
    if (!APP_SECRET) {
      console.warn('[verify] APP_SECRET missing');
      return false;
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
        (req.headers?.['x-hub-signature-256'] as string) ||
        (req.headers?.['x-hub-signature'] as string); // legacy fallback
      raw = (req as any).rawBody;
    }

    if (!raw || !header) {
      console.warn('[verify] missing raw body or signature header');
      return false;
    }

    const buf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw, 'utf8');
    const digest = crypto.createHmac('sha256', APP_SECRET).update(buf).digest('hex');
    const expected = `sha256=${digest}`;
    const got = header.trim();

    const ok =
      got.startsWith('sha256=') ? timingSafeEqual(got, expected)
      : got.startsWith('sha1=')   // very old fallback (rare)
        ? timingSafeEqual(got.replace(/^sha1=/, 'sha256='), expected)
        : false;

    if (!ok) console.warn('[verify] signature mismatch');
    return ok;
  } catch (e) {
    console.warn('[verify] error:', e);
    return false;
  }
}
