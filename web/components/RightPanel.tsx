// web/components/RightPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { socket } from "@/lib/socket";
import { Card, Button } from "./ui";

type Customer = {
  name?: string | null;
  phone?: string | null;
  lang?: string | null;
};

type Delivery = {
  mode: "dar" | "outside" | string;
  description?: string | null;
  km?: number | null;
  fee_tzs?: number | null;
};

type Payment = {
  id: number;
  method?: string | null;
  status: "awaiting" | "verifying" | "paid" | "failed" | string;
  recipient?: string | null;
  amount_tzs?: number | null;
};

type SummaryResponse = {
  customer: Customer | null;
  delivery: Delivery | null;
  payment: Payment | null;
};

function formatPhonePretty(raw?: string | null) {
  if (!raw) return "—";
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+255") && digits.length >= 10) {
    const body = digits.slice(4);
    return `+255 ${body.slice(0, 3)} ${body.slice(3, 6)} ${body.slice(6)}`;
  }
  return digits;
}

export default function RightPanel({
  conversationId,
}: {
  conversationId: number;
}) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);

  async function load() {
    const data = await api<SummaryResponse>(
      `/api/conversations/${conversationId}/summary`
    );
    setSummary(data);
  }

  useEffect(() => {
    load();
    const s = socket();
    const reload = () => load();
    s.on("order.updated", reload);
    s.on("payment.updated", reload);
    return () => {
      s.off("order.updated", reload);
      s.off("payment.updated", reload);
    };
  }, [conversationId]);

  if (!summary) {
    return <div className="w-[22rem] bg-[#f0f2f5] border-l" />;
  }

  const { customer, delivery, payment } = summary;

  return (
    <div className="w-[22rem] bg-[#f0f2f5] border-l p-3 space-y-3 overflow-y-auto">
      <Card className="p-3">
        <div className="text-xs uppercase text-gray-500 mb-1">Customer</div>
        <div className="text-sm font-medium">
          {customer?.name || "Mteja"}
        </div>
        <div className="text-sm text-gray-600">
          Phone: {formatPhonePretty(customer?.phone)}
        </div>
        <div className="text-sm text-gray-600">
          Lang: {customer?.lang?.toUpperCase() ?? "—"}
        </div>
      </Card>

      {delivery && (
        <Card className="p-3">
          <div className="text-xs uppercase text-gray-500 mb-1">
            Delivery
          </div>
          <div className="text-sm text-gray-700">
            Mode: {delivery.mode === "dar" ? "Ndani ya Dar" : delivery.mode}
          </div>
          {delivery.description && (
            <div className="text-sm text-gray-700">
              Location: {delivery.description}
            </div>
          )}
          {typeof delivery.km === "number" && (
            <div className="text-sm text-gray-700">
              GPS: {delivery.km.toFixed(1)} km
            </div>
          )}
          {typeof delivery.fee_tzs === "number" && (
            <div className="text-sm text-gray-700">
              Fee: TZS {delivery.fee_tzs.toLocaleString("en-US")}
            </div>
          )}
        </Card>
      )}

      <Card className="p-3">
        <div className="text-xs uppercase text-gray-500 mb-1">Payment</div>
        <div className="text-sm text-gray-700">
          Method: {payment?.method ?? "—"}
        </div>
        <div className="text-sm text-gray-700">
          Recipient: {payment?.recipient ?? "Ujani Herbals"}
        </div>
        {payment?.amount_tzs && (
          <div className="text-sm text-gray-700">
            Amount: TZS {payment.amount_tzs.toLocaleString("en-US")}
          </div>
        )}
        <div className="text-sm mt-1">
          Status:{" "}
          <span
            className={
              payment?.status === "paid"
                ? "text-green-600"
                : payment?.status === "failed"
                ? "text-red-600"
                : "text-orange-600"
            }
          >
            {payment?.status ?? "awaiting"}
          </span>
        </div>

        {payment && payment.status !== "paid" && (
          <div className="mt-3 flex gap-2">
            <Button
              onClick={async () => {
                await api(`/api/payments/${payment.id}/status`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "verifying" }),
                });
                load();
              }}
            >
              Mark verifying
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                await api(`/api/payments/${payment.id}/status`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "paid" }),
                });
                load();
              }}
            >
              Mark paid
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
