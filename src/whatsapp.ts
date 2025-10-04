import { env } from './config.js';
import { fetch } from 'undici';
import pino from 'pino';

const logger = pino({ name: 'whatsapp' });
const GRAPH_API_BASE = 'https://graph.facebook.com';
const GRAPH_API_VERSION = 'v20.0';

/* ------------------------------ Core sender ------------------------------ */
async function graphSend(payload: any) {
  const url = `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${env.PHONE_NUMBER_ID}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, text, payload }, 'WhatsApp send failed');
    throw new Error('WhatsApp send failed: ' + res.status);
  }
  const data = await res.json();
  logger.info({ data }, 'WhatsApp send ok');
  return data;
}

/* -------------------------------- Text ---------------------------------- */
export async function sendText(params: { to: string; body: string; previewUrl?: boolean }) {
  const { to, body, previewUrl = false } = params;
  return graphSend({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body, preview_url: previewUrl },
  });
}

/* --------------------------- Interactive: List --------------------------- */
export type ListRow = { id: string; title: string; description?: string };
export type ListSection = { title?: string; rows: ListRow[] };

export async function sendInteractiveList(params: {
  to: string;
  header?: string;              // string; mapped to {type:'text', text: ...}
  body: string;
  footer?: string;
  buttonText: string;           // visible button on the list
  sections: ListSection[];      // 1–10 sections; each 1–10 rows
}) {
  const { to, header, body, footer, buttonText, sections } = params;

  const interactive: any = {
    type: 'list',
    body: { text: body },
    action: {
      button: buttonText,
      sections: sections.map(s => ({
        title: s.title,
        rows: s.rows.map(r => ({
          id: r.id,
          title: r.title,
          description: r.description,
        })),
      })),
    },
  };

  if (header) interactive.header = { type: 'text', text: header };
  if (footer) interactive.footer = { text: footer };

  return graphSend({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive,
  });
}

/* -------------------------- Interactive: Buttons ------------------------- */
export type ButtonSpec = { id: string; title: string };

export async function sendInteractiveButtons(params: {
  to: string;
  header?: string;
  body: string;
  footer?: string;
  buttons: ButtonSpec[];      // 1–3 buttons
}) {
  const { to, header, body, footer, buttons } = params;

  const interactive: any = {
    type: 'button',
    body: { text: body },
    action: {
      buttons: buttons.slice(0, 3).map(b => ({
        type: 'reply',
        reply: { id: b.id, title: b.title },
      }))
    }
  };

  if (header) interactive.header = { type: 'text', text: header };
  if (footer) interactive.footer = { text: footer };

  return graphSend({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive,
  });
}
