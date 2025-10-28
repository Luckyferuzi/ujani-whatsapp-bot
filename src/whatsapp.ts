// src/whatsapp.ts
// WhatsApp Cloud API helpers (flexible signatures to match existing calls)

import { Request } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from './config.js';

const GRAPH_BASE = 'https://graph.facebook.com';
const GRAPH_VER = 'v19.0'; // keep in sync with your app
const MSG_URL = `${GRAPH_BASE}/${GRAPH_VER}/${env.PHONE_NUMBER_ID}/messages`;

type Button = { id: string; title: string };
type ListRow = { id: string; title: string; description?: string };
type ListSection = { title: string; rows: ListRow[] };

type ListPayload = {
  header?: string;
  title?: string;         // not directly supported by WA "list" (kept for API compat)
  body: string;
  footer?: string;
  buttonText: string;
  sections: ListSection[];
};
type ListPayloadWithTo = ListPayload & { to: string };

type ButtonsPayload = {
  body: string;
  header?: string;
  footer?: string;
  buttons: Button[];
};
type ButtonsPayloadWithTo = ButtonsPayload & { to: string };

async function waFetch(payload: any) {
  const res = await fetch(MSG_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ...payload,
      messaging_product: 'whatsapp',
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.error('[whatsapp] API error', res.status, txt);
  }
}

/* ------------------------------ Basic messages ---------------------------- */

export async function sendText(to: string, body: string) {
  if (!to || !body) return;
  await waFetch({
    to,
    type: 'text',
    text: { preview_url: false, body },
  });
}

/**
 * Send a WhatsApp "list" interactive message.
 * Supports two call styles:
 *   sendListMessage(to, payload)
 *   sendListMessage({ to, ...payload })
 */
export async function sendListMessage(to: string, payload: ListPayload): Promise<void>;
export async function sendListMessage(payload: ListPayloadWithTo): Promise<void>;
export async function sendListMessage(a: any, b?: any): Promise<void> {
  const to: string = typeof a === 'string' ? a : a.to;
  const p: ListPayload = typeof a === 'string' ? b : a;

  const sections = (p.sections || []).map(sec => ({
    title: sec.title,
    rows: (sec.rows || []).map(r => ({
      id: r.id,
      title: r.title,
      description: r.description || undefined,
    })),
  }));

  const interactive: any = {
    type: 'list',
    body: { text: p.body || '' },
    action: {
      button: p.buttonText || 'Open',
      sections,
    },
  };
  if (p.header) interactive.header = { type: 'text', text: p.header };
  if (p.footer) interactive.footer = { text: p.footer };

  await waFetch({ to, type: 'interactive', interactive });
}

/**
 * Send a WhatsApp "buttons" interactive message.
 * Supports two call styles:
 *   sendButtonsMessage(to, body, buttons)
 *   sendButtonsMessage({ to, body, header?, footer?, buttons })
 */
export async function sendButtonsMessage(to: string, body: string, buttons: Button[]): Promise<void>;
export async function sendButtonsMessage(payload: ButtonsPayloadWithTo): Promise<void>;
export async function sendButtonsMessage(a: any, b?: any, c?: any): Promise<void> {
  const to: string = typeof a === 'string' ? a : a.to;
  const p: ButtonsPayload =
    typeof a === 'string'
      ? { body: String(b || ''), buttons: (c || []) as Button[] }
      : a;

  const interactive: any = {
    type: 'button',
    body: { text: p.body || '' },
    action: {
      buttons: (p.buttons || []).slice(0, 3).map((btn) => ({
        type: 'reply',
        reply: { id: btn.id, title: btn.title },
      })),
    },
  };
  if (p.header) interactive.header = { type: 'text', text: p.header };
  if (p.footer) interactive.footer = { text: p.footer };

  await waFetch({ to, type: 'interactive', interactive });
}

/* --------------------------------- Read ----------------------------------- */

export async function markAsRead(messageId: string) {
  if (!messageId) return;
  await waFetch({ status: 'read', message_id: messageId });
}

/* --------------------------- Signature verification ------------------------ */

export function verifySignature(req: Request): boolean {
  try {
    const signature = req.header('x-hub-signature-256') || '';
    if (!signature || !env.APP_SECRET) return false;

    // Prefer the raw string body if server.ts captured it; else fall back to JSON.stringify
    const raw = (req as any).rawBody
      ? (req as any).rawBody
      : JSON.stringify(req.body || {});

    const hmac = createHmac('sha256', env.APP_SECRET).update(raw).digest('hex');
    const expected = `sha256=${hmac}`;
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch (e) {
    console.error('[verifySignature] error', e);
    return false;
  }
}

/* -------------------------- Payment instructions -------------------------- */

export async function sendPaymentInstructions(to: string, total: number) {
  const lines: string[] = [];
  lines.push('💳 *Maelekezo ya Malipo*');
  lines.push(`Jumla ya kulipa: *${Math.round(total).toLocaleString('sw-TZ')} TZS*`);
  lines.push('');
  if (env.LIPA_NAMBA_TILL) {
    lines.push(`• *Tigo Pesa Lipa Namba*: ${env.LIPA_NAMBA_TILL}`);
  }
  if (env.VODA_LNM_TILL) {
    lines.push(`• *M-Pesa Lipa Namba*: ${env.VODA_LNM_TILL}`);
  }
  if (env.VODA_P2P_MSISDN) {
    lines.push(`• *M-Pesa P2P*: ${env.VODA_P2P_MSISDN}`);
  }
  lines.push('');
  lines.push('Baada ya malipo, *tuma screenshot* au *andika majina matatu ya mtumaji* kuthibitisha.');

  await sendText(to, lines.join('\n'));
}
