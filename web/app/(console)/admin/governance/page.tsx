"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import {
  Alert,
  Badge,
  Button,
  Card,
  Input,
  MetricValue,
  Select,
  Skeleton,
  Textarea,
} from "@/components/ui";
import { API } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";

type ApprovalRow = {
  id: number;
  action_key: string;
  status: string;
  note: string | null;
  payload_json: any;
  requested_at: string;
  requested_by_email?: string | null;
  approved_by_email?: string | null;
  rejected_by_email?: string | null;
  execution_error?: string | null;
};

type RetentionState = {
  message_retention_days: number | null;
  retention_mode: "redact" | "delete";
  retention_last_run_at: string | null;
};

function requireToken(): string {
  const token = getAuthToken();
  if (!token) throw new Error("Session expired. Please sign in again.");
  return token;
}

async function authedFetch(path: string, init?: RequestInit) {
  const token = requireToken();
  return fetch(API + path, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
    },
  });
}

function approvalTone(actionKey: string) {
  if (actionKey.includes("delete")) return "danger" as const;
  if (actionKey.includes("adjust")) return "warning" as const;
  return "accent" as const;
}

export default function GovernancePage() {
  const [retention, setRetention] = useState<RetentionState | null>(null);
  const [days, setDays] = useState("");
  const [mode, setMode] = useState<"redact" | "delete">("redact");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [productId, setProductId] = useState("");
  const [available, setAvailable] = useState("");
  const [note, setNote] = useState("");

  const exports = useMemo(
    () => [
      { key: "contacts", label: "Contacts", description: "Customer records and profile data." },
      { key: "conversations", label: "Conversations", description: "Conversation-level message history exports." },
      { key: "orders", label: "Orders", description: "Order records and fulfillment ledger." },
      { key: "inventory_history", label: "Inventory history", description: "Stock movement and inventory change log." },
      { key: "audit", label: "Audit logs", description: "Security and operational activity records." },
    ],
    []
  );

  async function refreshApprovals() {
    try {
      const res = await authedFetch("/auth/admin/approvals?status=pending&limit=100", { method: "GET" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "approvals_failed");
      setApprovals(data.approvals ?? []);
    } catch (e) {
      console.error(e);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch("/auth/admin/retention", { method: "GET" });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const nextRetention = {
            message_retention_days: data.message_retention_days ?? null,
            retention_mode: data.retention_mode ?? "redact",
            retention_last_run_at: data.retention_last_run_at ?? null,
          } satisfies RetentionState;
          setRetention(nextRetention);
          setDays(nextRetention.message_retention_days ? String(nextRetention.message_retention_days) : "");
          setMode(nextRetention.retention_mode);
        }
      } catch {
        // keep page usable for partial access
      } finally {
        await refreshApprovals();
        setInitialLoading(false);
      }
    })();
  }, []);

  async function downloadCsv(kind: string) {
    try {
      setLoading(true);
      const res = await authedFetch(`/auth/admin/exports/${kind}.csv`, { method: "GET" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "export_failed");
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${kind}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Export downloaded.");
    } catch (e: any) {
      toast.error("Export failed.", { description: e?.message ?? "Unknown error." });
    } finally {
      setLoading(false);
    }
  }

  async function createApproval(action_key: string, payload: any, noteText?: string) {
    setLoading(true);
    try {
      const res = await authedFetch("/auth/admin/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action_key, payload, note: noteText ?? null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "create_approval_failed");
      toast.success("Approval request created.");
      await refreshApprovals();
    } catch (e: any) {
      toast.error("Approval request failed.", { description: e?.message ?? "Unknown error." });
    } finally {
      setLoading(false);
    }
  }

  async function approve(id: number) {
    setLoading(true);
    try {
      const res = await authedFetch(`/auth/admin/approvals/${id}/approve`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "approve_failed");
      toast.success("Approved and executed.");
      await refreshApprovals();
    } catch (e: any) {
      toast.error("Approval failed.", { description: e?.message ?? "Unknown error." });
    } finally {
      setLoading(false);
    }
  }

  async function reject(id: number) {
    setLoading(true);
    try {
      const res = await authedFetch(`/auth/admin/approvals/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "rejected" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "reject_failed");
      toast.success("Request rejected.");
      await refreshApprovals();
    } catch (e: any) {
      toast.error("Reject failed.", { description: e?.message ?? "Unknown error." });
    } finally {
      setLoading(false);
    }
  }

  async function saveRetention() {
    setLoading(true);
    try {
      const payload = {
        message_retention_days: days.trim() === "" ? null : Number(days),
        retention_mode: mode,
      };

      const res = await authedFetch("/auth/admin/retention", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data?.approval_id) {
        toast.info("Delete mode requires approval.", { description: `Request #${data.approval_id} was created.` });
        await refreshApprovals();
        return;
      }

      if (!res.ok) throw new Error(data?.error ?? "save_failed");

      const nextRetention = {
        message_retention_days: data.settings?.message_retention_days ?? payload.message_retention_days,
        retention_mode: data.settings?.retention_mode ?? mode,
        retention_last_run_at: data.settings?.retention_last_run_at ?? retention?.retention_last_run_at ?? null,
      } satisfies RetentionState;

      setRetention(nextRetention);
      toast.success("Retention settings saved.");
    } catch (e: any) {
      toast.error("Save failed.", { description: e?.message ?? "Unknown error." });
    } finally {
      setLoading(false);
    }
  }

  async function runRetentionNow() {
    setLoading(true);
    try {
      const res = await authedFetch("/auth/admin/retention/run", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409 && data?.approval_id) {
        toast.info("Delete run requires approval.", { description: `Request #${data.approval_id} was created.` });
        await refreshApprovals();
        return;
      }

      if (!res.ok) throw new Error(data?.error ?? "run_failed");
      toast.success("Retention executed.", { description: `Affected: ${data.affected} (mode: ${data.mode})` });
    } catch (e: any) {
      toast.error("Retention run failed.", { description: e?.message ?? "Unknown error." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-hub-page">
      <PageHeader
        eyebrow="Admin hub"
        section="Governance"
        title="Governance Console"
        description="Handle approvals, exports, and retention controls through one serious governance surface with clear action hierarchy."
        actions={
          <div className="admin-hub-actions">
            <Badge tone="warning">{approvals.length} pending approvals</Badge>
            {loading ? <Badge tone="neutral">Working</Badge> : null}
          </div>
        }
      />

      <div className="admin-hub-summary">
        <div className="admin-hub-stat-card">
          <div className="admin-hub-stat-label">Pending approvals</div>
          <div className="admin-hub-stat-value"><MetricValue value={approvals.length} loading={initialLoading} width="4ch" /></div>
          <div className="admin-hub-muted">High-risk actions waiting for a decision.</div>
        </div>
        <div className="admin-hub-stat-card">
          <div className="admin-hub-stat-label">Retention mode</div>
          <div className="admin-hub-stat-value">{retention?.retention_mode === "delete" ? "Delete" : "Redact"}</div>
          <div className="admin-hub-muted">Current message retention action.</div>
        </div>
        <div className="admin-hub-stat-card">
          <div className="admin-hub-stat-label">Retention window</div>
          <div className="admin-hub-stat-value">{retention?.message_retention_days ?? "-"}</div>
          <div className="admin-hub-muted">Blank means keep data indefinitely.</div>
        </div>
      </div>

      <div className="admin-hub-main-grid">
        <Card padding="lg" className="admin-hub-section">
          <div className="admin-hub-card-head">
            <div>
              <div className="admin-hub-eyebrow">Approvals queue</div>
              <h3 className="admin-hub-title">Pending requests</h3>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void refreshApprovals()} disabled={loading}>Refresh queue</Button>
          </div>

          {initialLoading ? (
            <div className="admin-hub-queue">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="admin-hub-queue-item">
                  <Skeleton style={{ width: "34%", height: 14 }} />
                  <Skeleton style={{ width: "76%", height: 12 }} />
                  <Skeleton style={{ width: "100%", height: 12 }} />
                </div>
              ))}
            </div>
          ) : approvals.length === 0 ? (
            <div className="admin-hub-empty">
              <div className="admin-hub-empty-title">No pending approvals</div>
              <div className="admin-hub-empty-copy">Sensitive governance actions are clear right now.</div>
            </div>
          ) : (
            <div className="admin-hub-queue">
              {approvals.map((approval) => (
                <div key={approval.id} className="admin-hub-queue-item">
                  <div className="admin-hub-card-head">
                    <div>
                      <div className="admin-hub-title">#{approval.id} {approval.action_key}</div>
                      <div className="admin-hub-meta">
                        Requested by {approval.requested_by_email ?? "unknown"} on {new Date(approval.requested_at).toLocaleString()}
                      </div>
                    </div>
                    <Badge tone={approvalTone(approval.action_key)}>{approval.status}</Badge>
                  </div>
                  {approval.note ? <div className="admin-hub-copy">{approval.note}</div> : null}
                  <div className="admin-hub-code">{JSON.stringify(approval.payload_json ?? {}, null, 2)}</div>
                  {approval.execution_error ? <Alert tone="danger" title="Execution error" description={approval.execution_error} /> : null}
                  <div className="admin-hub-inline-actions">
                    <Button size="sm" onClick={() => void approve(approval.id)} disabled={loading}>Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => void reject(approval.id)} disabled={loading}>Reject</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="admin-hub-detail-stack">
          <Card padding="lg" className="admin-hub-section">
            <div className="admin-hub-card-head">
              <div>
                <div className="admin-hub-eyebrow">Request tools</div>
                <h3 className="admin-hub-title">Create approval requests</h3>
              </div>
            </div>
            <div className="admin-hub-field">
              <label className="admin-hub-field-label" htmlFor="productId">Product ID</label>
              <Input id="productId" value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="e.g. 12" />
            </div>
            <div className="admin-hub-field">
              <label className="admin-hub-field-label" htmlFor="available">Available quantity</label>
              <Input id="available" value={available} onChange={(e) => setAvailable(e.target.value)} placeholder="e.g. 50" />
            </div>
            <div className="admin-hub-field">
              <label className="admin-hub-field-label" htmlFor="approvalNote">Reason</label>
              <Textarea id="approvalNote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why is this needed?" />
            </div>
            <div className="admin-hub-list">
              <Button variant="secondary" onClick={() => void createApproval("inventory.rebuild", { ...(productId.trim() ? { product_id: Number(productId) } : {}) }, note || "Inventory rebuild")} disabled={loading}>
                Request inventory rebuild
              </Button>
              <Button variant="secondary" onClick={() => void createApproval("inventory.adjust_available", { product_id: Number(productId), available: Number(available), note }, note || "Adjust available")} disabled={loading}>
                Request stock adjustment
              </Button>
              <Button variant="secondary" onClick={() => void createApproval("retention.enable_delete", {}, "Enable delete mode")} disabled={loading}>
                Request delete mode
              </Button>
              <Button variant="secondary" onClick={() => void createApproval("retention.run_delete", {}, "Run retention delete")} disabled={loading}>
                Request delete run
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <div className="admin-hub-grid">
        <Card padding="lg" className="admin-hub-section">
          <div className="admin-hub-card-head">
            <div>
              <div className="admin-hub-eyebrow">Exports</div>
              <h3 className="admin-hub-title">Data export controls</h3>
            </div>
          </div>
          <div className="admin-hub-list">
            {exports.map((entry) => (
              <div key={entry.key} className="admin-hub-list-item">
                <div>
                  <div className="admin-hub-title">{entry.label}</div>
                  <div className="admin-hub-copy">{entry.description}</div>
                </div>
                <div className="admin-hub-inline-actions">
                  <Button variant="secondary" size="sm" onClick={() => void downloadCsv(entry.key)} disabled={loading}>Download CSV</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card tone="muted" padding="lg" className="admin-hub-section">
          <div className="admin-hub-card-head">
            <div>
              <div className="admin-hub-eyebrow">Retention</div>
              <h3 className="admin-hub-title">Retention policy controls</h3>
            </div>
          </div>
          <div className="admin-hub-field">
            <label className="admin-hub-field-label" htmlFor="days">Retention days</label>
            <Input id="days" value={days} onChange={(e) => setDays(e.target.value)} placeholder="e.g. 90" />
          </div>
          <div className="admin-hub-field">
            <label className="admin-hub-field-label" htmlFor="mode">Retention mode</label>
            <Select id="mode" value={mode} onChange={(e) => setMode(e.target.value as "redact" | "delete")}>
              <option value="redact">Redact (recommended)</option>
              <option value="delete">Delete (requires approval)</option>
            </Select>
          </div>
          <Alert
            tone={mode === "delete" ? "warning" : "info"}
            title={mode === "delete" ? "Delete mode is approval-protected" : "Redact mode is safer for routine retention"}
            description={`Last run: ${retention?.retention_last_run_at ? new Date(retention.retention_last_run_at).toLocaleString() : "never"}.`}
          />
          <div className="admin-hub-inline-actions">
            <Button onClick={() => void saveRetention()} disabled={loading}>Save retention</Button>
            <Button variant="secondary" onClick={() => void runRetentionNow()} disabled={loading || !retention?.message_retention_days}>Run retention now</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
