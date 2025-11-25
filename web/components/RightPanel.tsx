"use client";
import { useEffect, useState } from "react";
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
  amount_tzs?: number | null;    // total paid so far
  total_tzs?: number | null;     // order total
  remaining_tzs?: number | null; // remaining balance
};

type ConversationSummary = {
  customer?: CustomerSummary | null;
  delivery?: DeliverySummary | null;
  payment?: PaymentSummary | null;
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
  if (value == null) return "—";
  return `${value.toLocaleString("sw-TZ")} TZS`;
}

function formatKm(value?: number | null): string {
  if (value == null) return "—";
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

function RightPanel({ conversationId }: RightPanelProps) {
    const router = useRouter();
  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<"orders" | "settings">(
    "orders"
  );
const [showLatest, setShowLatest] = useState(false);
const [updatingStatus, setUpdatingStatus] = useState(false);
const [updatingPayment, setUpdatingPayment] = useState(false);
const [paymentAmountInput, setPaymentAmountInput] = useState("");
const [paymentError, setPaymentError] = useState<string | null>(null);
const [riderPhoneInput, setRiderPhoneInput] = useState("");
const [statusError, setStatusError] = useState<string | null>(null);
const [showPaymentForm, setShowPaymentForm] = useState(false);
const [showRiderForm, setShowRiderForm] = useState(false);
const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const handleOpenOrdersPage = () => {
    const phone =
      customer?.phone || latestOrder?.phone || undefined;

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
      return;
    }

    setLoading(true);
    try {
      const [summaryData, ordersData] = await Promise.all([
        api<ConversationSummary>(
          `/api/conversations/${conversationId}/summary`
        ),
        api<{ items: OrderRow[] }>(
          `/api/conversations/${conversationId}/orders`
        ),
      ]);

      setSummary(summaryData);
      const newOrders = ordersData?.items ?? [];
setOrders(newOrders);

if (newOrders.length === 0) {
  setSelectedOrderId(null);
} else if (
  selectedOrderId === null ||
  !newOrders.some((o) => o.id === selectedOrderId)
) {
  setSelectedOrderId(newOrders[0].id);
}

    } catch (err) {
      console.error("Failed to load right panel data", err);
      setSummary(null);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

   useEffect(() => {
  void loadAll();
  setActiveView("orders");
  setShowLatest(false);
  setPaymentAmountInput("");
  setPaymentError(null);
  setRiderPhoneInput("");
  setStatusError(null);
  setShowPaymentForm(false);
  setShowRiderForm(false);
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
const latestOrder: OrderRow | null =
  orders && orders.length > 0 ? orders[0] : null;

const currentOrder: OrderRow | null =
  (selectedOrderId !== null
    ? orders.find((o) => o.id === selectedOrderId) ?? null
    : null) || latestOrder;

  const displayName =
    customer?.name && customer.name.trim().length > 0
      ? customer.name
      : customer?.phone
      ? formatPhonePretty(customer.phone)
      : "Customer";

  const mapOrderStatusLabel = (status: string | null | undefined): string => {
    if (!status) return "unknown";
    switch (status) {
      case "pending":
        return "Pending";
      case "preparing":
        return "Preparing";
      case "out_for_delivery":
        return "Out for delivery";
      case "delivered":
        return "Delivered";
      case "cancelled":
        return "Cancelled";
      default:
        return status;
    }
  };

  const handleUpdatePaymentStatus = async (status: "verifying" | "paid") => {
  if (!payment?.id) return;

  const payload: any = { status };

  if (status === "paid") {
    const raw = paymentAmountInput.trim();
    const numeric = Number(raw.replace(/[^\d]/g, ""));
    if (!raw || !Number.isFinite(numeric) || numeric <= 0) {
      setPaymentError("Please enter a valid amount in TZS.");
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
      setShowPaymentForm(false); // hide form after successful payment
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
      setStatusError("Please enter the rider phone number.");
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

  return (
    <div className="right-panel">
      {/* Top bar: Orders + Settings + Refresh */}
      <div className="panel-header panel-header--tabs">
        <button
          type="button"
          className={
            "panel-header-tab" +
            (activeView === "orders" ? " panel-header-tab--active" : "")
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
            "panel-header-tab" +
            (activeView === "settings" ? " panel-header-tab--active" : "")
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
          className="btn btn-xs btn-secondary ml-auto"
          onClick={() => {
            if (!showLatest) {
              void loadAll();
            }
            setShowLatest((prev) => !prev);
          }}
          disabled={loading && !showLatest}
        >
          {showLatest ? "Hide latest" : loading ? "Loading…" : "See latest"}
        </button>

      </div>

      {/* ORDERS VIEW */}
      {activeView === "orders" && (
        <div className="panel-section">
{/* Customer heading */}
<div className="panel-card">
  <div className="panel-card-title">
    Orders for: <span className="font-semibold">{displayName}</span>
  </div>
  <div className="panel-card-body panel-card-body--muted text-xs space-y-2">
    <p>
      Latest order summary and tools to control payment &amp; order status.
    </p>
    <button
      type="button"
      className="btn btn-xs btn-secondary"
      onClick={handleOpenOrdersPage}
    >
      View full order history
    </button>
  </div>
</div>


          {/* Latest order summary */}
                    {/* Latest order summary */}
          <div className="panel-card mt-3">
            <div className="panel-card-title">Latest order summary</div>

              {/* Recent orders list */}
{orders && orders.length > 0 && (
  <div className="panel-subcard mb-3">
    <div className="panel-subcard-title">Recent orders</div>
    <div className="space-y-1">
      {orders.slice(0, 5).map((o) => {
        const active = currentOrder && currentOrder.id === o.id;
        return (
          <button
            key={o.id}
            type="button"
            className={
              "recent-order-row w-full text-left text-xs px-2 py-1 rounded " +
              (active ? "bg-ui-primary text-white" : "hover:bg-ui-subtle")
            }
            onClick={() => setSelectedOrderId(o.id)}
          >
            <div className="flex justify-between">
              <span>
                {o.order_code || `Order #${o.id}`} — {o.status || "pending"}
              </span>
              <span>
                {o.total_tzs.toLocaleString("sw-TZ")}
                {" TZS"}
              </span>
            </div>
            <div className="text-[10px] opacity-75">
              {new Date(o.created_at).toLocaleString("sw-TZ")}
            </div>
          </button>
        );
      })}
    </div>
  </div>
)}


            {!showLatest ? (
              <div className="panel-card-body panel-card-body--muted text-xs">
                Latest order is hidden. Click &quot;See latest&quot; above to
                load it.
              </div>
            ) : loading && !summary ? (
              <div className="panel-card-body panel-card-body--muted">
                Loading…
              </div>
            ) : !delivery && !payment && !customer && !latestOrder ? (
              <div className="panel-card-body panel-card-body--muted">
                Hakuna order iliyohifadhiwa bado kwa mteja huyu.
              </div>
            ) : (
              <div className="panel-card-body space-y-3 text-sm">
                {/* Customer section */}
                {customer && (
                  <div className="panel-subcard">
                    <div className="panel-subcard-title">Customer</div>
                    <div className="panel-row">
                      <span className="panel-label">Name:</span>
                      <span className="panel-value">
                        {customer.name || "—"}
                      </span>
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
                )}

                {/* Delivery summary */}
                {delivery && (
                  <div className="panel-subcard">
                    <div className="panel-subcard-title">Delivery</div>
                    <div className="panel-row">
                      <span className="panel-label">Mode:</span>
                      <span className="panel-value">
                        {delivery.mode || "—"}
                      </span>
                    </div>
                    <div className="panel-row">
                      <span className="panel-label">Distance:</span>
                      <span className="panel-value">
                        {formatKm(delivery.km)}
                      </span>
                    </div>
                    <div className="panel-row">
                      <span className="panel-label">Fee:</span>
                      <span className="panel-value">
                        {formatTzs(delivery.fee_tzs ?? null)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Payment summary + controls */}
                {payment && (
                  <div className="panel-subcard">
                    <div className="panel-subcard-title">Payment</div>

                    <div className="panel-row">
                      <span className="panel-label">Status:</span>
                      <span
                        className={
                          "panel-status panel-status--" + payment.status
                        }
                      >
                        {payment.status || "—"}
                      </span>
                    </div>

                    <div className="panel-row">
                      <span className="panel-label">Order total:</span>
                      <span className="panel-value">
                        {payment.total_tzs != null
                          ? formatTzs(payment.total_tzs)
                          : latestOrder
                          ? formatTzs(latestOrder.total_tzs)
                          : "—"}
                      </span>
                    </div>

                    <div className="panel-row">
                      <span className="panel-label">Paid so far:</span>
                      <span className="panel-value">
                        {payment.amount_tzs != null
                          ? formatTzs(payment.amount_tzs)
                          : "—"}
                      </span>
                    </div>

                    <div className="panel-row">
                      <span className="panel-label">Remaining:</span>
                      <span className="panel-value">
                        {payment.remaining_tzs != null
                          ? formatTzs(payment.remaining_tzs)
                          : payment.total_tzs != null &&
                            payment.amount_tzs != null
                          ? formatTzs(
                              Math.max(
                                0,
                                payment.total_tzs - payment.amount_tzs
                              )
                            )
                          : "—"}
                      </span>
                    </div>

                    {payment.method && (
                      <div className="panel-row">
                        <span className="panel-label">Method:</span>
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

                    <div className="mt-2 space-y-2">
  {/* Actions row */}
  <div className="panel-actions">
    <button
      type="button"
      className="btn btn-secondary btn-xs"
      onClick={() => void handleUpdatePaymentStatus("verifying")}
      disabled={updatingPayment}
    >
      {updatingPayment && payment.status !== "paid"
        ? "Updating…"
        : "Mark verifying"}
    </button>
    <button
      type="button"
      className="btn btn-success btn-xs"
      onClick={() => {
        setShowPaymentForm((prev) => !prev);
        setPaymentError(null);
      }}
      disabled={updatingPayment}
    >
      {showPaymentForm ? "Cancel" : "Mark paid"}
    </button>
  </div>

  {/* Hidden form that appears only after clicking "Mark paid" */}
  {showPaymentForm && (
    <div className="panel-row mt-2">
      <span className="panel-label">Amount:</span>
      <div className="flex-1 flex flex-col gap-1">
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
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
            {updatingPayment ? "Saving…" : "Confirm payment"}
          </button>
        </div>
        {paymentError && (
          <div className="text-xs text-red-600">{paymentError}</div>
        )}
      </div>
    </div>
  )}
</div>

                  </div>
                )}

                {/* Order status controls based on latest order */}
                {/* Order status controls based on latest order */}
{latestOrder && (
  <div className="panel-subcard">
    <div className="panel-subcard-title">Order status</div>

    <div className="panel-row">
      <span className="panel-label">Current:</span>
      <span className="panel-value">
        {mapOrderStatusLabel(latestOrder.status)}
      </span>
    </div>

    <div className="panel-row">
      <span className="panel-label">Rider phone:</span>
      <span className="panel-value">
        {latestOrder.delivery_agent_phone
          ? formatPhonePretty(latestOrder.delivery_agent_phone)
          : "—"}
      </span>
    </div>

    <div className="panel-row">
      <span className="panel-label">Created at:</span>
      <span className="panel-value">
        {formatDateTime(latestOrder.created_at)}
      </span>
    </div>

    <div className="panel-row">
      <span className="panel-label">Total:</span>
      <span className="panel-value">
        {formatTzs(latestOrder.total_tzs)}
      </span>
    </div>

    {/* Main actions */}
    <div className="panel-actions mt-2 flex flex-wrap gap-2">
      <button
        type="button"
        className="btn btn-secondary btn-xs"
        onClick={() => void handleUpdateOrderStatus("preparing")}
        disabled={updatingStatus}
      >
        {updatingStatus && latestOrder.status === "preparing"
          ? "Updating…"
          : "Mark preparing"}
      </button>

      <button
        type="button"
        className="btn btn-secondary btn-xs"
        onClick={() => {
          setShowRiderForm((prev) => !prev);
          setStatusError(null);
        }}
        disabled={updatingStatus}
      >
        {showRiderForm ? "Cancel" : "Mark out for delivery"}
      </button>

      <button
        type="button"
        className="btn btn-success btn-xs"
        onClick={() => void handleUpdateOrderStatus("delivered")}
        disabled={updatingStatus}
      >
        {updatingStatus && latestOrder.status === "delivered"
          ? "Updating…"
          : "Mark delivered"}
      </button>
    </div>

    {/* Rider phone form, only visible when toggled */}
    {showRiderForm && (
      <div className="panel-row mt-2">
        <span className="panel-label">Set rider phone:</span>
        <div className="flex-1 flex flex-col gap-1">
          <div className="flex gap-2">
            <input
              type="tel"
              className="w-full border border-slate-300 rounded px-2 py-1 text-xs"
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
              onClick={() =>
                void handleUpdateOrderStatus("out_for_delivery")
              }
              disabled={updatingStatus}
            >
              {updatingStatus &&
              latestOrder.status === "out_for_delivery"
                ? "Saving…"
                : "Confirm & send"}
            </button>
          </div>
          {statusError && (
            <div className="text-xs text-red-600">{statusError}</div>
          )}
        </div>
      </div>
    )}
  </div>
)}

              </div>
            )}
          </div>
        </div>
      )}

      {/* SETTINGS VIEW */}
      {activeView === "settings" && (
        <div className="panel-section">
          <div className="panel-card">
            <div className="panel-card-title">Conversation settings</div>
            <div className="panel-card-body text-sm space-y-3">
              <div className="panel-row">
                <span className="panel-label">Conversation ID:</span>
                <span className="panel-value">{conversationId}</span>
              </div>
              {customer && (
                <div className="panel-row">
                  <span className="panel-label">Customer:</span>
                  <span className="panel-value">{displayName}</span>
                </div>
              )}

              <p className="panel-help">
                Manage this conversation from the admin side. Here we clearly
                separate deleting messages, deleting media, and deleting orders
                so you always know what you&apos;re affecting.
              </p>

              <div className="panel-actions panel-actions--column">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled
                  title="To be implemented"
                >
                  Delete selected message (inbox only)
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled
                  title="To be implemented"
                >
                  Delete media messages only
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled
                  title="To be implemented"
                >
                  Delete orders & related history
                </button>
              </div>

              <p className="panel-help text-xs">
                Note: these actions will affect the admin inbox and stored data.
                They will not delete messages from the customer&apos;s WhatsApp
                chat history.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RightPanel;
