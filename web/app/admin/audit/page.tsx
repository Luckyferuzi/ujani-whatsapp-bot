"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/components/AuthProvider";
import { get } from "@/lib/api";

type AuditEvent = {
  id: string | number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_user_id: number | null;
  actor_email: string | null;
  metadata_json: any;
  created_at: string;
};

export default function AuditLogPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");

  useEffect(() => {
    if (!user) return;
    if (user.role !== "admin") {
      router.replace("/inbox");
      return;
    }
  }, [user, router]);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "100");
      if (action.trim()) qs.set("action", action.trim());
      if (entityType.trim()) qs.set("entity_type", entityType.trim());

      const r = await get<{ ok: true; events: AuditEvent[] }>(`/api/audit-events?${qs.toString()}`);
      setEvents(r.events ?? []);
    } catch {
      toast.error("Failed to load audit events.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => events, [events]);

  return (
    <div className="page-wrap">
      <h1 className="page-title">Audit Log</h1>

      <div className="card">
        <div className="form-grid">
          <div>
            <label>Action</label>
            <input value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. order.status.update" />
          </div>
          <div>
            <label>Entity type</label>
            <input value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="e.g. order" />
          </div>
          <div style={{ alignSelf: "end" }}>
            <button className="btn-primary" onClick={load} disabled={loading}>
              {loading ? "Loading..." : "Apply filter"}
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        {loading ? (
          <div className="text-ui-dim text-sm">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="text-ui-dim text-sm">No audit events found.</div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Meta</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={String(e.id)}>
                    <td>{new Date(e.created_at).toLocaleString()}</td>
                    <td>{e.actor_email ?? e.actor_user_id ?? "system"}</td>
                    <td>{e.action}</td>
                    <td>
                      {e.entity_type}
                      {e.entity_id ? `#${e.entity_id}` : ""}
                    </td>
                    <td style={{ maxWidth: 420, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {JSON.stringify(e.metadata_json ?? {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
