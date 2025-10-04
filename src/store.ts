// src/store.ts
// In-memory payments ledger used by webhook/status/psp routes and markPaid().

export type Payment = {
  id: string;                    // PSP paymentId or generated id (e.g., "cp_169559233...")
  orderId: string;               // internal order id
  amountTZS: number;             // integer Tanzanian shillings
  method: 'USSD' | 'Checkout' | 'PayLink';
  timestamp: string;             // ISO string
};

// orderId -> [payments...]
const paymentsByOrder = new Map<string, Payment[]>();

/** Record one partial/full payment for an order (idempotency handled upstream). */
export function addPayment(p: Payment): void {
  const arr = paymentsByOrder.get(p.orderId) ?? [];
  arr.push(p);
  paymentsByOrder.set(p.orderId, arr);
}

/** Sum total paid so far for an order. */
export function getPaidSoFar(orderId: string): number {
  const arr = paymentsByOrder.get(orderId) ?? [];
  return arr.reduce((sum, x) => sum + (x.amountTZS || 0), 0);
}

/** Optional: list payments for an order (useful for admin/debug). */
export function getPayments(orderId: string): Payment[] {
  return paymentsByOrder.get(orderId) ?? [];
}
