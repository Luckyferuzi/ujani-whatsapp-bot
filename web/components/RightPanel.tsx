"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";
import { EmptyState, SidePanelSkeleton } from "@/components/ui";
import OperatorTimelineNotes from "@/components/OperatorTimelineNotes";
import type { Convo } from "./ConversationList";

export interface RightPanelProps {
  conversationId: string | null;
  conversation?: Convo | null;
  onClose?: () => void;
}

type CustomerSummary = { name: string | null; phone: string; lang?: string | null };
type DeliverySummary = { mode: string; km?: number | null; fee_tzs?: number | null };
type PaymentSummary = {
  id?: number;
  method?: string | null;
  recipient?: string | null;
  status: string;
  amount_tzs?: number | null;
  total_tzs?: number | null;
  remaining_tzs?: number | null;
};
type ConversationSummary = {
  customer?: CustomerSummary | null;
  delivery?: DeliverySummary | null;
  payment?: PaymentSummary | null;
  restock?: { subscribed_count: number; items: { product_id: number; sku: string; name: string; status: string }[] } | null;
};
type OrderRow = {
  id: number;
  status: string | null;
  delivery_mode: string | null;
  km?: number | null;
  fee_tzs?: number | null;
  total_tzs: number;
  phone?: string | null;
  created_at: string;
  delivery_agent_phone?: string | null;
  order_code?: string | null;
  paid_amount?: number | null;
};

function formatTzs(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${Math.floor(value).toLocaleString("sw-TZ")} TZS`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("sw-TZ", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeLastActivity(value?: string | null) {
  if (!value) return "No recent activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No recent activity";
  const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 60) return `Last message ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Last message ${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `Last message ${days} day${days === 1 ? "" : "s"} ago`;
}

function orderStatusLabel(status?: string | null) {
  const raw = (status ?? "").toLowerCase().trim();
  if (raw === "pending") return "Payment pending";
  if (raw === "preparing") return "Preparing";
  if (raw === "out_for_delivery") return "Out for delivery";
  if (raw === "delivered") return "Completed";
  if (raw === "cancelled") return "Cancelled";
  return "Order placed";
}

function paymentStatusLabel(status?: string | null) {
  const raw = (status ?? "").toLowerCase().trim();
  if (raw === "paid") return "Paid";
  if (raw === "verifying") return "Verifying";
  if (raw === "awaiting") return "Awaiting";
  if (raw === "failed") return "Failed";
  return "Unknown";
}

function buildTimeline(order: OrderRow | null, payment: PaymentSummary | null) {
  const orderStatus = (order?.status ?? "").toLowerCase().trim();
  const paymentStatus = (payment?.status ?? "").toLowerCase().trim();
  return [
    { key: "placed", label: "Order placed", state: order ? "completed" : "current" },
    {
      key: "payment",
      label: paymentStatus === "paid" ? "Payment received" : "Payment pending",
      state: paymentStatus === "paid" ? "completed" : order ? "current" : "upcoming",
    },
    {
      key: "preparing",
      label: "Preparing",
      state: orderStatus === "preparing" || orderStatus === "out_for_delivery" || orderStatus === "delivered" ? "completed" : "upcoming",
    },
    {
      key: "delivery",
      label: "Out for delivery",
      state: orderStatus === "delivered" ? "completed" : orderStatus === "out_for_delivery" ? "current" : "upcoming",
    },
    { key: "complete", label: "Completed", state: orderStatus === "delivered" ? "current" : "upcoming" },
  ];
}

export default function RightPanel({ conversationId, conversation, onClose }: RightPanelProps) {
  const router = useRouter();
  const [summary, setSummary] = useState<ConversationSummary | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"summary" | "activity" | "controls">("summary");
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [clearingConversation, setClearingConversation] = useState(false);
  const [clearingMediaOnly, setClearingMediaOnly] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!conversationId) return;
      setLoading(true);
      try {
        const [summaryData, ordersData] = await Promise.all([
          api<ConversationSummary>(`/api/conversations/${conversationId}/summary`),
          api<{ items: OrderRow[] }>(`/api/conversations/${conversationId}/orders`),
        ]);
        if (cancelled) return;
        const nextOrders = ordersData?.items ?? [];
        setSummary(summaryData ?? null);
        setOrders(nextOrders);
        setSelectedOrderId(nextOrders[0]?.id ?? null);
        setActiveTab("summary");
        setMenuOpen(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const customer = summary?.customer ?? null;
  const payment = summary?.payment ?? null;
  const delivery = summary?.delivery ?? null;
  const restock = summary?.restock ?? null;
  const currentOrder = useMemo(
    () => (selectedOrderId == null ? orders[0] ?? null : orders.find((order) => order.id === selectedOrderId) ?? orders[0] ?? null),
    [orders, selectedOrderId]
  );
  const displayName = useMemo(() => {
    const name = customer?.name?.trim() || conversation?.name?.trim();
    if (name) return name;
    return formatPhonePretty(customer?.phone || conversation?.phone || currentOrder?.phone || "");
  }, [conversation?.name, conversation?.phone, currentOrder?.phone, customer?.name, customer?.phone]);

  async function handleClearConversation(mediaOnly = false) {
    const confirmed = window.confirm(
      mediaOnly
        ? "Delete media messages from this conversation? Orders, payments, and the contact will remain."
        : "Clear this conversation history? Orders, payments, and the contact will remain."
    );
    if (!confirmed || !conversationId) return;

    mediaOnly ? setClearingMediaOnly(true) : setClearingConversation(true);
    try {
      const suffix = mediaOnly ? "?mediaOnly=1" : "";
      await api(`/api/conversations/${conversationId}/messages${suffix}`, { method: "DELETE" });
      toast.success(mediaOnly ? "Media messages deleted." : "Conversation history cleared.");
    } catch (error) {
      console.error("Failed to clear conversation", error);
      toast.error("Failed to update conversation history. Please try again.");
    } finally {
      mediaOnly ? setClearingMediaOnly(false) : setClearingConversation(false);
    }
  }

  if (!conversationId) {
    return (
      <div className="right-panel right-panel--empty">
        <div className="right-panel-state">
          <EmptyState eyebrow="Summary" title="No conversation selected." description="Choose a conversation to view customer context, orders, payment state, and notes." />
        </div>
      </div>
    );
  }

  if (loading && !summary && orders.length === 0) {
    return (
      <div className="right-panel">
        <div className="right-panel-state">
          <SidePanelSkeleton />
        </div>
      </div>
    );
  }

  const timeline = buildTimeline(currentOrder, payment);

  return (
    <div className="right-panel">
      <div className="rp-header">
        <div className="rp-header-copy">
          <div className="rp-header-title-row">
            <div className="rp-header-title">{displayName || "Customer"}</div>
            <span className="conversation-inline-badge">{currentOrder ? orderStatusLabel(currentOrder.status) : "No order"}</span>
          </div>
          <div className="rp-header-subtitle">{formatPhonePretty(customer?.phone || conversation?.phone || "")}</div>
        </div>

        <div className="rp-header-menu-wrap">
          <button type="button" className="rp-header-menu-button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen}>
            ...
          </button>
          {menuOpen ? (
            <div className="rp-header-menu">
              <button
                type="button"
                className="rp-header-menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  router.push(`/orders?phone=${encodeURIComponent(customer?.phone || conversation?.phone || "")}`);
                }}
              >
                Open order desk
              </button>
              {onClose ? (
                <button type="button" className="rp-header-menu-item" onClick={() => { setMenuOpen(false); onClose(); }}>
                  Hide summary
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rp-tabs">
        <button type="button" className={"rp-tab" + (activeTab === "summary" ? " rp-tab--active" : "")} onClick={() => setActiveTab("summary")}>Summary</button>
        <button type="button" className={"rp-tab" + (activeTab === "activity" ? " rp-tab--active" : "")} onClick={() => setActiveTab("activity")}>Activity</button>
        <button type="button" className={"rp-tab" + (activeTab === "controls" ? " rp-tab--active" : "")} onClick={() => setActiveTab("controls")}>Controls</button>
      </div>

      {activeTab === "summary" ? (
        <div className="rp-body">
          <section className="rp-section">
            <div className="rp-section-heading">Customer</div>
            <div className="rp-customer-grid">
              <div><div className="rp-meta-label">Name</div><div className="rp-meta-value">{customer?.name || displayName || "-"}</div></div>
              <div><div className="rp-meta-label">Phone</div><div className="rp-meta-value">{formatPhonePretty(customer?.phone || conversation?.phone || "")}</div></div>
              <div><div className="rp-meta-label">Language</div><div className="rp-meta-value">{(customer?.lang || conversation?.lang || "sw").toUpperCase()}</div></div>
              <div><div className="rp-meta-label">Last activity</div><div className="rp-meta-value">{relativeLastActivity(conversation?.last_message_at || conversation?.last_user_message_at)}</div></div>
              <div><div className="rp-meta-label">Orders</div><div className="rp-meta-value">{orders.length}</div></div>
            </div>
          </section>

          <section className="rp-section">
            <div className="rp-section-head">
              <div>
                <div className="rp-section-heading">Order progress</div>
                <div className="rp-section-copy">Current order journey in one compact timeline.</div>
              </div>
              {orders.length > 1 ? (
                <select className="rp-select" value={currentOrder?.id ?? ""} onChange={(event) => setSelectedOrderId(Number(event.target.value))}>
                  {orders.slice(0, 8).map((order) => (
                    <option key={order.id} value={order.id}>
                      {(order.order_code || `Order #${order.id}`) + " - " + formatDateTime(order.created_at)}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>

            <div className="rp-timeline">
              {timeline.map((step) => (
                <div key={step.key} className={"rp-timeline-item rp-timeline-item--" + step.state}>
                  <div className="rp-timeline-dot" aria-hidden="true" />
                  <div className="rp-timeline-label">{step.label}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="rp-section">
            <div className="rp-section-heading">Order details</div>
            {!currentOrder ? (
              <div className="rp-empty-copy">No orders found for this conversation yet.</div>
            ) : (
              <div className="rp-detail-grid">
                <div><div className="rp-meta-label">Order ID</div><div className="rp-meta-value">{currentOrder.order_code || `#${currentOrder.id}`}</div></div>
                <div><div className="rp-meta-label">Status</div><div className="rp-meta-value">{orderStatusLabel(currentOrder.status)}</div></div>
                <div><div className="rp-meta-label">Payment</div><div className="rp-meta-value">{paymentStatusLabel(payment?.status)}</div></div>
                <div><div className="rp-meta-label">Total</div><div className="rp-meta-value">{formatTzs(payment?.total_tzs ?? currentOrder.total_tzs)}</div></div>
                <div><div className="rp-meta-label">Paid</div><div className="rp-meta-value">{formatTzs(payment?.amount_tzs ?? currentOrder.paid_amount)}</div></div>
                <div><div className="rp-meta-label">Remaining</div><div className="rp-meta-value">{formatTzs(payment?.remaining_tzs)}</div></div>
                <div><div className="rp-meta-label">Delivery type</div><div className="rp-meta-value">{currentOrder.delivery_mode || delivery?.mode || "-"}</div></div>
                <div><div className="rp-meta-label">Recipient</div><div className="rp-meta-value">{payment?.recipient || payment?.method || "-"}</div></div>
              </div>
            )}
          </section>
        </div>
      ) : activeTab === "activity" ? (
        <div className="rp-body">
          {(restock?.subscribed_count ?? 0) > 0 ? (
            <section className="rp-section">
              <div className="rp-section-heading">Stock alerts</div>
              <div className="rp-activity-list">
                {(restock?.items ?? []).slice(0, 8).map((item) => (
                  <div key={item.product_id} className="rp-activity-item rp-activity-item--static">
                    <div>
                      <div className="rp-meta-value">{item.name || "Product"}</div>
                      <div className="rp-meta-caption">{item.sku}</div>
                    </div>
                    <div className="rp-meta-caption">{item.status}</div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="rp-section">
            <div className="rp-section-heading">Timeline and notes</div>
            <OperatorTimelineNotes
              title="Internal activity"
              timelinePath={conversationId ? `/api/conversations/${conversationId}/timeline` : null}
              notePath={conversationId ? `/api/conversations/${conversationId}/notes` : null}
              emptyState="No business history yet for this conversation."
              notePlaceholder="Add an internal note for payment checks, delivery context, or customer history."
              refreshKey={`${conversationId}:${currentOrder?.id ?? "none"}`}
            />
          </section>
        </div>
      ) : (
        <div className="rp-body">
          <section className="rp-section">
            <div className="rp-section-heading">Conversation controls</div>
            <div className="rp-section-copy">Delete chat history or media here. Contact deletion is not available yet because customer business records may still be linked to orders and payments.</div>
            <div className="rp-action-stack">
              <button type="button" className="ui-button ui-button--secondary" onClick={() => void handleClearConversation(false)} disabled={clearingConversation || clearingMediaOnly}>
                {clearingConversation ? "Clearing..." : "Clear chat history"}
              </button>
              <button type="button" className="ui-button ui-button--secondary" onClick={() => void handleClearConversation(true)} disabled={clearingConversation || clearingMediaOnly}>
                {clearingMediaOnly ? "Deleting media..." : "Delete media only"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
