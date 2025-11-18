// web/lib/types.ts

export interface OrderSummary {
  id: number;
  customer_id: number;
  order_code: string | null;
  status: string;
  total_amount: number;
  created_at: string;
}
