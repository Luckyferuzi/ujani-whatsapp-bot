"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
  mode: string;
  km?: number | null;
  fee_tzs?: number | null;
};

type PaymentSummary = {
  id?: number;
  order_id?: number;
  method?: string | null;
  recipient?: string | null;
  status: "awaiting" | "verifying" | "paid" | "failed" | string;
  amount_tzs?: number | null; // total paid so far
  total_tzs?: number | null; // order total
  remaining_tzs?: number | null; // remaining balance
};

type ConversationSummary = {
  customer?: CustomerSummary | null;
  delivery?: DeliverySummary | null;
  payment?: PaymentSummary | null;
  restock?: {
    subscribed_count: number;
    items: { product_id: number; sku: string; name: string; status: string }[];
  } | null;
};

type OrderRow = {
  id: number;
  status: string | null;
  delivery_mode: string | null;
  km?: number | null;
  fee_tzs?: number | null;
  total_tzs: number;
  phone?: string | null;
  region?: string | null;
  created_at: string;
  delivery_agent_phone?: string | null;
  order_code?: string | null;
  customer_name?: string | null;
  payment_id?: number | null;
  paid_amount?: number | null;
  payment_status?: string | null;
};

function formatTzs(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.floor(value).toLocaleString("sw-TZ")} TZS`;
}

function formatKm(value?: number | null): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toFixed(1)} km`;
}

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("sw-TZ", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizePaymentStatus(status?: string | null) {
  const s = (status ?? "").toLowerCase().trim();
  if (!s) return { label: "Unknown", tone: "neutral" as const };
  if (s === "paid") return { label: "Paid", tone: "success" as const };
  if (s === "verifying") return { label: "Verifying", tone: "warning" as const };
  if (s === "awaiting") return { label: "Awaiting", tone: "warning" as const };
  if (s === "failed") return { label: "Failed", tone: "danger" as const };
  return { label: s, tone: "neutral" as const };
}

function normalizeOrderStatus(status?: string | null) {
  const s = (status ?? "").toLowerCase().trim();
  if (!s) return { label: "Unknown", tone: "neutral" as const };

  switch (s) {
    case "pending":
      return { label: "Pending", tone: "warning" as const };
    case "preparing":
      return { label: "Preparing", tone: "warning" as const };
    case "out_for_delivery":
      return { label: "Out for delivery", tone: "success" as const };
    case "delivered":
      return { label: "Delivered", tone: "success" as const };
    case "cancelled":
      return { label: "Cancelled", tone: "danger" as const };
    default:
      return { label: s, tone: "neutral" as const };
  }
}

type ThemeMode = "system" | "light" | "dark";
const THEME_STORAGE_KEY = "ujani-theme";

function readThemeMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
    return "system";
  } catch {
    return "system";
  }
}

function applyThemeMode(mode: ThemeMode) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // ignore
  }

  const root = document.documentElement;

  if (mode === "system") {
    delete root.dataset.theme;
    return;
  }

  root.dataset.theme = mode;
}


export default function RightPanel({ conversationId }: RightPanelProps) {
  const router = useRouter();

  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [activeView, setActiveView] = useState<"orders" | "settings">("orders");

  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [riderPhoneInput, setRiderPhoneInput] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [showRiderForm, setShowRiderForm] = useState(false);
    const [themeMode, setThemeMode] = useState<ThemeMode>("system");

  const customer = summary?.customer ?? null;
  const delivery = summary?.delivery ?? null;
  const payment = summary?.payment ?? null;
  const restock = summary?.restock ?? null;

  const latestOrder: OrderRow | null = orders.length > 0 ? orders[0] : null;

  const currentOrder: OrderRow | null = useMemo(() => {
    if (!orders.length) return null;
    if (selectedOrderId == null) return orders[0] ?? null;
    return orders.find((o) => o.id === selectedOrderId) ?? orders[0] ?? null;
  }, [orders, selectedOrderId]);

  const displayName = useMemo(() => {
    const name = customer?.name?.trim();
    if (name) return name;
    if (customer?.phone) return formatPhonePretty(customer.phone);
    if (latestOrder?.phone) return formatPhonePretty(latestOrder.phone);
    return "Customer";
  }, [customer, latestOrder]);

  const handleOpenOrdersPage = () => {
    const phone = customer?.phone || latestOrder?.phone || undefined;
    if (phone) {
      const params = new URLSearchParams({ phone });
      router.push(`/orders?${params.toString()}`);
    } else {
      router.push("/orders");
    }
  };

  const loadAll = async () => {
    if (!conversationId) {
      setSummary(null);
      setOrders([]);
      setSelectedOrderId(null);
      return;
    }

    setLoading(true);
    try {
      const [summaryData, ordersData] = await Promise.all([
        api<ConversationSummary>(`/api/conversations/${conversationId}/summary`),
        api<{ items: OrderRow[] }>(`/api/conversations/${conversationId}/orders`),
      ]);

      const nextOrders = ordersData?.items ?? [];

      setSummary(summaryData);
      setOrders(nextOrders);

      // default selection: newest order
      if (nextOrders.length === 0) {
        setSelectedOrderId(null);
      } else if (
        selectedOrderId == null ||
        !nextOrders.some((o) => o.id === selectedOrderId)
      ) {
        setSelectedOrderId(nextOrders[0].id);
      }
    } catch (err) {
      console.error("Failed to load right panel data", err);
      setSummary(null);
      setOrders([]);
      setSelectedOrderId(null);
    } finally {
      setLoading(false);
    }
  };

    useEffect(() => {
    const mode = readThemeMode();
    setThemeMode(mode);
  }, []);


  useEffect(() => {
    void loadAll();

    // reset view & transient inputs when switching conversations
    setActiveView("orders");

    setPaymentAmountInput("");
    setPaymentError(null);
    setShowPaymentForm(false);

    setRiderPhoneInput("");
    setStatusError(null);
    setShowRiderForm(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  const handleUpdatePaymentStatus = async (status: "verifying" | "paid") => {
    if (!payment?.id) return;

    const payload: any = { status };

    if (status === "paid") {
      const raw = paymentAmountInput.trim();
      const numeric = Number(raw.replace(/[^\d]/g, ""));
      if (!raw || !Number.isFinite(numeric) || numeric <= 0) {
        setPaymentError("Enter a valid amount in TZS.");
        return;
      }
      payload.amount_tzs = numeric;
    }

    setUpdatingPayment(true);
    setPaymentError(null);

    try {
      await api(`/api/payments/${payment.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (status === "paid") {
        setPaymentAmountInput("");
        setShowPaymentForm(false);
      }

      await loadAll();
    } catch (err) {
      console.error("Failed to update payment status", err);
      setPaymentError("Failed to update payment. Please try again.");
    } finally {
      setUpdatingPayment(false);
    }
  };

  const handleUpdateOrderStatus = async (
    status: "preparing" | "out_for_delivery" | "delivered"
  ) => {
    if (!currentOrder) return;

    const payload: any = { status };

    if (status === "out_for_delivery") {
      const raw = riderPhoneInput.trim();
      if (!raw) {
        setStatusError("Enter rider phone number.");
        return;
      }
      payload.delivery_agent_phone = raw;
    }

    setUpdatingStatus(true);
    setStatusError(null);

    try {
      await api(`/api/orders/${currentOrder.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (status === "out_for_delivery") {
        setShowRiderForm(false);
        setRiderPhoneInput("");
      }

      await loadAll();
    } catch (err) {
      console.error("Failed to update order status", err);
      setStatusError("Failed to update order status. Please try again.");
    } finally {
      setUpdatingStatus(false);
    }
  };

  if (!conversationId) {
    return (
      <div className="right-panel right-panel--empty">
        <div className="panel-empty">No conversation selected</div>
      </div>
    );
  }

  const paymentUi = normalizePaymentStatus(payment?.status);
  const orderUi = normalizeOrderStatus(currentOrder?.status);

  const orderSelectorOptions = orders.slice(0, 8);

  const orderTotal =
    payment?.total_tzs != null
      ? payment.total_tzs
      : currentOrder?.total_tzs != null
      ? currentOrder.total_tzs
      : null;

  const paidSoFar =
    payment?.amount_tzs != null ? payment.amount_tzs : currentOrder?.paid_amount ?? null;

  const remaining =
    payment?.remaining_tzs != null
      ? payment.remaining_tzs
      : orderTotal != null && paidSoFar != null
      ? Math.max(0, orderTotal - paidSoFar)
      : null;

  return (
    <div className="right-panel">
      {/* Tabs + Refresh */}
      <div className="panel-header panel-header--tabs">
        <button
          type="button"
          className={
            "panel-header-tab" + (activeView === "orders" ? " panel-header-tab--active" : "")
          }
          onClick={() => setActiveView("orders")}
        >
          <span className="panel-header-tab-icon" aria-hidden="true">
            📦
          </span>
          <span className="panel-header-tab-label">Orders</span>
        </button>

        <button
          type="button"
          className={
            "panel-header-tab" + (activeView === "settings" ? " panel-header-tab--active" : "")
          }
          onClick={() => setActiveView("settings")}
        >
          <span className="panel-header-tab-icon" aria-hidden="true">
            ⚙️
          </span>
          <span className="panel-header-tab-label">Settings</span>
        </button>

        <button
          type="button"
          className="rp-icon-button"
          onClick={() => void loadAll()}
          disabled={loading}
          title="Refresh"
          aria-label="Refresh"
        >
          ⟳
        </button>
      </div>

      {/* ORDERS VIEW */}
      {activeView === "orders" && (
        <div className="rp-stack">
          {/* Customer */}
          <div className="panel-card">
            <div className="rp-card-title-row">
              <div className="panel-card-title">Customer</div>
              {(restock?.subscribed_count ?? 0) > 0 && (
                <span className="badge badge--restock">
                  Stock Alert{restock!.subscribed_count > 1 ? ` ${restock!.subscribed_count}` : ""}
                </span>
              )}
            </div>

            <div className="rp-grid">
              <div className="panel-row">
                <span className="panel-label">Name</span>
                <span className="panel-value">{customer?.name || "—"}</span>
              </div>

              <div className="panel-row">
                <span className="panel-label">Phone</span>
                <span className="panel-value">
                  {customer?.phone ? formatPhonePretty(customer.phone) : "—"}
                </span>
              </div>

              <div className="panel-row">
                <span className="panel-label">Language</span>
                <span className="panel-value">{(customer?.lang || "sw").toUpperCase()}</span>
              </div>
            </div>

            <div className="rp-actions">
              <button type="button" className="btn btn-secondary btn-xs" onClick={handleOpenOrdersPage}>
                View order history
              </button>
            </div>
          </div>

          {/* Order */}
          <div className="panel-card">
            <div className="rp-card-title-row">
              <div className="panel-card-title">Order</div>

              <div className="rp-order-select-wrap">
                {orderSelectorOptions.length > 1 ? (
                  <select
                    className="rp-select"
                    value={currentOrder?.id ?? ""}
                    onChange={(e) => setSelectedOrderId(Number(e.target.value))}
                  >
                    {orderSelectorOptions.map((o) => (
                      <option key={o.id} value={o.id}>
                        {(o.order_code || `Order #${o.id}`) +
                          " · " +
                          formatDateTime(o.created_at)}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className={"rp-chip rp-chip--" + orderUi.tone}>{orderUi.label}</span>
                )}
              </div>
            </div>

            {!currentOrder ? (
              <div className="panel-card-body panel-card-body--muted">
                No orders found for this conversation yet.
              </div>
            ) : (
              <>
                <div className="rp-grid">
                  <div className="panel-row">
                    <span className="panel-label">Code</span>
                    <span className="panel-value">{currentOrder.order_code || `#${currentOrder.id}`}</span>
                  </div>

                  <div className="panel-row">
                    <span className="panel-label">Status</span>
                    <span className={"rp-chip rp-chip--" + orderUi.tone}>{orderUi.label}</span>
                  </div>

                  <div className="panel-row">
                    <span className="panel-label">Created</span>
                    <span className="panel-value">{formatDateTime(currentOrder.created_at)}</span>
                  </div>

                  <div className="panel-row">
                    <span className="panel-label">Total</span>
                    <span className="panel-value">{formatTzs(currentOrder.total_tzs)}</span>
                  </div>

                  <div className="panel-row">
                    <span className="panel-label">Delivery</span>
                    <span className="panel-value">{currentOrder.delivery_mode || delivery?.mode || "—"}</span>
                  </div>

                  <div className="panel-row">
                    <span className="panel-label">Distance</span>
                    <span className="panel-value">
                      {currentOrder.km != null ? formatKm(currentOrder.km) : formatKm(delivery?.km)}
                    </span>
                  </div>

                  <div className="panel-row">
                    <span className="panel-label">Fee</span>
                    <span className="panel-value">
                      {currentOrder.fee_tzs != null ? formatTzs(currentOrder.fee_tzs) : formatTzs(delivery?.fee_tzs)}
                    </span>
                  </div>

                  <div className="panel-row">
                    <span className="panel-label">Rider</span>
                    <span className="panel-value">
                      {currentOrder.delivery_agent_phone
                        ? formatPhonePretty(currentOrder.delivery_agent_phone)
                        : "—"}
                    </span>
                  </div>
                </div>

                <div className="rp-actions rp-actions--wrap">
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => void handleUpdateOrderStatus("preparing")}
                    disabled={updatingStatus}
                  >
                    {updatingStatus ? "Updating…" : "Mark preparing"}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => {
                      setShowRiderForm((p) => !p);
                      setStatusError(null);
                    }}
                    disabled={updatingStatus}
                  >
                    {showRiderForm ? "Cancel" : "Out for delivery"}
                  </button>

                  <button
                    type="button"
                    className="btn btn-success btn-xs"
                    onClick={() => void handleUpdateOrderStatus("delivered")}
                    disabled={updatingStatus}
                  >
                    {updatingStatus ? "Updating…" : "Mark delivered"}
                  </button>
                </div>

                {showRiderForm && (
                  <div className="rp-inline-form">
                    <div className="rp-inline-form-row">
                      <input
                        type="tel"
                        className="rp-input"
                        placeholder="Rider phone (e.g. +2557…)"
                        value={riderPhoneInput}
                        onChange={(e) => {
                          setRiderPhoneInput(e.target.value);
                          if (statusError) setStatusError(null);
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-secondary btn-xs"
                        onClick={() => void handleUpdateOrderStatus("out_for_delivery")}
                        disabled={updatingStatus}
                      >
                        {updatingStatus ? "Saving…" : "Confirm"}
                      </button>
                    </div>
                    {statusError && <div className="rp-error">{statusError}</div>}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Payment */}
          <div className="panel-card">
            <div className="rp-card-title-row">
              <div className="panel-card-title">Payment</div>
              <span className={"rp-chip rp-chip--" + paymentUi.tone}>{paymentUi.label}</span>
            </div>

            {!payment ? (
              <div className="panel-card-body panel-card-body--muted">
                No payment record available yet.
              </div>
            ) : (
              <>
                <div className="rp-grid">
                  <div className="panel-row">
                    <span className="panel-label">Order total</span>
                    <span className="panel-value">{formatTzs(orderTotal)}</span>
                  </div>

                  <div className="panel-row">
                    <span className="panel-label">Paid</span>
                    <span className="panel-value">{formatTzs(paidSoFar)}</span>
                  </div>

                  <div className="panel-row">
                    <span className="panel-label">Remaining</span>
                    <span className="panel-value">{formatTzs(remaining)}</span>
                  </div>

                  {payment.method && (
                    <div className="panel-row">
                      <span className="panel-label">Method</span>
                      <span className="panel-value">{payment.method}</span>
                    </div>
                  )}

                  {payment.recipient && (
                    <div className="panel-row">
                      <span className="panel-label">Recipient</span>
                      <span className="panel-value">{payment.recipient}</span>
                    </div>
                  )}
                </div>

                <div className="rp-actions rp-actions--wrap">
                  <button
                    type="button"
                    className="btn btn-secondary btn-xs"
                    onClick={() => void handleUpdatePaymentStatus("verifying")}
                    disabled={updatingPayment}
                  >
                    {updatingPayment ? "Updating…" : "Mark verifying"}
                  </button>

                  <button
                    type="button"
                    className="btn btn-success btn-xs"
                    onClick={() => {
                      setShowPaymentForm((p) => !p);
                      setPaymentError(null);
                    }}
                    disabled={updatingPayment}
                  >
                    {showPaymentForm ? "Cancel" : "Mark paid"}
                  </button>
                </div>

                {showPaymentForm && (
                  <div className="rp-inline-form">
                    <div className="rp-inline-form-row">
                      <input
                        type="number"
                        min={0}
                        className="rp-input"
                        placeholder="Amount in TZS"
                        value={paymentAmountInput}
                        onChange={(e) => {
                          setPaymentAmountInput(e.target.value);
                          if (paymentError) setPaymentError(null);
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn-success btn-xs"
                        onClick={() => void handleUpdatePaymentStatus("paid")}
                        disabled={updatingPayment}
                      >
                        {updatingPayment ? "Saving…" : "Confirm"}
                      </button>
                    </div>
                    {paymentError && <div className="rp-error">{paymentError}</div>}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Stock Alerts list (when available) */}
          {(restock?.subscribed_count ?? 0) > 0 && restock?.items?.length ? (
            <div className="panel-card">
              <div className="rp-card-title-row">
                <div className="panel-card-title">Stock Alerts</div>
                <span className="badge badge--restock">
                  {restock.subscribed_count}
                </span>
              </div>

              <div className="rp-list">
                {restock.items.slice(0, 8).map((it) => (
                  <div key={it.product_id} className="rp-list-row">
                    <div className="rp-list-main">
                      <div className="rp-list-title">{it.name || "Product"}</div>
                      <div className="rp-list-sub">{it.sku}</div>
                    </div>
                    <div className="rp-list-right">{it.status}</div>
                  </div>
                ))}
                {restock.items.length > 8 && (
                  <div className="rp-muted">+{restock.items.length - 8} more</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}

                <div className="panel-card">
            <div className="panel-card-title">Appearance</div>

            <div className="rp-theme-row">
              <button
                type="button"
                className={
                  "rp-theme-btn" + (themeMode === "system" ? " rp-theme-btn--active" : "")
                }
                onClick={() => {
                  setThemeMode("system");
                  applyThemeMode("system");
                }}
              >
                System
              </button>

              <button
                type="button"
                className={
                  "rp-theme-btn" + (themeMode === "light" ? " rp-theme-btn--active" : "")
                }
                onClick={() => {
                  setThemeMode("light");
                  applyThemeMode("light");
                }}
              >
                Light
              </button>

              <button
                type="button"
                className={
                  "rp-theme-btn" + (themeMode === "dark" ? " rp-theme-btn--active" : "")
                }
                onClick={() => {
                  setThemeMode("dark");
                  applyThemeMode("dark");
                }}
              >
                Dark
              </button>
            </div>

            <div className="rp-muted">
              System uses your device theme. Light/Dark forces a manual override.
            </div>
          </div>


      {/* SETTINGS VIEW */}
      {activeView === "settings" && (
        <div className="rp-stack">
          <div className="panel-card">
            <div className="panel-card-title">Conversation settings</div>

            <div className="rp-grid">
              <div className="panel-row">
                <span className="panel-label">Conversation ID</span>
                <span className="panel-value">{conversationId}</span>
              </div>

              <div className="panel-row">
                <span className="panel-label">Customer</span>
                <span className="panel-value">{displayName}</span>
              </div>
            </div>

            <div className="panel-card-body panel-card-body--muted">
              These actions are intentionally separated so admins don’t delete the wrong thing.
              (The destructive endpoints are not wired here yet.)
            </div>

            <div className="rp-actions rp-actions--column">
              <button type="button" className="btn btn-secondary" disabled title="To be implemented">
                Delete selected message (inbox only)
              </button>
              <button type="button" className="btn btn-secondary" disabled title="To be implemented">
                Delete media messages only
              </button>
              <button type="button" className="btn btn-secondary" disabled title="To be implemented">
                Delete orders & related history
              </button>
            </div>
          </div>

          {(restock?.subscribed_count ?? 0) > 0 && restock?.items?.length ? (
            <div className="panel-card">
              <div className="panel-card-title">Stock Alerts</div>
              <div className="rp-list">
                {restock.items.slice(0, 10).map((it) => (
                  <div key={it.product_id} className="rp-list-row">
                    <div className="rp-list-main">
                      <div className="rp-list-title">{it.name || "Product"}</div>
                      <div className="rp-list-sub">{it.sku}</div>
                    </div>
                    <div className="rp-list-right">{it.status}</div>
                  </div>
                ))}
                {restock.items.length > 10 && (
                  <div className="rp-muted">+{restock.items.length - 10} more</div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
