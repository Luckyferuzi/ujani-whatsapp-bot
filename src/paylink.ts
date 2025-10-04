import { env } from './config.js';

export function buildPayLink(orderId: string) {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  return `${base}/pay/${encodeURIComponent(orderId)}`;
}

export function buildWhatsAppDeeplink(message: string) {
  const num = env.BUSINESS_WA_NUMBER_E164.replace(/^\+/, '');
  return `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
}

export function buildCheckoutReturnUrl(orderId: string) {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  return `${base}/payments/clickpesa/return?ref=${encodeURIComponent(orderId)}`;
}
