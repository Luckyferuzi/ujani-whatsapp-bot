// web/lib/types.ts

export interface OrderSummary {
  id: number;
  customer_id: number;
  order_code: string | null;
  status: string;
  total_amount: number;
  created_at: string;
}

export type ConversationWindowState = {
  mode: "freeform" | "template_required";
  lastInboundAt: string | null;
  expiresAt: string | null;
  remainingSeconds: number | null;
  reason: "within_24h" | "outside_24h" | "no_inbound_history";
};
