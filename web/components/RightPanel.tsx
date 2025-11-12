"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { socket } from "@/lib/socket";

type Summary = {
  customer: { name?: string; phone: string; lang?: string } | null;
  delivery: { mode: string; km: number; fee_tzs: number } | null;
  payment: { id?: string; method?: string; status: "awaiting" | "verifying" | "paid" | "failed"; recipient?: string } | null;
};

export default function RightPanel({ conversationId }: { conversationId: string }) {
  const [data, setData] = useState<Summary | null>(null);

  async function load() {
    const d = await api<Summary>(`/api/conversations/${conversationId}/summary`);
    setData(d);
  }

  useEffect(() => {
    load();
    const s = socket();
    s.on("order.updated", load);
    s.on("payment.updated", load);
    return () => {
      s.off("order.updated", load);
      s.off("payment.updated", load);
    };
  }, [conversationId]);

  if (!data) return <div className="w-96" />;

  const { customer, delivery, payment } = data;

  return (
    <div className="w-96 bg-gray-50 border-l p-3 space-y-3">
      <section className="rounded-2xl border bg-white p-3">
        <div className="font-semibold">Customer</div>
        <div className="text-sm mt-1">Name: {customer?.name || "—"}</div>
        <div className="text-sm">Phone: {customer?.phone || "—"}</div>
        <div className="text-sm">Lang: {customer?.lang || "—"}</div>
      </section>

      {delivery && (
        <section className="rounded-2xl border bg-white p-3">
          <div className="font-semibold">Delivery</div>
          <div className="text-sm mt-1">Mode: {delivery.mode}</div>
          <div className="text-sm">GPS: {delivery.km.toFixed(1)} km</div>
          <div className="text-sm">Fee: TZS {delivery.fee_tzs.toLocaleString()}</div>
        </section>
      )}

      <section className="rounded-2xl border bg-white p-3">
        <div className="font-semibold">Payment</div>
        <div className="text-sm mt-1">Chosen: {payment?.method || "—"}</div>
        <div className="text-sm">Recipient: {payment?.recipient || "Ujani Herbals"}</div>
        <div className="text-sm">
          Status:{" "}
          <span
            className={
              payment?.status === "paid"
                ? "text-green-600"
                : payment?.status === "verifying"
                ? "text-blue-600"
                : payment?.status === "failed"
                ? "text-red-600"
                : "text-orange-600"
            }
          >
            {payment?.status || "awaiting"}
          </span>
        </div>

        {payment?.id && (
          <div className="mt-2 flex gap-2">
            <button
              className="px-3 py-1.5 rounded bg-blue-600 text-white"
              onClick={() =>
                api(`/api/payments/${payment.id}/status`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "verifying" })
                })
                  .then(load)
                  .catch((e) => alert(e.message))
              }
            >
              Mark verifying
            </button>
            <button
              className="px-3 py-1.5 rounded bg-green-600 text-white"
              onClick={() =>
                api(`/api/payments/${payment.id}/status`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: "paid" })
                })
                  .then(load)
                  .catch((e) => alert(e.message))
              }
            >
              Mark paid
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
