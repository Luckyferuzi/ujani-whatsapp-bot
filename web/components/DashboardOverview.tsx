"use client";

import { useMemo } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useCachedQuery } from "@/hooks/useCachedQuery";
import {
  Alert,
  Badge,
  Card,
  EmptyState,
  MetricValue,
  RefreshIndicator,
  StatCardSkeleton,
  TableSkeleton,
} from "@/components/ui";

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

type PriorityItem = {
  label: string;
  value: number;
  hint: string;
  href: string;
  tone: "neutral" | "accent" | "warning";
};

type HealthItem = {
  label: string;
  value: string;
  note: string;
  tone: "success" | "warning" | "info";
};

type SignalItem = {
  title: string;
  description: string;
  href: string;
  tone: "accent" | "warning" | "info" | "success";
  ctaLabel?: string;
  previews?: {
    key: string;
    title: string;
    note: string;
    href?: string;
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

function toneForCount(count: number): "neutral" | "accent" | "warning" {
  if (count <= 0) return "neutral";
  if (count >= 5) return "warning";
  return "accent";
}

function badgeToneForPriority(tone: PriorityItem["tone"]) {
  if (tone === "warning") return "warning" as const;
  if (tone === "accent") return "accent" as const;
  return "neutral" as const;
}

export default function DashboardOverview() {
  const { data, error, isLoading: loading, isRefreshing, refetch } = useCachedQuery(
    "dashboard:overview",
    () => api<DashboardOverviewResponse>("/api/dashboard/overview"),
    { staleMs: 20_000 }
  );

  const priorityItems = useMemo<PriorityItem[]>(() => {
    if (!data) return [];
    return [
      {
        label: "Unread chats",
        value: data.inbox.unread_conversations,
        hint:
          data.inbox.unread_conversations > 0
            ? "Inbox attention needed now"
            : "No unread conversations waiting",
        href: "/inbox",
        tone: toneForCount(data.inbox.unread_conversations),
      },
      {
        label: "Payments to review",
        value: data.payments.pending_review,
        hint:
          data.payments.pending_review > 0
            ? "Proofs are waiting for confirmation"
            : "No payments are blocked in review",
        href: "/orders?status=verifying",
        tone: toneForCount(data.payments.pending_review),
      },
      {
        label: "Fulfillment queue",
        value: data.orders.awaiting_fulfillment,
        hint: "Pending, verifying, or preparing orders",
        href: "/orders?status=pending",
        tone: toneForCount(data.orders.awaiting_fulfillment),
      },
      {
        label: "Out for delivery",
        value: data.orders.out_for_delivery,
        hint: "Orders currently with delivery agents",
        href: "/orders",
        tone: data.orders.out_for_delivery > 0 ? "accent" : "neutral",
      },
    ];
  }, [data]);

  const signals = useMemo<SignalItem[]>(() => {
    if (!data) return [];

    const buildOrderQueueHref = (statusValue: string, searchValue?: string | null) => {
      const params = new URLSearchParams();
      params.set("status", statusValue);
      if (searchValue && searchValue.trim()) params.set("q", searchValue.trim());
      return `/orders?${params.toString()}`;
    };

    const paymentPreviewRows = data.recent_activity
      .filter((item) => item.event_type === "payment.proof_submitted")
      .slice(0, 2)
      .map((item) => ({
        key: `payment-${item.id}`,
        title: item.customer_name || item.order_code || "Customer awaiting review",
        note: item.order_code
          ? `${item.order_code} - proof uploaded ${formatTime(item.created_at)}`
          : `Proof uploaded ${formatTime(item.created_at)}`,
        href: buildOrderQueueHref("verifying", item.order_code || item.customer_name),
      }));

    const fulfillmentPreviewRows = data.recent_activity
      .filter(
        (item) =>
          item.event_type === "order.created" ||
          (item.event_type === "order.status_changed" &&
            ["pending", "verifying", "preparing"].includes(
              String(item.payload?.next_status ?? "").toLowerCase()
            ))
      )
      .slice(0, 2)
      .map((item) => ({
        key: `order-${item.id}`,
        title: item.customer_name || item.order_code || `Order #${item.order_id ?? ""}`,
        note: item.order_code
          ? `${item.order_code} - ${formatTime(item.created_at)}`
          : `Awaiting next action - ${formatTime(item.created_at)}`,
        href: buildOrderQueueHref("pending", item.order_code || item.customer_name),
      }));

    const next: SignalItem[] = [];
    if (data.inbox.unread_conversations > 0) {
      next.push({
        title: `${data.inbox.unread_conversations} unread conversation${data.inbox.unread_conversations === 1 ? "" : "s"}`,
        description: "Customer conversations are waiting in the inbox.",
        href: "/inbox",
        tone: data.inbox.unread_conversations >= 5 ? "warning" : "accent",
        ctaLabel: "Open inbox",
      });
    }
    if (data.payments.pending_review > 0) {
      next.push({
        title: `${data.payments.pending_review} payment proof${data.payments.pending_review === 1 ? "" : "s"} pending`,
        description: "Review submitted proofs to keep order flow moving.",
        href: "/orders?status=verifying",
        tone: "warning",
        ctaLabel: "Open verification queue",
        previews: paymentPreviewRows,
      });
    }
    if (data.orders.awaiting_fulfillment > 0) {
      next.push({
        title: `${data.orders.awaiting_fulfillment} order${data.orders.awaiting_fulfillment === 1 ? "" : "s"} awaiting fulfillment`,
        description: "The fulfillment queue needs operational follow-through.",
        href: "/orders?status=pending",
        tone: data.orders.awaiting_fulfillment >= 5 ? "warning" : "accent",
        ctaLabel: "Open pending orders",
        previews: fulfillmentPreviewRows,
      });
    }
    if (next.length === 0) {
      next.push({
        title: "Operations are currently stable",
        description: "No urgent inbox, payment, or fulfillment pressure is visible right now.",
        href: "/inbox",
        tone: "success",
        ctaLabel: "Open inbox",
      });
    }
    return next.slice(0, 3);
  }, [data]);

  const healthItems = useMemo<HealthItem[]>(() => {
    if (!data) return [];
    return [
      {
        label: "Inbox coverage",
        value: `${data.inbox.handover_conversations}`,
        note:
          data.inbox.handover_conversations > 0
            ? "Conversations are actively held by agents"
            : "Bot is carrying most active conversations",
        tone: data.inbox.handover_conversations > 0 ? "info" : "success",
      },
      {
        label: "Order flow",
        value: `${data.orders.out_for_delivery} in transit`,
        note:
          data.orders.awaiting_fulfillment > 0
            ? `${data.orders.awaiting_fulfillment} still waiting to move`
            : "No backlog visible in fulfillment",
        tone: data.orders.awaiting_fulfillment > 0 ? "warning" : "success",
      },
      {
        label: "Revenue pace",
        value: `${formatTzs(data.revenue.today_tzs)} TZS`,
        note: `${formatTzs(data.revenue.week_tzs)} TZS captured in the last 7 days`,
        tone: data.revenue.today_tzs > 0 ? "success" : "info",
      },
    ];
  }, [data]);

  const topProducts = data?.top_products ?? [];
  const recentActivity = data?.recent_activity ?? [];

  if (loading) {
    return (
      <section className="dashboard-command">
        <div className="dashboard-command__masthead">
          <div>
            <div className="dashboard-command__masthead-kicker">Command Center</div>
            <div className="dashboard-command__masthead-title">
              Loading today's operating picture...
            </div>
            <div className="dashboard-command__masthead-copy">
              Checking inbox pressure, payment review, fulfillment movement, and business pace.
            </div>
          </div>
          <RefreshIndicator label="Preparing overview" />
        </div>

        <div className="dashboard-command__priority-grid">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>

        <div className="dashboard-command__layout">
          <div className="dashboard-command__main">
            <Card className="dashboard-command__panel" padding="lg">
              <div className="dashboard-command__panel-head">
                <div className="dashboard-command__panel-title">Needs attention</div>
                <div className="dashboard-command__panel-copy">
                  Priority work for inbox, payments, and fulfillment.
                </div>
              </div>
              <div className="dashboard-command__signal-stack">
                <StatCardSkeleton />
                <StatCardSkeleton />
              </div>
            </Card>

            <Card className="dashboard-command__panel" padding="lg">
              <div className="dashboard-command__panel-head">
                <div className="dashboard-command__panel-title">Recent activity</div>
                <div className="dashboard-command__panel-copy">
                  Latest operational movements across orders and payments.
                </div>
              </div>
              <TableSkeleton rows={5} />
            </Card>
          </div>

          <div className="dashboard-command__side">
            <Card className="dashboard-command__panel" padding="lg">
              <div className="dashboard-command__health-grid">
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </div>
            </Card>
            <Card className="dashboard-command__panel" padding="lg">
              <TableSkeleton rows={4} />
            </Card>
          </div>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="dashboard-command">
        <div className="dashboard-command__masthead">
          <div>
            <div className="dashboard-command__masthead-kicker">Command Center</div>
            <div className="dashboard-command__masthead-title">Dashboard unavailable</div>
            <div className="dashboard-command__masthead-copy">{error.message}</div>
          </div>
          <button
            type="button"
            className="ui-button ui-button--secondary"
            onClick={() => void refetch()}
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="dashboard-command">
      <div className="dashboard-command__masthead">
        <div>
          <div className="dashboard-command__masthead-kicker">Command Center</div>
          <div className="dashboard-command__masthead-title">
            What matters now, in one operational view.
          </div>
          <div className="dashboard-command__masthead-copy">
            Scan pressure in the inbox, payment review, fulfillment movement, and
            current revenue momentum.
          </div>
        </div>
        <div className="dashboard-command__masthead-actions">
          {isRefreshing ? <RefreshIndicator label="Refreshing overview" /> : null}
          <Link href="/inbox" className="ui-button ui-button--primary dashboard-command__header-button">
            Open inbox
          </Link>
          <button
            type="button"
            className="ui-button ui-button--secondary"
            onClick={() => void refetch()}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="dashboard-command__priority-grid">
        {priorityItems.map((item) => (
          <Link
            href={item.href}
            key={item.label}
            className={`dashboard-command__priority dashboard-command__priority--${item.tone}`}
          >
            <div className="dashboard-command__priority-top">
              <div className="dashboard-command__priority-label">{item.label}</div>
              <Badge tone={badgeToneForPriority(item.tone)}>
                {item.tone === "warning" ? "Action" : item.tone === "accent" ? "Watch" : "Stable"}
              </Badge>
            </div>
            <div className="dashboard-command__priority-value ui-tabular-nums">
              <MetricValue value={item.value} refreshing={isRefreshing} width="5ch" />
            </div>
            <div className="dashboard-command__priority-hint">{item.hint}</div>
          </Link>
        ))}
      </div>

      <div className="dashboard-command__layout">
        <div className="dashboard-command__main">
          <Card className="dashboard-command__panel" padding="lg">
            <div className="dashboard-command__panel-head">
              <div>
                <div className="dashboard-command__panel-title">Needs attention</div>
                <div className="dashboard-command__panel-copy">
                  The most actionable operational pressure points right now.
                </div>
              </div>
              <Link href="/orders" className="dashboard-command__inline-link">
                Order desk
              </Link>
            </div>

            <div className="dashboard-command__signal-stack">
              {signals.map((signal) => (
                <Link
                  key={signal.title}
                  href={signal.href}
                  className={`dashboard-command__signal dashboard-command__signal--${signal.tone}`}
                >
                  <div className="dashboard-command__signal-title">{signal.title}</div>
                  <div className="dashboard-command__signal-copy">{signal.description}</div>
                  {signal.previews && signal.previews.length > 0 ? (
                    <div className="dashboard-command__signal-preview-list">
                      {signal.previews.map((preview) => (
                        preview.href ? (
                          <Link
                            key={preview.key}
                            href={preview.href}
                            className="dashboard-command__signal-preview dashboard-command__signal-preview--link"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="dashboard-command__signal-preview-title">
                              {preview.title}
                            </div>
                            <div className="dashboard-command__signal-preview-note">
                              {preview.note}
                            </div>
                          </Link>
                        ) : (
                          <div key={preview.key} className="dashboard-command__signal-preview">
                            <div className="dashboard-command__signal-preview-title">
                              {preview.title}
                            </div>
                            <div className="dashboard-command__signal-preview-note">
                              {preview.note}
                            </div>
                          </div>
                        )
                      ))}
                    </div>
                  ) : null}
                  <div className="dashboard-command__signal-cta">
                    {signal.ctaLabel || "Open queue"}
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="dashboard-command__panel" padding="lg">
            <div className="dashboard-command__panel-head">
              <div>
                <div className="dashboard-command__panel-title">Recent activity</div>
                <div className="dashboard-command__panel-copy">
                  Latest payment, order, and fulfillment changes worth tracking.
                </div>
              </div>
            </div>

            {recentActivity.length === 0 ? (
              <EmptyState
                eyebrow="Activity"
                title="No recent operational activity."
                description="Order and payment events will appear here automatically."
              />
            ) : (
              <div className="dashboard-command__activity-list">
                {recentActivity.map((item) => {
                  const described = describeActivity(item);
                  return (
                    <div key={item.id} className="dashboard-command__activity-item">
                      <div className="dashboard-command__activity-main">
                        <div className="dashboard-command__activity-title">{described.title}</div>
                        <div className="dashboard-command__activity-copy">{described.description}</div>
                      </div>
                      <div className="dashboard-command__activity-meta">
                        <div>{formatTime(item.created_at)}</div>
                        <div>{item.actor_email || item.source || "system"}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        <div className="dashboard-command__side">
          <Card className="dashboard-command__panel" padding="lg">
            <div className="dashboard-command__panel-head">
              <div>
                <div className="dashboard-command__panel-title">System health</div>
                <div className="dashboard-command__panel-copy">
                  A quick read on coverage, movement, and commercial pace.
                </div>
              </div>
            </div>

            <div className="dashboard-command__health-grid">
              {healthItems.map((item) => (
                <div key={item.label} className="dashboard-command__health-card">
                  <Badge tone={item.tone}>{item.label}</Badge>
                  <div className="dashboard-command__health-value ui-tabular-nums">{item.value}</div>
                  <div className="dashboard-command__health-note">{item.note}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="dashboard-command__panel" padding="lg">
            <div className="dashboard-command__panel-head">
              <div>
                <div className="dashboard-command__panel-title">Sales highlights</div>
                <div className="dashboard-command__panel-copy">
                  Best-performing products from the last 7 days.
                </div>
              </div>
              <Link href="/products" className="dashboard-command__inline-link">
                Products
              </Link>
            </div>

            {topProducts.length === 0 ? (
              <EmptyState
                eyebrow="Products"
                title="Not enough sales data yet."
                description="Product highlights will appear once orders start flowing in."
              />
            ) : (
              <div className="dashboard-command__product-list">
                {topProducts.map((product) => (
                  <div key={product.sku} className="dashboard-command__product-row">
                    <div className="dashboard-command__product-main">
                      <div className="dashboard-command__product-name">{product.name}</div>
                      <div className="dashboard-command__product-sku">{product.sku}</div>
                    </div>
                    <div className="dashboard-command__product-meta">
                      <div>{product.total_qty} sold</div>
                      <div>{formatTzs(product.total_revenue)} TZS</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="dashboard-command__panel" padding="lg">
            <div className="dashboard-command__panel-head">
              <div>
                <div className="dashboard-command__panel-title">Quick actions</div>
                <div className="dashboard-command__panel-copy">
                  Jump straight into the operational surfaces the team uses most.
                </div>
              </div>
            </div>

            <div className="dashboard-command__quick-actions">
              <Link href="/inbox" className="dashboard-command__quick-action">
                <div className="dashboard-command__quick-title">Inbox triage</div>
                <div className="dashboard-command__quick-copy">
                  Review unread chats and payment proof submissions.
                </div>
              </Link>
              <Link href="/orders" className="dashboard-command__quick-action">
                <div className="dashboard-command__quick-title">Fulfillment queue</div>
                <div className="dashboard-command__quick-copy">
                  Advance pending, preparing, and delivery orders.
                </div>
              </Link>
              <Link href="/stats" className="dashboard-command__quick-action">
                <div className="dashboard-command__quick-title">Detailed reports</div>
                <div className="dashboard-command__quick-copy">
                  Open deeper revenue and product performance reporting.
                </div>
              </Link>
            </div>
          </Card>

          {signals.length === 1 && signals[0].tone === "success" ? (
            <Alert
              tone="success"
              title="Operational load is currently calm"
              description="No urgent inbox, payment, or fulfillment pressure is visible from this snapshot."
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
