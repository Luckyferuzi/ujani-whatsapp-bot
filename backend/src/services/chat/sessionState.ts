import type { Lang } from "../../i18n.js";
import {
  loadSession,
  type CartItem,
  type FlowStep,
  type Session,
  updateSession,
} from "../../session.js";

export type { CartItem, FlowStep, Session };

export async function getChatSession(user: string): Promise<Session> {
  return loadSession(user);
}

export async function patchChatSession(
  user: string,
  patch: Partial<Session>
): Promise<Session> {
  return updateSession(user, (current) => ({
    ...current,
    ...patch,
  }));
}

export async function getLang(u: string): Promise<Lang> {
  return (await getChatSession(u)).lang;
}

export async function setLang(u: string, l: Lang) {
  await patchChatSession(u, { lang: l });
}

export async function getCart(u: string): Promise<CartItem[]> {
  return (await getChatSession(u)).cart;
}

export async function setCart(u: string, x: CartItem[]) {
  await patchChatSession(u, { cart: x });
}

export async function clearCart(u: string) {
  await patchChatSession(u, { cart: [] });
}

export async function addToCart(u: string, it: CartItem) {
  const arr = await getCart(u);
  const same = arr.find((c) => c.sku === it.sku && c.unitPrice === it.unitPrice);
  if (same) same.qty += it.qty;
  else arr.push({ ...it });
  await setCart(u, arr);
}

export async function setPending(u: string, it: CartItem | null) {
  await patchChatSession(u, { pending: it });
}

export async function pendingOrCart(u: string): Promise<CartItem[]> {
  const session = await getChatSession(u);
  return session.pending ? [session.pending] : session.cart;
}

export async function setPendingQty(
  u: string,
  value: { sku: string; name: string; unitPrice: number } | null
) {
  await patchChatSession(u, { pendingQty: value });
}

export async function getPendingQty(u: string) {
  return (await getChatSession(u)).pendingQty;
}

export async function setFlow(u: string, step: FlowStep | null) {
  await patchChatSession(u, { flow: step });
}

export async function getFlow(u: string): Promise<FlowStep | null> {
  return (await getChatSession(u)).flow;
}

export async function getContact(u: string) {
  return (await getChatSession(u)).contact;
}

export async function setContact(
  u: string,
  contact: { name?: string; phone?: string; region?: string }
) {
  await patchChatSession(u, { contact });
}
