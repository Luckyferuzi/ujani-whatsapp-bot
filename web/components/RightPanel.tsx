"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";

export interface RightPanelProps {
  conversationId: string | null;
}

type CustomerSummary = {
  name: string | null;
  phone: string;
  lang?: string | null;
};

type DeliverySummary = {
  mode: string | null;
  km?: number | null;
  fee_tzs?: number | null;
};

type PaymentSummary = {
  id?: number;
  method?: string | null;
  recipient?: string | null;
  status?: string | null;
};

type ConversationSummary = {
  customer?: CustomerSummary | null;
  delivery?: DeliverySummary | null;
  payment?: PaymentSummary | null;
};

function formatTzs(value?: number | null): string {
  if (value == null) return "—";
  return `${value.toLocaleString("sw-TZ")} Tsh`;
}

function formatKm(value?: number | null): string {
  if (value == null) return "—";
  return `${value.toFixed(1)} km`;
}

const RightPanel: React.FC<RightPanelProps> = ({ conversationId }) => {
  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      if (!conversationId) {
        setSummary(null);
        return;
      }

      setLoading(true);
      try {
        const data = await api<ConversationSummary>(
          `/api/conversations/${conversationId}/summary`
        );
        setSummary(data);
      } catch (err) {
        console.error("Failed to load summary", err);
        setSummary(null);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [conversationId]);

  if (!conversationId) {
    return (
      <div className="right-panel right-panel--empty">
        <div className="panel-empty">No conversation selected</div>
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
          Order • {customer?.name || "Ujani Herbals"}
        </span>
      </div>

      {/* CUSTOMER SECTION */}
      <div className="panel-section">
        <div className="panel-card">
          <div className="panel-card-title">Customer</div>
          {loading && !customer ? (
            <div className="panel-card-body panel-card-body--muted">
              Loading…
            </div>
          ) : customer ? (
            <div className="panel-card-body">
              <div className="panel-row">
                <span className="panel-label">Name:</span>
                <span className="panel-value">{customer.name || "—"}</span>
              </div>
              <div className="panel-row">
                <span className="panel-label">Phone:</span>
                <span className="panel-value">
                  {formatPhonePretty(customer.phone)}
                </span>
              </div>
              <div className="panel-row">
                <span className="panel-label">Language:</span>
                <span className="panel-value">
                  {(customer.lang || "sw").toUpperCase()}
                </span>
              </div>
            </div>
          ) : (
            <div className="panel-card-body panel-card-body--muted">
              Hakuna taarifa za mteja bado.
            </div>
          )}
        </div>
      </div>

      {/* DELIVERY SECTION */}
      <div className="panel-section">
        <div className="panel-card">
          <div className="panel-card-title">Delivery</div>
          {loading && !delivery ? (
            <div className="panel-card-body panel-card-body--muted">
              Loading…
            </div>
          ) : delivery ? (
            <div className="panel-card-body">
              <div className="panel-row">
                <span className="panel-label">Mode:</span>
                <span className="panel-value">{delivery.mode || "—"}</span>
              </div>
              <div className="panel-row">
                <span className="panel-label">Distance:</span>
                <span className="panel-value">{formatKm(delivery.km)}</span>
              </div>
              <div className="panel-row">
                <span className="panel-label">Fee:</span>
                <span className="panel-value">
                  {formatTzs(delivery.fee_tzs)}
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

      {/* PAYMENT SECTION */}
      <div className="panel-section">
        <div className="panel-card">
          <div className="panel-card-title">Payment</div>
          {loading && !payment ? (
            <div className="panel-card-body panel-card-body--muted">
              Loading…
            </div>
          ) : payment ? (
            <>
              <div className="panel-card-body">
                {payment.method && (
                  <div className="panel-row">
                    <span className="panel-label">Method:</span>
                    <span className="panel-value">{payment.method}</span>
                  </div>
                )}
                {payment.recipient && (
                  <div className="panel-row">
                    <span className="panel-label">Recipient:</span>
                    <span className="panel-value">{payment.recipient}</span>
                  </div>
                )}
                <div className="panel-row">
                  <span className="panel-label">Status:</span>
                  <span className="panel-value">
                    {payment.status || "—"}
                  </span>
                </div>
              </div>
              {payment.id && (
                <div className="panel-card-footer">
                  <button
                    className="btn btn-muted"
                    onClick={async () => {
                      try {
                        await api(`/api/payments/${payment.id}/status`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "verifying" }),
                        });
                        const data = await api<ConversationSummary>(
                          `/api/conversations/${conversationId}/summary`
                        );
                        setSummary(data);
                      } catch (err) {
                        console.error("Failed to update status", err);
                      }
                    }}
                  >
                    Mark verifying
                  </button>
                  <button
                    className="btn btn-success"
                    onClick={async () => {
                      try {
                        await api(`/api/payments/${payment.id}/status`, {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ status: "paid" }),
                        });
                        const data = await api<ConversationSummary>(
                          `/api/conversations/${conversationId}/summary`
                        );
                        setSummary(data);
                      } catch (err) {
                        console.error("Failed to update status", err);
                      }
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
};

export default RightPanel;
