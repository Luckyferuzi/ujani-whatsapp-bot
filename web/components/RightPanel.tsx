"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { socket } from "@/lib/socket";

type Summary = {
  customer: { name?: string; phone: string; lang?: string } | null;
  delivery: { mode: string; km: number; fee_tzs: number } | null;
  payment: {
    id?: string;
    method?: string;
    status: "awaiting" | "verifying" | "paid" | "failed";
    recipient?: string;
  } | null;
};

function formatPhonePretty(raw?: string) {
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
  conversationId: string | null;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);

  async function load() {
    if (!conversationId) {
      setSummary(null);
      return;
    }
    const data = await api<Summary>(
      `/api/conversations/${conversationId}/summary`
    );
    setSummary(data);
  }

  useEffect(() => {
    load();
  }, [conversationId]);

  useEffect(() => {
    const s = socket();
    const reload = () => load();
    s.on("order.updated", reload);
    s.on("payment.updated", reload);
    s.on("conversation.updated", reload);
    return () => {
      s.off("order.updated", reload);
      s.off("payment.updated", reload);
      s.off("conversation.updated", reload);
    };
  }, [conversationId]);

  if (!conversationId) {
    return (
      <div className="w-[22rem] bg-[#f0f2f5] border-l grid place-items-center text-xs text-gray-400">
        No conversation selected
      </div>
    );
  }

  const customer = summary?.customer ?? null;
  const delivery = summary?.delivery ?? null;
  const payment = summary?.payment ?? null;

  return (
    <div className="w-[22rem] bg-[#f0f2f5] border-l p-3 space-y-3 overflow-y-auto">
      {/* Customer */}
      <section className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="text-xs uppercase text-gray-500 mb-1">Customer</div>
        <div className="text-sm font-medium">
          {customer?.name || formatPhonePretty(customer?.phone)}
        </div>
        <div className="text-xs text-gray-500 mt-1">
          Phone: {formatPhonePretty(customer?.phone)}
        </div>
        <div className="text-xs text-gray-500">
          Language: {customer?.lang?.toUpperCase() ?? "—"}
        </div>
      </section>

      {/* Delivery */}
      {delivery && (
        <section className="bg-white rounded-xl border border-gray-200 p-3">
          <div className="text-xs uppercase text-gray-500 mb-1">
            Delivery
          </div>
          <div className="text-sm text-gray-700">
            Mode: {delivery.mode === "dar" ? "Ndani ya Dar" : delivery.mode}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            GPS distance: {delivery.km.toFixed(1)} km
          </div>
          <div className="text-xs text-gray-500">
            Fee: TZS {delivery.fee_tzs.toLocaleString("en-US")}
          </div>
        </section>
      )}

      {/* Payment */}
      <section className="bg-white rounded-xl border border-gray-200 p-3">
        <div className="text-xs uppercase text-gray-500 mb-1">Payment</div>
        {payment ? (
          <>
            <div className="text-sm text-gray-700">
              Method: {payment.method ?? "—"}
            </div>
            <div className="text-xs text-gray-500">
              Recipient: {payment.recipient ?? "Ujani"}
            </div>
            <div className="text-xs mt-1">
              Status:{" "}
              <span
                className={
                  payment.status === "paid"
                    ? "text-green-600"
                    : payment.status === "failed"
                    ? "text-red-600"
                    : "text-orange-600"
                }
              >
                {payment.status}
              </span>
            </div>

            {payment.status !== "paid" && payment.id && (
              <div className="mt-3 flex gap-2">
                <button
                  className="flex-1 h-9 rounded-lg text-xs border border-gray-300 hover:bg-gray-50"
                  onClick={() =>
                    fetch(`/api/payments/${payment.id}/status`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "verifying" }),
                    })
                      .then(load)
                      .catch((e) => alert(e.message))
                  }
                >
                  Mark verifying
                </button>
                <button
                  className="flex-1 h-9 rounded-lg text-xs bg-green-600 text-white hover:bg-green-700"
                  onClick={() =>
                    fetch(`/api/payments/${payment.id}/status`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "paid" }),
                    })
                      .then(load)
                      .catch((e) => alert(e.message))
                  }
                >
                  Mark paid
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-gray-500">
            Hakuna taarifa ya malipo bado.
          </div>
        )}
      </section>
    </div>
  );
}
