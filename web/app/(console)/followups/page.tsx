"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Badge, Button, Card, EmptyState, Tabs } from "@/components/ui";

type QueueKey = "unpaid_orders" | "order_action_needed" | "restock_reengagement";

type FollowupRow = {
  queue: QueueKey;
  item_key: string;
  customer_id: number;
  customer_name: string | null;
  customer_phone: string | null;
  conversation_id: number | null;
  order_id?: number | null;
  order_code?: string | null;
  payment_status?: string | null;
  amount_due_tzs?: number | null;
  amount_paid_tzs?: number | null;
  status?: string | null;
  reason: string;
  last_interaction_at: string | null;
  product_name?: string | null;
  stock_qty?: number | null;
  template_key: string;
  can_send_template: boolean;
  template_status: string;
  template_status_label: string;
  template_reason_code: string | null;
  template_meta_template_name: string | null;
  template_language_code: string | null;
};

type FollowupsResponse = {
  queues: Record<QueueKey, FollowupRow[]>;
  counts: Record<QueueKey, number>;
};

function formatDate(value?: string | null) {
  if (!value) return "No recent interaction";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("sw-TZ", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(value?: number | null) {
  if (!Number.isFinite(value ?? NaN)) return "-";
  return `${Math.floor(Number(value)).toLocaleString("sw-TZ")} TZS`;
}

function getQueueLabel(queue: QueueKey) {
  if (queue === "unpaid_orders") return "Unpaid order";
  if (queue === "order_action_needed") return "Order action";
  return "Restock / re-engage";
}

function getTemplateLabel(templateKey: string) {
  if (templateKey === "payment_reminder") return "Payment reminder";
  if (templateKey === "order_followup") return "Order follow-up";
  if (templateKey === "restock_reengagement") return "Restock / re-engagement";
  return templateKey;
}

function getTemplateStateTone(status: string) {
  if (status === "ready") return "success" as const;
  if (status === "disabled") return "neutral" as const;
  return "warning" as const;
}

export default function FollowupsPage() {
  const [activeTab, setActiveTab] = useState<QueueKey>("unpaid_orders");
  const [loading, setLoading] = useState(true);
  const [queues, setQueues] = useState<Record<QueueKey, FollowupRow[]>>({
    unpaid_orders: [],
    order_action_needed: [],
    restock_reengagement: [],
  });
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [dismissingKey, setDismissingKey] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api<FollowupsResponse>("/api/followups");
      setQueues(data.queues);
    } catch (err) {
      console.error("Failed to load follow-ups", err);
      toast.error("Unable to load follow-up queues right now.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const counts = useMemo(
    () => ({
      unpaid_orders: queues.unpaid_orders.length,
      order_action_needed: queues.order_action_needed.length,
      restock_reengagement: queues.restock_reengagement.length,
    }),
    [queues]
  );

  async function handleSend(row: FollowupRow) {
    if (!row.can_send_template) {
      toast.error(row.template_status_label);
      return;
    }

    if (!row.conversation_id) {
      toast.error("No inbox conversation is available for this customer yet.");
      return;
    }

    setSendingKey(row.item_key);
    try {
      const params: Record<string, string> = {
        customer_name: row.customer_name ?? "Customer",
      };
      if (row.order_code) params.order_code = row.order_code;
      if (row.amount_due_tzs != null) params.amount_due = formatCurrency(row.amount_due_tzs);
      if (row.product_name) params.product_name = row.product_name;

      await api("/api/send-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: row.conversation_id,
          templateKey: row.template_key,
          params,
        }),
      });

      await api("/api/followups/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queue: row.queue,
          item_key: row.item_key,
        }),
      });

      setQueues((current) => ({
        ...current,
        [row.queue]: current[row.queue].filter((item) => item.item_key !== row.item_key),
      }));
      toast.success("Suggested template sent");
    } catch (err: any) {
      console.error("Failed to send follow-up template", err);
      toast.error(err?.message ?? "Unable to send follow-up right now.");
    } finally {
      setSendingKey(null);
    }
  }

  async function handleDismiss(row: FollowupRow) {
    setDismissingKey(row.item_key);
    try {
      await api("/api/followups/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queue: row.queue,
          item_key: row.item_key,
        }),
      });
      setQueues((current) => ({
        ...current,
        [row.queue]: current[row.queue].filter((item) => item.item_key !== row.item_key),
      }));
    } catch (err: any) {
      console.error("Failed to dismiss follow-up", err);
      toast.error(err?.message ?? "Unable to mark this row handled right now.");
    } finally {
      setDismissingKey(null);
    }
  }

  const activeRows = queues[activeTab];

  return (
    <div className="followups-page">
      <section className="followups-hero ops-masthead">
        <div className="ops-masthead__main">
          <div className="ops-masthead__eyebrow">Operational follow-up</div>
          <div className="ops-masthead__title">Follow-ups</div>
          <div className="ops-masthead__description">
            Work focused 1:1 outreach queues without turning the inbox into a campaign workspace.
          </div>
        </div>
        <div className="ops-masthead__actions">
          <Link href="/inbox" className="ui-button ui-button--secondary">
            Open inbox
          </Link>
          <Link href="/broadcast" className="ui-button ui-button--ghost">
            Open broadcasts
          </Link>
        </div>
      </section>

      <div className="followups-grid">
        <div className="followups-summary">
          <Card className="followups-panel" padding="lg">
            <div className="followups-stats">
              <div className="followups-stat">
                <div className="followups-stat__label">Unpaid orders</div>
                <div className="followups-stat__value">{counts.unpaid_orders}</div>
              </div>
              <div className="followups-stat">
                <div className="followups-stat__label">Order action needed</div>
                <div className="followups-stat__value">{counts.order_action_needed}</div>
              </div>
              <div className="followups-stat">
                <div className="followups-stat__label">Restock / re-engage</div>
                <div className="followups-stat__value">{counts.restock_reengagement}</div>
              </div>
            </div>
          </Card>

          <Card className="followups-panel" padding="lg">
            <Tabs
              value={activeTab}
              onValueChange={(next) => setActiveTab(next as QueueKey)}
              items={[
                { value: "unpaid_orders", label: "Unpaid orders", meta: counts.unpaid_orders },
                {
                  value: "order_action_needed",
                  label: "Order action needed",
                  meta: counts.order_action_needed,
                },
                {
                  value: "restock_reengagement",
                  label: "Restock / re-engagement",
                  meta: counts.restock_reengagement,
                },
              ]}
              ariaLabel="Follow-up queues"
            />

            <div className="followups-list">
              {loading ? (
                <div className="followups-side-copy">Loading queue...</div>
              ) : activeRows.length === 0 ? (
                <EmptyState
                  eyebrow="Queue"
                  title="Nothing to action here."
                  description="This queue is clear right now."
                />
              ) : (
                activeRows.map((row) => (
                  <div key={row.item_key} className="followups-row">
                    <div>
                      <div className="followups-row__chips">
                        <Badge tone="accent">{getQueueLabel(row.queue)}</Badge>
                        <Badge tone="neutral">{getTemplateLabel(row.template_key)}</Badge>
                        <Badge tone={getTemplateStateTone(row.template_status)}>
                          {row.template_status_label}
                        </Badge>
                      </div>
                      <div className="followups-row__title">
                        {row.customer_name || row.customer_phone || "Customer"}
                      </div>
                      <div className="followups-row__meta">
                        {row.order_code ? `Order ${row.order_code} · ` : ""}
                        {row.payment_status ? `Payment ${row.payment_status} · ` : ""}
                        {row.status ? `Status ${row.status} · ` : ""}
                        Last interaction {formatDate(row.last_interaction_at)}
                      </div>
                      {row.amount_due_tzs != null ? (
                        <div className="followups-row__meta">
                          Amount due {formatCurrency(row.amount_due_tzs)}
                          {row.amount_paid_tzs != null
                            ? ` · Paid ${formatCurrency(row.amount_paid_tzs)}`
                            : ""}
                        </div>
                      ) : null}
                      {row.product_name ? (
                        <div className="followups-row__meta">
                          Product {row.product_name}
                          {row.stock_qty != null ? ` · Stock ${row.stock_qty}` : ""}
                        </div>
                      ) : null}
                      <div className="followups-row__reason">{row.reason}</div>
                    </div>

                    <div className="followups-row__actions">
                      {row.can_send_template && row.conversation_id != null ? (
                        <Button
                          size="sm"
                          loading={sendingKey === row.item_key}
                          onClick={() => void handleSend(row)}
                        >
                          Send suggested template
                        </Button>
                      ) : (
                        <div className="followups-row__state">
                          {row.can_send_template ? "Inbox thread required" : row.template_status_label}
                        </div>
                      )}
                      {row.conversation_id != null && row.customer_phone ? (
                        <Link
                          href={`/inbox?phone=${encodeURIComponent(row.customer_phone)}`}
                          className="ui-button ui-button--secondary ui-button--sm"
                        >
                          Open inbox
                        </Link>
                      ) : null}
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={dismissingKey === row.item_key}
                        onClick={() => void handleDismiss(row)}
                      >
                        Mark handled
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="followups-side">
          <Card className="followups-panel" padding="lg">
            <div className="followups-side-copy">
              Each queue uses the corrected template engine and keeps outreach tied to the same
              conversation history operators already use in the inbox.
            </div>
          </Card>
          <Card className="followups-panel" padding="lg">
            <div className="followups-side-copy">
              Successful sends remove the row immediately, while "Mark handled" clears work that
              no longer needs action.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
