import { env, CLICKPESA_ENABLED } from '../config.js';
import { fetch } from 'undici';
import crypto from 'node:crypto';

type TokenRes = { token: string };
let cachedToken = ''; let tokenExp = 0;

function ensureEnabled() {
  if (!CLICKPESA_ENABLED) throw new Error('ClickPesa not enabled');
}

async function getToken(): Promise<string> {
  ensureEnabled();
  const now = Date.now();
  if (cachedToken && now < tokenExp - 10_000) return cachedToken;
  const url = `${env.CLICKPESA_BASE}/generate-token`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'client-id': env.CLICKPESA_CLIENT_ID!, 'api-key': env.CLICKPESA_API_KEY! }
  });
  if (!res.ok) throw new Error(`ClickPesa token failed: ${res.status}`);
  const data = await res.json() as TokenRes;
  cachedToken = data.token;
  tokenExp = now + 55 * 60 * 1000;
  return cachedToken;
}

function checksum(payload: Record<string, string>): string | null {
  if (!env.CLICKPESA_CHECKSUM_SECRET) return null;
  const keys = Object.keys(payload).sort();
  const concat = keys.map(k => String(payload[k])).join('');
  return crypto.createHmac('sha256', env.CLICKPESA_CHECKSUM_SECRET).update(concat).digest('hex');
}

export async function clickpesaInitiateUSSD(opts: { amountTZS: number; orderRef: string; msisdn: string; currency?: string }) {
  ensureEnabled();
  const token = await getToken();
  const url = `${env.CLICKPESA_BASE}/payments/initiate-ussd-push-request`;
  const body: Record<string,string> = {
    amount: String(opts.amountTZS),
    currency: opts.currency || 'TZS',
    orderReference: opts.orderRef,
    phoneNumber: opts.msisdn
  };
  const cs = checksum(body); if (cs) body.checksum = cs;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`USSD push failed: ${res.status}`);
  return await res.json();
}

export async function clickpesaGenerateCheckout(opts: { totalPriceTZS: number; orderRef: string; name?: string; email?: string; phone?: string; currency?: string }) {
  ensureEnabled();
  const token = await getToken();
  const url = `${env.CLICKPESA_BASE}/checkout-link/generate-checkout-url`;
  const body: Record<string,string> = {
    totalPrice: String(opts.totalPriceTZS),
    orderReference: opts.orderRef,
    orderCurrency: opts.currency || 'TZS',
    customerName: opts.name || '',
    customerEmail: opts.email || '',
    customerPhone: opts.phone || ''
  };
  const cs = checksum(body); if (cs) body.checksum = cs;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Checkout link failed: ${res.status}`);
  return await res.json();
}

export async function clickpesaQueryByRef(orderRef: string) {
  ensureEnabled();
  const token = await getToken();
  const res = await fetch(`${env.CLICKPESA_BASE}/payments/${encodeURIComponent(orderRef)}`, {
    headers: { Authorization: token }
  });
  if (!res.ok) throw new Error(`Query payments failed: ${res.status}`);
  return await res.json();
}

export const clickpesaEnabled = CLICKPESA_ENABLED;
