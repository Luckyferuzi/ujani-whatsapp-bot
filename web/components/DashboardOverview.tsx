"use client";

import { useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useCachedQuery } from "@/hooks/useCachedQuery";

type DashboardOverviewResponse = {
  inbox: {
    unread_conversations: number;
    handover_conversations: number;
  };
  orders: {
    today: number;
    awaiting_fulfillment: number;
    out_for_delivery: number;
  };
  payments: {
    pending_review: number;
  };
  revenue: {
    today_tzs: number;
    week_tzs: number;
  };
  top_products: {
    sku: string;
    name: string;
    total_qty: number;
    total_revenue: number;
  }[];
  recent_activity: {
    id: number;
    event_type: string;
    actor_type: string | null;
    actor_email: string | null;
    source: string | null;
    created_at: string;
    order_id: number | null;
    order_code: string | null;
    customer_name: string | null;
    payload: Record<string, any>;
  }[];
};

function formatTzs(value: number) {
  return Math.floor(value || 0).toLocaleString("sw-TZ");
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("sw-TZ", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function describeActivity(item: DashboardOverviewResponse["recent_activity"][number]) {
  switch (item.event_type) {
    case "order.created":
      return {
        title: `Order ${item.order_code || `#${item.order_id}` || ""} created`,
        description: item.customer_name ? `New order for ${item.customer_name}` : "New order created",
      };
    case "payment.proof_submitted":
      return {
        title: "Payment proof submitted",
        description: item.customer_name
          ? `${item.customer_name} submitted payment proof`
          : "Customer submitted payment proof",
      };
    case "payment.status_changed":
      return {
        title: "Payment status updated",
        description: item.payload?.next_status
          ? `Payment moved to ${String(item.payload.next_status)}`
          : "Payment review changed",
      };
    case "order.status_changed":
      return {
        title: "Order status changed",
        description: item.payload?.next_status
          ? `Order moved to ${String(item.payload.next_status)}`
          : "Order status updated",
      };
    default:
      return {
        title: item.event_type.replace(/[._]/g, " "),
        description: item.customer_name || "Recent business activity",
      };
  }
}

type ActionCardProps = {
  label: string;
  value: string | number;
  hint: string;
  href: string;
  tone?: "default" | "accent" | "warn";
};

function ActionCard({ label, value, hint, href, tone = "default" }: ActionCardProps) {
  return (
    <Link href={href} className={`dashboard-action-card dashboard-action-card--${tone}`}>
      <div className="dashboard-action-label">{label}</div>
      <div className="dashboard-action-value">{value}</div>
      <div className="dashboard-action-hint">{hint}</div>
    </Link>
  );
}

export default function DashboardOverview() {
  const { data, error, isLoading: loading, isRefreshing, refetch } = useCachedQuery(
    "dashboard:overview",
    () => api<DashboardOverviewResponse>("/api/dashboard/overview"),
    { staleMs: 20_000 }
  );

  const actionItems = useMemo(() => {
    if (!data) return [];
    return [
      {
        label: "Unread chats",
        value: data.inbox.unread_conversations,
        hint: data.inbox.unread_conversations > 0 ? "Requires inbox attention now" : "No unread conversations",
        href: "/inbox",
        tone: data.inbox.unread_conversations > 0 ? ("accent" as const) : ("default" as const),
      },
      {
        label: "Pending payments",
        value: data.payments.pending_review,
        hint: data.payments.pending_review > 0 ? "Proofs waiting for review" : "No payments waiting",
        href: "/inbox",
        tone: data.payments.pending_review > 0 ? ("warn" as const) : ("default" as const),
      },
      {
        label: "Awaiting fulfillment",
        value: data.orders.awaiting_fulfillment,
        hint: "Pending, verifying, or preparing orders",
        href: "/orders",
        tone: data.orders.awaiting_fulfillment > 0 ? ("accent" as const) : ("default" as const),
      },
      {
        label: "Out for delivery",
        value: data.orders.out_for_delivery,
        hint: "Orders currently with delivery agents",
        href: "/orders",
        tone: "default" as const,
      },
    ];
  }, [data]);

  if (loading) {
    return (
      <section className="dashboard-overview">
        <div className="dashboard-hero">
          <div className="dashboard-kicker">Command Overview</div>
          <div className="dashboard-title">Loading today&apos;s priorities...</div>
          <div className="dashboard-subtitle">Checking inbox load, fulfillment pressure, and commercial activity.</div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="dashboard-overview">
        <div className="dashboard-hero">
          <div className="dashboard-kicker">Command Overview</div>
          <div className="dashboard-title">Dashboard unavailable</div>
          <div className="dashboard-subtitle">{error.message}</div>
          <button type="button" className="console-home-link console-home-link--secondary" onClick={() => void refetch()}>
            Try again
          </button>
        </div>
      </section>
    );
  }

  const topProducts = data?.top_products ?? [];
  const recentActivity = data?.recent_activity ?? [];

  return (
    <section className="dashboard-overview">
      <div className="dashboard-hero">
        <div>
          <div className="dashboard-kicker">Command Overview</div>
          <div className="dashboard-title">Focus the team on what needs action today.</div>
          <div className="dashboard-subtitle">
            This view prioritizes inbox pressure, payment review, fulfillment movement, and current business momentum.
          </div>
        </div>
        <div className="dashboard-hero-actions">
          <Link href="/inbox" className="console-home-link">
            Open inbox
          </Link>
          <button type="button" className="console-home-link console-home-link--secondary" onClick={() => void refetch()}>
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="dashboard-action-grid">
        {actionItems.map((item) => (
          <ActionCard key={item.label} {...item} />
        ))}
      </div>

      <div className="dashboard-main-grid">
        <div className="dashboard-column">
          <div className="dashboard-panel">
            <div className="dashboard-panel-head">
              <div>
                <div className="dashboard-panel-title">Commercial snapshot</div>
                <div className="dashboard-panel-subtitle">Quick revenue and order signals for owners and operators.</div>
              </div>
            </div>

            <div className="dashboard-metric-grid">
              <div className="dashboard-metric-card">
                <div className="dashboard-metric-label">Orders today</div>
                <div className="dashboard-metric-value">{data?.orders.today ?? 0}</div>
                <div className="dashboard-metric-sub">New orders created since midnight.</div>
              </div>

              <div className="dashboard-metric-card">
                <div className="dashboard-metric-label">Revenue today</div>
                <div className="dashboard-metric-value">{formatTzs(data?.revenue.today_tzs ?? 0)} TZS</div>
                <div className="dashboard-metric-sub">Approved income recorded today.</div>
              </div>

              <div className="dashboard-metric-card">
                <div className="dashboard-metric-label">Revenue this week</div>
                <div className="dashboard-metric-value">{formatTzs(data?.revenue.week_tzs ?? 0)} TZS</div>
                <div className="dashboard-metric-sub">Approved income in the last 7 days.</div>
              </div>

              <div className="dashboard-metric-card">
                <div className="dashboard-metric-label">Human handover</div>
                <div className="dashboard-metric-value">{data?.inbox.handover_conversations ?? 0}</div>
                <div className="dashboard-metric-sub">Conversations currently left open for agents.</div>
              </div>
            </div>
          </div>

          <div className="dashboard-panel">
            <div className="dashboard-panel-head">
              <div>
                <div className="dashboard-panel-title">Recent critical activity</div>
                <div className="dashboard-panel-subtitle">Latest payment, order, and fulfillment changes worth tracking.</div>
              </div>
            </div>

            {recentActivity.length === 0 ? (
              <div className="dashboard-empty">No recent critical activity yet. Order and payment events will appear here automatically.</div>
            ) : (
              <div className="dashboard-activity-list">
                {recentActivity.map((item) => {
                  const described = describeActivity(item);
                  return (
                    <div key={item.id} className="dashboard-activity-item">
                      <div className="dashboard-activity-main">
                        <div className="dashboard-activity-title">{described.title}</div>
                        <div className="dashboard-activity-subtitle">{described.description}</div>
                      </div>
                      <div className="dashboard-activity-meta">
                        <div>{formatTime(item.created_at)}</div>
                        <div>{item.actor_email || item.source || "system"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-column dashboard-column--side">
          <div className="dashboard-panel">
            <div className="dashboard-panel-head">
              <div>
                <div className="dashboard-panel-title">Sales highlights</div>
                <div className="dashboard-panel-subtitle">Top-selling products from the last 7 days.</div>
              </div>
              <Link href="/products" className="dashboard-inline-link">
                Products
              </Link>
            </div>

            {topProducts.length === 0 ? (
              <div className="dashboard-empty">Not enough sales data yet. Product highlights will appear once orders start flowing in.</div>
            ) : (
              <div className="dashboard-product-list">
                {topProducts.map((product) => (
                  <div key={product.sku} className="dashboard-product-row">
                    <div className="dashboard-product-main">
                      <div className="dashboard-product-name">{product.name}</div>
                      <div className="dashboard-product-sku">{product.sku}</div>
                    </div>
                    <div className="dashboard-product-meta">
                      <div>{product.total_qty} sold</div>
                      <div>{formatTzs(product.total_revenue)} TZS</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="dashboard-panel">
            <div className="dashboard-panel-head">
              <div>
                <div className="dashboard-panel-title">Action shortcuts</div>
                <div className="dashboard-panel-subtitle">Jump quickly into the places the team uses most.</div>
              </div>
            </div>

            <div className="dashboard-shortcuts">
              <Link href="/inbox" className="dashboard-shortcut">
                <div className="dashboard-shortcut-title">Inbox triage</div>
                <div className="dashboard-shortcut-copy">Review unread chats and proof submissions.</div>
              </Link>
              <Link href="/orders" className="dashboard-shortcut">
                <div className="dashboard-shortcut-title">Fulfillment queue</div>
                <div className="dashboard-shortcut-copy">Advance pending, preparing, and delivery orders.</div>
              </Link>
              <Link href="/stats" className="dashboard-shortcut">
                <div className="dashboard-shortcut-title">Detailed reports</div>
                <div className="dashboard-shortcut-copy">Open deeper revenue and product reporting.</div>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
