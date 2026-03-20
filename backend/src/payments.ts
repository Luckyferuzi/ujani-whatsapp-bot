import { getConfiguredPaymentMethods } from './runtime/companySettings.js';

export const PAYMENT_STATUS_VALUES = [
  "awaiting",
  "verifying",
  "paid",
  "failed",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUS_VALUES)[number];

const ALLOWED_PAYMENT_STATUS_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  awaiting: ["verifying", "paid", "failed"],
  verifying: ["awaiting", "paid", "failed"],
  paid: ["paid"],
  failed: ["awaiting", "verifying", "paid", "failed"],
};

export function isPaymentStatus(value: string | null | undefined): value is PaymentStatus {
  return PAYMENT_STATUS_VALUES.includes((value ?? "") as PaymentStatus);
}

export function canTransitionPaymentStatus(
  from: string | null | undefined,
  to: string | null | undefined
): boolean {
  if (!isPaymentStatus(from) || !isPaymentStatus(to)) return false;
  if (from === to) return true;
  return ALLOWED_PAYMENT_STATUS_TRANSITIONS[from].includes(to);
}

export function assertPaymentStatusTransition(
  from: string | null | undefined,
  to: string | null | undefined
): PaymentStatus {
  if (!isPaymentStatus(to)) {
    throw new Error(`invalid_payment_status:${String(to ?? "")}`);
  }
  if (!isPaymentStatus(from)) {
    throw new Error(`invalid_payment_status:${String(from ?? "")}`);
  }
  if (!canTransitionPaymentStatus(from, to)) {
    throw new Error(`invalid_payment_transition:${from}->${to}`);
  }
  return to;
}

export function accumulatePaymentAmount(
  currentAmount: number | null | undefined,
  additionalAmount: number | null | undefined
): number {
  const current = Number(currentAmount ?? 0);
  const delta = Number(additionalAmount ?? 0);
  if (!Number.isFinite(current) || current < 0) {
    throw new Error("invalid_current_payment_amount");
  }
  if (!Number.isFinite(delta) || delta < 0) {
    throw new Error("invalid_additional_payment_amount");
  }
  return current + delta;
}

export function computeRemainingPayment(
  orderTotalTzs: number | null | undefined,
  paidAmountTzs: number | null | undefined
): number {
  const total = Math.max(0, Number(orderTotalTzs ?? 0) || 0);
  const paid = Math.max(0, Number(paidAmountTzs ?? 0) || 0);
  return Math.max(total - paid, 0);
}

/** Build the payment instruction text (numbers only; no account name) */
export function buildPaymentMessage(totalTZS: number): string {
  const amount = (Math.floor(totalTZS) || 0).toLocaleString('sw-TZ');
  const header = `*Malipo (TZS):* ${amount}\n`;
  const opts = getConfiguredPaymentMethods().map((item) => ({
    label: item.label,
    number: item.value,
  }));

  if (!opts.length) {
    return header +
      `\nKwa sasa namba za malipo hazijawekwa.\n` +
      `⏩ Baada ya kulipa, tuma *screenshot ya muamala* au andika *majina matatu* ya mtumaji (kwa uthibitisho).`;
  }

  const list = opts.map((o, i) => `${i + 1}. *${o.label}*: ${o.number}`).join('\n');
  return header +
    `\nChagua mojawapo ya namba zifuatazo:\n${list}\n\n` +
    `Baada ya kulipa, tuma *screenshot ya muamala* au andika *majina matatu* ya mtumaji (kwa uthibitisho).`;
}
