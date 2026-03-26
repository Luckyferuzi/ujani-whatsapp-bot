"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";
import { EmptyState, SidePanelSkeleton } from "@/components/ui";
import OperatorTimelineNotes from "@/components/OperatorTimelineNotes";

export interface RightPanelProps {
  conversationId: string | null;
  onClose?: () => void;
}
type CustomerSummary = { name: string | null; phone: string; lang?: string | null };
type DeliverySummary = { mode: string; km?: number | null; fee_tzs?: number | null };
type PaymentSummary = { id?: number; order_id?: number; method?: string | null; recipient?: string | null; status: "awaiting" | "verifying" | "paid" | "failed" | string; amount_tzs?: number | null; total_tzs?: number | null; remaining_tzs?: number | null };
type ConversationSummary = { customer?: CustomerSummary | null; delivery?: DeliverySummary | null; payment?: PaymentSummary | null; restock?: { subscribed_count: number; items: { product_id: number; sku: string; name: string; status: string }[] } | null };
type OrderRow = { id: number; status: string | null; delivery_mode: string | null; km?: number | null; fee_tzs?: number | null; total_tzs: number; phone?: string | null; created_at: string; delivery_agent_phone?: string | null; order_code?: string | null; paid_amount?: number | null };

function formatTzs(value?: number | null) { if (value == null || !Number.isFinite(value)) return "-"; return `${Math.floor(value).toLocaleString("sw-TZ")} TZS`; }
function formatKm(value?: number | null) { if (value == null || !Number.isFinite(value)) return "-"; return `${value.toFixed(1)} km`; }
function formatDateTime(value: string) { const d = new Date(value); if (Number.isNaN(d.getTime())) return value; return d.toLocaleString("sw-TZ", { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
function normalizePaymentStatus(status?: string | null) { const s = (status ?? "").toLowerCase().trim(); if (!s) return { label: "Unknown", tone: "neutral" as const }; if (s === "paid") return { label: "Paid", tone: "success" as const }; if (s === "verifying" || s === "awaiting") return { label: s === "verifying" ? "Verifying" : "Awaiting", tone: "warning" as const }; if (s === "failed") return { label: "Failed", tone: "danger" as const }; return { label: s, tone: "neutral" as const }; }
function normalizeOrderStatus(status?: string | null) { switch ((status ?? "").toLowerCase().trim()) { case "pending": return { label: "Pending", tone: "warning" as const }; case "preparing": return { label: "Preparing", tone: "warning" as const }; case "out_for_delivery": return { label: "Out for delivery", tone: "success" as const }; case "delivered": return { label: "Delivered", tone: "success" as const }; case "cancelled": return { label: "Cancelled", tone: "danger" as const }; case "": return { label: "Unknown", tone: "neutral" as const }; default: return { label: status ?? "Unknown", tone: "neutral" as const }; } }

export default function RightPanel({ conversationId, onClose }: RightPanelProps) {
  const router = useRouter();
  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeView, setActiveView] = useState<"summary" | "activity" | "controls">("summary");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [riderPhoneInput, setRiderPhoneInput] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);
  const [showRiderForm, setShowRiderForm] = useState(false);

  const customer = summary?.customer ?? null;
  const delivery = summary?.delivery ?? null;
  const payment = summary?.payment ?? null;
  const restock = summary?.restock ?? null;
  const latestOrder = orders[0] ?? null;
  const currentOrder = useMemo(() => !orders.length ? null : selectedOrderId == null ? orders[0] ?? null : orders.find((o) => o.id === selectedOrderId) ?? orders[0] ?? null, [orders, selectedOrderId]);
  const displayName = useMemo(() => { const name = customer?.name?.trim(); if (name) return name; if (customer?.phone) return formatPhonePretty(customer.phone); if (latestOrder?.phone) return formatPhonePretty(latestOrder.phone); return "Customer"; }, [customer, latestOrder]);

  async function loadPanelData(showLoading: boolean) {
    if (!conversationId) { setSummary(null); setOrders([]); setSelectedOrderId(null); return; }
    showLoading ? setLoading(true) : setIsRefreshing(true);
    try {
      const [summaryData, ordersData] = await Promise.all([api<ConversationSummary>(`/api/conversations/${conversationId}/summary`), api<{ items: OrderRow[] }>(`/api/conversations/${conversationId}/orders`)]);
      const nextOrders = ordersData?.items ?? [];
      setSummary(summaryData ?? null);
      setOrders(nextOrders);
      setSelectedOrderId((current) => nextOrders.length === 0 ? null : current != null && nextOrders.some((o) => o.id === current) ? current : nextOrders[0].id);
    } finally {
      showLoading ? setLoading(false) : setIsRefreshing(false);
    }
  }

  useEffect(() => { void loadPanelData(true); setActiveView("summary"); setPaymentAmountInput(""); setPaymentError(null); setShowPaymentForm(false); setRiderPhoneInput(""); setStatusError(null); setShowRiderForm(false); }, [conversationId]);

  const handleOpenOrdersPage = () => { const phone = customer?.phone || latestOrder?.phone; router.push(phone ? `/orders?${new URLSearchParams({ phone }).toString()}` : "/orders"); };
  const handleUpdatePaymentStatus = async (status: "verifying" | "paid") => {
    if (!payment?.id) return;
    const payload: Record<string, unknown> = { status };
    if (status === "paid") { const numeric = Number(paymentAmountInput.trim().replace(/[^\d]/g, "")); if (!Number.isFinite(numeric) || numeric <= 0) { setPaymentError("Enter a valid amount in TZS."); return; } payload.amount_tzs = numeric; }
    setUpdatingPayment(true); setPaymentError(null);
    try { await api(`/api/payments/${payment.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (status === "paid") { setPaymentAmountInput(""); setShowPaymentForm(false); } await loadPanelData(false); }
    catch (err) { console.error("Failed to update payment status", err); setPaymentError("Failed to update payment. Please try again."); }
    finally { setUpdatingPayment(false); }
  };
  const handleUpdateOrderStatus = async (status: "preparing" | "out_for_delivery" | "delivered") => {
    if (!currentOrder) return;
    const payload: Record<string, unknown> = { status };
    if (status === "out_for_delivery") { const raw = riderPhoneInput.trim(); if (!raw) { setStatusError("Enter rider phone number."); return; } payload.delivery_agent_phone = raw; }
    setUpdatingStatus(true); setStatusError(null);
    try { await api(`/api/orders/${currentOrder.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }); if (status === "out_for_delivery") { setShowRiderForm(false); setRiderPhoneInput(""); } await loadPanelData(false); }
    catch (err) { console.error("Failed to update order status", err); setStatusError("Failed to update order status. Please try again."); }
    finally { setUpdatingStatus(false); }
  };

  if (!conversationId) return <div className="right-panel right-panel--empty"><div className="right-panel-state"><EmptyState eyebrow="Context" title="No conversation selected." description="Choose a conversation to view customer context, orders, payment state, and internal notes." /></div></div>;
  if (loading && !summary && orders.length === 0) return <div className="right-panel"><div className="right-panel-state"><SidePanelSkeleton /></div></div>;

  const paymentUi = normalizePaymentStatus(payment?.status);
  const orderUi = normalizeOrderStatus(currentOrder?.status);
  const orderTotal = payment?.total_tzs ?? currentOrder?.total_tzs ?? null;
  const paidSoFar = payment?.amount_tzs ?? currentOrder?.paid_amount ?? null;
  const remaining = payment?.remaining_tzs ?? (orderTotal != null && paidSoFar != null ? Math.max(0, orderTotal - paidSoFar) : null);

  return (
    <div className="right-panel">
      <div className="panel-header panel-header--tabs">
        <button type="button" className={"panel-header-tab" + (activeView === "summary" ? " panel-header-tab--active" : "")} onClick={() => setActiveView("summary")}><span className="panel-header-tab-label">Summary</span></button>
        <button type="button" className={"panel-header-tab" + (activeView === "activity" ? " panel-header-tab--active" : "")} onClick={() => setActiveView("activity")}><span className="panel-header-tab-label">Activity</span></button>
        <button type="button" className={"panel-header-tab" + (activeView === "controls" ? " panel-header-tab--active" : "")} onClick={() => setActiveView("controls")}><span className="panel-header-tab-label">Controls</span></button>
        <button type="button" className="rp-icon-button" onClick={() => void loadPanelData(false)} disabled={loading || isRefreshing} title="Refresh context" aria-label="Refresh context">Refresh</button>
        {onClose ? <button type="button" className="rp-icon-button" onClick={onClose} title="Close context" aria-label="Close context">Close</button> : null}
      </div>
      {activeView === "summary" ? (
        <div className="rp-stack">
          <div className="panel-card panel-card--hero">
            <div className="rp-hero-top">
              <div><div className="rp-hero-title">{displayName}</div><div className="rp-hero-sub">{customer?.phone ? formatPhonePretty(customer.phone) : "No phone on record"}</div></div>
              {customer?.lang ? <span className="rp-chip rp-chip--neutral">{customer.lang.toUpperCase()}</span> : null}
            </div>
            <div className="rp-hero-stats">
              <div className="rp-hero-stat"><div className="rp-hero-stat-label">Order</div><div className="rp-hero-stat-value">{currentOrder ? orderUi.label : "None"}</div></div>
              <div className="rp-hero-stat"><div className="rp-hero-stat-label">Payment</div><div className="rp-hero-stat-value">{paymentUi.label}</div></div>
              <div className="rp-hero-stat"><div className="rp-hero-stat-label">Delivery</div><div className="rp-hero-stat-value">{currentOrder?.delivery_mode || delivery?.mode || "-"}</div></div>
            </div>
            <div className="rp-actions rp-actions--wrap">
              <button type="button" className="btn btn-secondary btn-xs" onClick={handleOpenOrdersPage}>Order desk</button>
              {payment?.id ? <button type="button" className="btn btn-secondary btn-xs" onClick={() => void handleUpdatePaymentStatus("verifying")} disabled={updatingPayment}>Verify payment</button> : null}
              {currentOrder ? <button type="button" className="btn btn-secondary btn-xs" onClick={() => void handleUpdateOrderStatus("preparing")} disabled={updatingStatus}>Mark preparing</button> : null}
            </div>
          </div>

          <div className="panel-card">
            <div className="rp-card-title-row">
              <div className="panel-card-title">Customer</div>
              {(restock?.subscribed_count ?? 0) > 0 ? <span className="badge badge--restock">Stock Alert{restock!.subscribed_count > 1 ? ` ${restock!.subscribed_count}` : ""}</span> : null}
            </div>
            <div className="rp-grid">
              <div className="panel-row"><span className="panel-label">Name</span><span className="panel-value">{customer?.name || "-"}</span></div>
              <div className="panel-row"><span className="panel-label">Phone</span><span className="panel-value">{customer?.phone ? formatPhonePretty(customer.phone) : "-"}</span></div>
              <div className="panel-row"><span className="panel-label">Language</span><span className="panel-value">{(customer?.lang || "sw").toUpperCase()}</span></div>
            </div>
            <div className="rp-actions"><button type="button" className="btn btn-secondary btn-xs" onClick={handleOpenOrdersPage}>View order history</button></div>
          </div>

          <div className="panel-card">
            <div className="rp-card-title-row">
              <div><div className="panel-card-title">Order</div><div className="panel-card-body panel-card-body--muted">Latest fulfillment state and delivery handoff.</div></div>
              <div className="rp-order-select-wrap">{orders.length > 1 ? <select className="rp-select" value={currentOrder?.id ?? ""} onChange={(e) => setSelectedOrderId(Number(e.target.value))}>{orders.slice(0, 8).map((o) => <option key={o.id} value={o.id}>{(o.order_code || `Order #${o.id}`) + " - " + formatDateTime(o.created_at)}</option>)}</select> : <span className={"rp-chip rp-chip--" + orderUi.tone}>{orderUi.label}</span>}</div>
            </div>
            {!currentOrder ? <div className="panel-card-body panel-card-body--muted">No orders found for this conversation yet.</div> : <>
              <div className="rp-grid">
                <div className="panel-row"><span className="panel-label">Code</span><span className="panel-value">{currentOrder.order_code || `#${currentOrder.id}`}</span></div>
                <div className="panel-row"><span className="panel-label">Status</span><span className={"rp-chip rp-chip--" + orderUi.tone}>{orderUi.label}</span></div>
                <div className="panel-row"><span className="panel-label">Created</span><span className="panel-value">{formatDateTime(currentOrder.created_at)}</span></div>
                <div className="panel-row"><span className="panel-label">Total</span><span className="panel-value">{formatTzs(currentOrder.total_tzs)}</span></div>
                <div className="panel-row"><span className="panel-label">Delivery</span><span className="panel-value">{currentOrder.delivery_mode || delivery?.mode || "-"}</span></div>
                <div className="panel-row"><span className="panel-label">Distance</span><span className="panel-value">{currentOrder.km != null ? formatKm(currentOrder.km) : formatKm(delivery?.km)}</span></div>
                <div className="panel-row"><span className="panel-label">Fee</span><span className="panel-value">{currentOrder.fee_tzs != null ? formatTzs(currentOrder.fee_tzs) : formatTzs(delivery?.fee_tzs)}</span></div>
                <div className="panel-row"><span className="panel-label">Rider</span><span className="panel-value">{currentOrder.delivery_agent_phone ? formatPhonePretty(currentOrder.delivery_agent_phone) : "-"}</span></div>
              </div>
              <div className="rp-actions rp-actions--wrap">
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => void handleUpdateOrderStatus("preparing")} disabled={updatingStatus}>{updatingStatus ? "Updating..." : "Mark preparing"}</button>
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => { setShowRiderForm((p) => !p); setStatusError(null); }} disabled={updatingStatus}>{showRiderForm ? "Cancel" : "Out for delivery"}</button>
                <button type="button" className="btn btn-success btn-xs" onClick={() => void handleUpdateOrderStatus("delivered")} disabled={updatingStatus}>{updatingStatus ? "Updating..." : "Mark delivered"}</button>
              </div>
              {showRiderForm ? <div className="rp-inline-form"><div className="rp-inline-form-row"><input type="tel" className="rp-input" placeholder="Rider phone (for example +2557...)" value={riderPhoneInput} onChange={(e) => { setRiderPhoneInput(e.target.value); if (statusError) setStatusError(null); }} /><button type="button" className="btn btn-secondary btn-xs" onClick={() => void handleUpdateOrderStatus("out_for_delivery")} disabled={updatingStatus}>{updatingStatus ? "Saving..." : "Confirm"}</button></div>{statusError ? <div className="rp-error">{statusError}</div> : null}</div> : null}
            </>}
          </div>

          <div className="panel-card">
            <div className="rp-card-title-row">
              <div><div className="panel-card-title">Payment</div><div className="panel-card-body panel-card-body--muted">Verification and settlement status for the active order.</div></div>
              <span className={"rp-chip rp-chip--" + paymentUi.tone}>{paymentUi.label}</span>
            </div>
            {!payment ? <div className="panel-card-body panel-card-body--muted">No payment record available yet.</div> : <>
              <div className="rp-grid">
                <div className="panel-row"><span className="panel-label">Order total</span><span className="panel-value">{formatTzs(orderTotal)}</span></div>
                <div className="panel-row"><span className="panel-label">Paid</span><span className="panel-value">{formatTzs(paidSoFar)}</span></div>
                <div className="panel-row"><span className="panel-label">Remaining</span><span className="panel-value">{formatTzs(remaining)}</span></div>
                {payment.method ? <div className="panel-row"><span className="panel-label">Method</span><span className="panel-value">{payment.method}</span></div> : null}
                {payment.recipient ? <div className="panel-row"><span className="panel-label">Recipient</span><span className="panel-value">{payment.recipient}</span></div> : null}
              </div>
              <div className="rp-actions rp-actions--wrap">
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => void handleUpdatePaymentStatus("verifying")} disabled={updatingPayment}>{updatingPayment ? "Updating..." : "Mark verifying"}</button>
                <button type="button" className="btn btn-success btn-xs" onClick={() => { setShowPaymentForm((p) => !p); setPaymentError(null); }} disabled={updatingPayment}>{showPaymentForm ? "Cancel" : "Mark paid"}</button>
              </div>
              {showPaymentForm ? <div className="rp-inline-form"><div className="rp-inline-form-row"><input type="number" min={0} className="rp-input" placeholder="Amount in TZS" value={paymentAmountInput} onChange={(e) => { setPaymentAmountInput(e.target.value); if (paymentError) setPaymentError(null); }} /><button type="button" className="btn btn-success btn-xs" onClick={() => void handleUpdatePaymentStatus("paid")} disabled={updatingPayment}>{updatingPayment ? "Saving..." : "Confirm"}</button></div>{paymentError ? <div className="rp-error">{paymentError}</div> : null}</div> : null}
            </>}
          </div>

        </div>
      ) : activeView === "activity" ? (
        <div className="rp-stack">
          {orders.length > 1 ? (
            <div className="panel-card">
              <div className="rp-card-title-row">
                <div>
                  <div className="panel-card-title">Related orders</div>
                  <div className="panel-card-body panel-card-body--muted">Recent order history for this conversation.</div>
                </div>
              </div>
              <div className="rp-list">
                {orders.slice(0, 8).map((order) => {
                  const statusUi = normalizeOrderStatus(order.status);
                  const selected = order.id === currentOrder?.id;
                  return (
                    <button
                      key={order.id}
                      type="button"
                      className={"rp-list-row rp-list-row--button" + (selected ? " rp-list-row--active" : "")}
                      onClick={() => setSelectedOrderId(order.id)}
                    >
                      <div className="rp-list-main">
                        <div className="rp-list-title">{order.order_code || `Order #${order.id}`}</div>
                        <div className="rp-list-sub">{formatDateTime(order.created_at)}</div>
                      </div>
                      <div className="rp-list-right">
                        <span className={"rp-chip rp-chip--" + statusUi.tone}>{statusUi.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {(restock?.subscribed_count ?? 0) > 0 && restock?.items?.length ? <div className="panel-card"><div className="rp-card-title-row"><div className="panel-card-title">Stock alerts</div><span className="badge badge--restock">{restock.subscribed_count}</span></div><div className="rp-list">{restock.items.slice(0, 8).map((it) => <div key={it.product_id} className="rp-list-row"><div className="rp-list-main"><div className="rp-list-title">{it.name || "Product"}</div><div className="rp-list-sub">{it.sku}</div></div><div className="rp-list-right">{it.status}</div></div>)}{restock.items.length > 8 ? <div className="rp-muted">+{restock.items.length - 8} more</div> : null}</div></div> : null}

          <div className="panel-card">
            <OperatorTimelineNotes title="Timeline & Notes" timelinePath={conversationId ? `/api/conversations/${conversationId}/timeline` : null} notePath={conversationId ? `/api/conversations/${conversationId}/notes` : null} emptyState="No business history yet for this conversation." notePlaceholder="Add an internal note for payment checks, delivery context, or customer history." refreshKey={`${conversationId ?? "none"}:${currentOrder?.id ?? "none"}`} />
          </div>
        </div>
      ) : (
        <div className="rp-stack">
          <div className="panel-card">
            <div className="panel-card-title">Conversation controls</div>
            <div className="rp-grid">
              <div className="panel-row"><span className="panel-label">Conversation ID</span><span className="panel-value">{conversationId}</span></div>
              <div className="panel-row"><span className="panel-label">Customer</span><span className="panel-value">{displayName}</span></div>
            </div>
            <div className="panel-card-body panel-card-body--muted">Destructive tools stay separated here so operators do not remove the wrong data while working in the thread.</div>
            <div className="rp-actions rp-actions--column">
              <button type="button" className="btn btn-secondary" disabled>Delete selected message</button>
              <button type="button" className="btn btn-secondary" disabled>Delete media messages</button>
              <button type="button" className="btn btn-secondary" disabled>Delete orders and history</button>
            </div>
          </div>

          {(restock?.subscribed_count ?? 0) > 0 && restock?.items?.length ? <div className="panel-card"><div className="panel-card-title">Stock alerts</div><div className="rp-list">{restock.items.slice(0, 10).map((it) => <div key={it.product_id} className="rp-list-row"><div className="rp-list-main"><div className="rp-list-title">{it.name || "Product"}</div><div className="rp-list-sub">{it.sku}</div></div><div className="rp-list-right">{it.status}</div></div>)}{restock.items.length > 10 ? <div className="rp-muted">+{restock.items.length - 10} more</div> : null}</div></div> : null}

        </div>
      )}
    </div>
  );
}
