// web/components/RightPanel.tsx
"use client";

import { useEffect, useState } from "react";
import { api, API } from "@/lib/api";
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

type Props = {
  conversationId: string | null;
};

function formatPhonePretty(raw?: string) {
  if (!raw) return "—";
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+255") && digits.length >= 10) {
    const body = digits.slice(4);
    return `+255 ${body.slice(0, 3)} ${body.slice(3, 6)} ${body.slice(6)}`;
  }
  if (digits.startsWith("+") && digits.length > 7) {
    return digits;
  }
  return raw;
}

function formatKm(km?: number | null) {
  if (km == null) return "—";
  return `${km.toFixed(1)} km`;
}

function formatTzs(v?: number | null) {
  if (v == null) return "—";
  return `TZS ${v.toLocaleString("en-TZ")}`;
}

export default function RightPanel({ conversationId }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    if (!conversationId) {
      setSummary(null);
      return;
    }
    setLoading(true);
    try {
      const data = await api<Summary>(
        `/api/conversations/${conversationId}/summary`
      );
      setSummary(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [conversationId]);

  useEffect(() => {
    const s = socket();
    const handler = (payload: any) => {
      const cid =
        payload?.conversation_id ??
        payload?.conversationId ??
        payload?.conversation?.id;
      if (String(cid) === String(conversationId)) {
        load();
      }
    };
    s.on("payment.updated", handler);
    return () => {
      s.off("payment.updated", handler);
    };
  }, [conversationId]);

  if (!conversationId) {
    return (
      <div className="right-panel right-panel--empty">
        No conversation selected
      </div>
    );
  }

  const customer = summary?.customer ?? null;
  const delivery = summary?.delivery ?? null;
  const payment = summary?.payment ?? null;

  return (
    <div className="right-panel">
      <div className="panel-header">
        <span className="panel-header-title">
          Order • {customer?.name || "Ujani Kiboko"}
        </span>
      </div>

      <div className="panel-section">
        <div className="panel-card">
          <div className="panel-card-title">Customer</div>
          {customer ? (
            <div className="panel-card-body">
              <div className="panel-row">
                <span className="panel-label">Name:</span>
                <span className="panel-value">{customer.name}</span>
              </div>
              <div className="panel-row">
                <span className="panel-label">Phone:</span>
                <span className="panel-value">
                  {formatPhonePretty(customer.phone)}
                </span>
              </div>
              <div className="panel-row">
                <span className="panel-label">Lang:</span>
                <span className="panel-value">
                  {(customer.lang || "SW").toUpperCase()}
                </span>
              </div>
            </div>
          ) : loading ? (
            <div className="panel-card-body panel-card-body--muted">
              Loading…
            </div>
          ) : (
            <div className="panel-card-body panel-card-body--muted">
              Hakuna taarifa ya mteja bado.
            </div>
          )}
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-card">
          <div className="panel-card-title">Delivery</div>
          {delivery ? (
            <div className="panel-card-body">
              <div className="panel-row">
                <span className="panel-label">Mode:</span>
                <span className="panel-value">
                  {delivery.mode === "delivery"
                    ? "Ndani ya Dar"
                    : delivery.mode === "pickup"
                    ? "Pickup"
                    : delivery.mode}
                </span>
              </div>
              <div className="panel-row">
                <span className="panel-label">GPS:</span>
                <span className="panel-value">
                  {formatKm(delivery.km)}
                </span>
              </div>
              <div className="panel-row">
                <span className="panel-label">Fee:</span>
                <span className="panel-value">
                  {formatTzs(delivery.fee_tzs)} (680/km, rounded)
                </span>
              </div>
            </div>
          ) : (
            <div className="panel-card-body panel-card-body--muted">
              Hakuna taarifa ya delivery bado.
            </div>
          )}
        </div>
      </div>

      <div className="panel-section">
        <div className="panel-card">
          <div className="panel-card-title">Payment</div>
          {payment ? (
            <>
              <div className="panel-card-body">
                {payment.method && (
                  <div className="panel-row">
                    <span className="panel-label">Chosen:</span>
                    <span className="panel-value">
                      {payment.method}
                    </span>
                  </div>
                )}
                {payment.recipient && (
                  <div className="panel-row">
                    <span className="panel-label">Recipient:</span>
                    <span className="panel-value">
                      {payment.recipient}
                    </span>
                  </div>
                )}
                <div className="panel-row">
                  <span className="panel-label">Status:</span>
                  <span
                    className={
                      "panel-status panel-status--" + payment.status
                    }
                  >
                    {payment.status === "awaiting"
                      ? "Awaiting proof"
                      : payment.status}
                  </span>
                </div>
              </div>

              {payment.status !== "paid" && payment.id && (
                <div className="panel-actions">
                  <button
                    className="btn btn-secondary"
                    onClick={async () => {
                      await fetch(
                        `${API}/api/payments/${payment.id}/status`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({ status: "verifying" }),
                        }
                      );
                      load();
                    }}
                  >
                    Mark verifying
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={async () => {
                      await fetch(
                        `${API}/api/payments/${payment.id}/status`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                          },
                          body: JSON.stringify({ status: "paid" }),
                        }
                      );
                      load();
                    }}
                  >
                    Mark paid
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="panel-card-body panel-card-body--muted">
              Hakuna taarifa ya malipo bado.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
