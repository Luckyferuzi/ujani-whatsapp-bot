export type OrderStatus = 'awaiting' | 'partial' | 'paid';

export type Order = {
  id: string;           // internal uid (same as orderId for now)
  orderId: string;      // human readable e.g., UJANI-2025-0001
  customerPhone: string;
  productId: string;    // product or promax package id
  title: string;        // human friendly title
  totalTZS: number;
  status: OrderStatus;
  createdAt: string;
};

export type Payment = {
  id: string;
  orderId: string;
  amountTZS: number;
  method: 'PayLink' | 'USSD' | 'Checkout'; // <— updated
  timestamp: string;
};
