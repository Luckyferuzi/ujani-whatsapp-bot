"use client";

import { useEffect, useMemo, useState } from "react";
import { API } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { toast } from "sonner";

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
  const t = getAuthToken();
  if (!t) throw new Error("Session imeisha. Tafadhali ingia tena.");
  return t;
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

export default function GovernancePage() {
  const [retention, setRetention] = useState<RetentionState | null>(null);
  const [days, setDays] = useState<string>("");
  const [mode, setMode] = useState<"redact" | "delete">("redact");
  const [loading, setLoading] = useState(false);

  const [approvals, setApprovals] = useState<ApprovalRow[]>([]);
  const [productId, setProductId] = useState("");
  const [available, setAvailable] = useState("");
  const [note, setNote] = useState("");

  const exports = useMemo(
    () => [
      { key: "contacts", label: "Contacts (customers)" },
      { key: "conversations", label: "Conversations" },
      { key: "orders", label: "Orders" },
      { key: "inventory_history", label: "Inventory History (stock movements)" },
      { key: "audit", label: "Audit Logs" },
    ],
    []
  );

  async function refreshApprovals() {
    try {
      const res = await authedFetch("/auth/admin/approvals?status=pending&limit=100", { method: "GET" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "approvals_failed");
      setApprovals(data.approvals ?? []);
    } catch (e: any) {
      console.error(e);
      // don’t toast spam if supervisor lacks access
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch("/auth/admin/retention", { method: "GET" });
        const data = await res.json();
        if (res.ok) {
          setRetention({
            message_retention_days: data.message_retention_days ?? null,
            retention_mode: data.retention_mode ?? "redact",
            retention_last_run_at: data.retention_last_run_at ?? null,
          });
          setDays(data.message_retention_days ? String(data.message_retention_days) : "");
          setMode(data.retention_mode === "delete" ? "delete" : "redact");
        }
      } catch {
        // ignore for supervisor
      } finally {
        await refreshApprovals();
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
      const a = document.createElement("a");
      a.href = url;
      a.download = `${kind}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (e: any) {
      toast.error("Export failed", { description: e?.message ?? "unknown error" });
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
      toast.success("Approval request created");
      await refreshApprovals();
    } catch (e: any) {
      toast.error("Approval request failed", { description: e?.message ?? "unknown error" });
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
      toast.success("Approved & executed");
      await refreshApprovals();
    } catch (e: any) {
      toast.error("Approve failed", { description: e?.message ?? "unknown error" });
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
      toast.success("Rejected");
      await refreshApprovals();
    } catch (e: any) {
      toast.error("Reject failed", { description: e?.message ?? "unknown error" });
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
        toast.info("Delete mode needs approval", { description: `Request #${data.approval_id} created` });
        await refreshApprovals();
        return;
      }

      if (!res.ok) throw new Error(data?.error ?? "save_failed");

      toast.success("Retention saved");
      setRetention({
        message_retention_days: data.settings?.message_retention_days ?? payload.message_retention_days,
        retention_mode: data.settings?.retention_mode ?? mode,
        retention_last_run_at: data.settings?.retention_last_run_at ?? retention?.retention_last_run_at ?? null,
      });
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message ?? "unknown error" });
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
        toast.info("Delete run needs approval", { description: `Request #${data.approval_id} created` });
        await refreshApprovals();
        return;
      }

      if (!res.ok) throw new Error(data?.error ?? "run_failed");
      toast.success("Retention executed", { description: `Affected: ${data.affected} (mode: ${data.mode})` });
    } catch (e: any) {
      toast.error("Retention run failed", { description: e?.message ?? "unknown error" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-root">
      <div className="page-card">
        <div className="page-title">Governance</div>
        <div className="page-subtitle">Two-person approvals + exports + retention</div>

        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Approvals Queue</h3>

          <div style={{ display: "grid", gap: 10, maxWidth: 520, marginBottom: 14 }}>
            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Inventory — product id (optional for rebuild)</div>
              <input className="input" value={productId} onChange={(e) => setProductId(e.target.value)} placeholder="e.g. 12" />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Adjust available (requires product id)</div>
              <input className="input" value={available} onChange={(e) => setAvailable(e.target.value)} placeholder="e.g. 50" />
            </div>

            <div style={{ display: "grid", gap: 6 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Note</div>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="why is this needed?" />
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                className="btn"
                disabled={loading}
                onClick={() =>
                  void createApproval(
                    "inventory.rebuild",
                    { ...(productId.trim() ? { product_id: Number(productId) } : {}) },
                    note || "Inventory rebuild"
                  )
                }
              >
                Request inventory rebuild
              </button>

              <button
                className="btn"
                disabled={loading}
                onClick={() =>
                  void createApproval(
                    "inventory.adjust_available",
                    { product_id: Number(productId), available: Number(available), note },
                    note || "Adjust available"
                  )
                }
              >
                Request adjust available
              </button>

              <button className="btn" disabled={loading} onClick={() => void createApproval("retention.enable_delete", {}, "Enable delete mode")}>
                Request enable delete mode
              </button>

              <button className="btn" disabled={loading} onClick={() => void createApproval("retention.run_delete", {}, "Run retention delete")}>
                Request retention delete run
              </button>

              <button className="btn" disabled={loading} onClick={() => void refreshApprovals()}>
                Refresh approvals
              </button>
            </div>
          </div>

          <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: 10, fontSize: 12, opacity: 0.8, background: "rgba(255,255,255,0.03)" }}>
              Pending approvals: {approvals.length}
            </div>

            {approvals.length === 0 ? (
              <div style={{ padding: 12, opacity: 0.8 }}>No pending approvals.</div>
            ) : (
              approvals.map((a) => (
                <div key={a.id} style={{ padding: 12, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>
                        #{a.id} — {a.action_key}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.8 }}>
                        Requested by: {a.requested_by_email ?? a.requested_by_email ?? "unknown"} • {new Date(a.requested_at).toLocaleString()}
                      </div>
                      {a.note ? <div style={{ marginTop: 6, fontSize: 12, opacity: 0.9 }}>{a.note}</div> : null}
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <button className="btn btn-xs" disabled={loading} onClick={() => void approve(a.id)}>
                        Approve
                      </button>
                      <button className="btn btn-xs" disabled={loading} onClick={() => void reject(a.id)}>
                        Reject
                      </button>
                    </div>
                  </div>

                  {a.execution_error ? (
                    <div style={{ marginTop: 8, fontSize: 12, color: "salmon" }}>
                      Execution error: {a.execution_error}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <hr style={{ margin: "20px 0" }} />

        <div style={{ marginTop: 16 }}>
          <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Data Exports (Admin)</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {exports.map((x) => (
              <button key={x.key} className="btn" onClick={() => void downloadCsv(x.key)} disabled={loading}>
                Download {x.label} CSV
              </button>
            ))}
          </div>
        </div>

        <hr style={{ margin: "20px 0" }} />

        <div>
          <h3 style={{ fontWeight: 700, marginBottom: 8 }}>Data Retention (Admin)</h3>

          <div style={{ display: "grid", gap: 10, maxWidth: 420 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Message retention days (empty = keep forever)</span>
              <input className="input" value={days} onChange={(e) => setDays(e.target.value)} placeholder="e.g. 90" />
            </label>

            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>Retention mode</span>
              <select className="input" value={mode} onChange={(e) => setMode(e.target.value as any)}>
                <option value="redact">Redact (recommended)</option>
                <option value="delete">Delete (requires approval)</option>
              </select>
            </label>

            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => void saveRetention()} disabled={loading}>
                Save retention
              </button>
              <button className="btn" onClick={() => void runRetentionNow()} disabled={loading || !retention?.message_retention_days}>
                Run retention now
              </button>
            </div>

            <div style={{ fontSize: 12, opacity: 0.8 }}>
              Last run: {retention?.retention_last_run_at ? new Date(retention.retention_last_run_at).toLocaleString() : "never"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
