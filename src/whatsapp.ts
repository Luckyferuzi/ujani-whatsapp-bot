// src/whatsapp.ts
import crypto from 'node:crypto';
import { request } from 'undici';
import { env } from './config.js';
import { buildPaymentMessage } from './payments.js';

const GRAPH_BASE = 'https://graph.facebook.com';
const GRAPH_VER = 'v20.0';

type ListRow = { id: string; title: string; description?: string };
type ListSection = { title?: string; rows: ListRow[] };
type Button = { id: string; title: string };

// Media info shape from Graph
export interface MediaInfo {
  id: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
  url?: string;
}

function waUrl(path: string) {
  return `${GRAPH_BASE}/${GRAPH_VER}/${path}`;
}

async function waPost<T = unknown>(path: string, payload: unknown): Promise<T> {
  const url = waUrl(path);
  const res = await request(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const data = (await res.body.json().catch(() => ({}))) as T;
  if (res.statusCode >= 400) {
    throw new Error(`WhatsApp POST ${path} failed (${res.statusCode}): ${JSON.stringify(data)}`);
  }
  return data;
}

async function waGet<T = unknown>(path: string): Promise<T> {
  const url = waUrl(path);
  const res = await request(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
  });
  const data = (await res.body.json().catch(() => ({}))) as T;
  if (res.statusCode >= 400) {
    throw new Error(`WhatsApp GET ${path} failed (${res.statusCode}): ${JSON.stringify(data)}`);
  }
  return data;
}

/** Verify X-Hub-Signature-256 (HMAC-SHA256) for webhook security. */
export function verifySignature(rawBody: Buffer | string, signatureHeader: string | undefined): boolean {
  if (!env.APP_SECRET) return true;
  if (!signatureHeader) return false;
  const hmac = crypto.createHmac('sha256', env.APP_SECRET);
  hmac.update(typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'));
  const expected = `sha256=${hmac.digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader));
}

/** Mark a message as read. */
export async function markAsRead(messageId: string) {
  return waPost(`${env.PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  });
}

/** Send a plain text message. */
export async function sendText(to: string, body: string) {
  return waPost(`${env.PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body },
  });
}

/** Send an interactive list. */
export async function sendListMessage(opts: {
  to: string;
  header?: string;
  body: string;
  footer?: string;
  buttonText: string;
  sections: ListSection[];
}) {
  const { to, header, body, footer, buttonText, sections } = opts;
  const interactive: any = {
    type: 'list',
    body: { text: body },
    action: {
      button: buttonText,
      sections: sections.map(s => ({
        title: s.title || undefined,
        rows: s.rows.map(r => ({
          id: r.id,
          title: r.title,
          description: r.description || undefined,
        })),
      })),
    },
  };
  if (header) interactive.header = { type: 'text', text: header };
  if (footer) interactive.footer = { text: footer };

  return waPost(`${env.PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive,
  });
}

/** Send interactive buttons (max 3). */
export async function sendButtonsMessage(opts: {
  to: string;
  header?: string;
  body: string;
  footer?: string;
  buttons: Button[];
}) {
  const { to, header, body, footer, buttons } = opts;
  const interactive: any = {
    type: 'button',
    body: { text: body },
    action: {
      buttons: buttons.slice(0, 3).map(b => ({
        type: 'reply',
        reply: { id: b.id, title: b.title },
      })),
    },
  };
  if (header) interactive.header = { type: 'text', text: header };
  if (footer) interactive.footer = { text: footer };

  return waPost(`${env.PHONE_NUMBER_ID}/messages`, {
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive,
  });
}

/** Build + send manual payment instructions (numbers only). */
export async function sendPaymentInstructions(to: string, totalTZS: number) {
  const msg = buildPaymentMessage(totalTZS);
  return sendText(to, msg);
}

/** Fetch media metadata from Graph for an incoming image/document. */
export async function getMediaInfo(mediaId: string): Promise<MediaInfo> {
  return waGet<MediaInfo>(`${mediaId}`);
}

/** Download media bytes for manual verification. */
export async function downloadMedia(mediaId: string): Promise<{
  buffer: Buffer;
  contentType?: string;
  contentLength?: number;
}> {
  const meta = await getMediaInfo(mediaId);
  if (!meta.url) throw new Error('Media URL not available');
  const res = await request(meta.url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}` },
  });
  if (res.statusCode >= 400) {
    const text = await res.body.text();
    throw new Error(`Media download failed (${res.statusCode}): ${text}`);
  }
  const arrBuf = await res.body.arrayBuffer();
  const buffer = Buffer.from(arrBuf);
  const contentType = res.headers['content-type'] as string | undefined;
  const contentLength = res.headers['content-length'] ? Number(res.headers['content-length']) : undefined;
  return { buffer, contentType, contentLength };
}
