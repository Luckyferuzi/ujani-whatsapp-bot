"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthProvider";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  MetricValue,
  Skeleton,
} from "@/components/ui";
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

function formatActor(event: AuditEvent) {
  return event.actor_email ?? (event.actor_user_id ? `User ${event.actor_user_id}` : "system");
}

export default function AuditLogPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [selectedId, setSelectedId] = useState<string | number | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.role !== "admin") {
      router.replace("/inbox");
      return;
    }
  }, [router, user]);

  async function load() {
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "100");
      if (action.trim()) qs.set("action", action.trim());
      if (entityType.trim()) qs.set("entity_type", entityType.trim());
      const res = await get<{ ok: true; events: AuditEvent[] }>(`/api/audit-events?${qs.toString()}`);
      setEvents(res.events ?? []);
      if (!selectedId && res.events?.length) setSelectedId(res.events[0].id);
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

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedId) ?? null,
    [events, selectedId]
  );

  const uniqueActors = new Set(events.map((event) => formatActor(event))).size;

  if (!user) {
    return (
      <EmptyState
        eyebrow="Admin hub"
        title="Sign in to review audit history."
        description="Audit logs are only available to authenticated administrators."
      />
    );
  }

  return (
    <div className="admin-hub-page">
      <PageHeader
        eyebrow="Admin hub"
        section="Audit"
        title="Audit Ledger"
        description="Review high-trust event history with a ledger-like table, focused filters, and structured event detail."
        actions={
          <div className="admin-hub-actions">
            <Badge tone="neutral">100 row window</Badge>
            <Button variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>Refresh</Button>
          </div>
        }
      />

      <div className="admin-hub-summary">
        <div className="admin-hub-stat-card">
          <div className="admin-hub-stat-label">Visible events</div>
          <div className="admin-hub-stat-value"><MetricValue value={events.length} loading={loading} width="4ch" /></div>
          <div className="admin-hub-muted">Current result set after filters.</div>
        </div>
        <div className="admin-hub-stat-card">
          <div className="admin-hub-stat-label">Unique actors</div>
          <div className="admin-hub-stat-value"><MetricValue value={uniqueActors} loading={loading} width="4ch" /></div>
          <div className="admin-hub-muted">Distinct users or system actors in view.</div>
        </div>
        <div className="admin-hub-stat-card">
          <div className="admin-hub-stat-label">Detail panel</div>
          <div className="admin-hub-stat-value">{selectedEvent ? "Ready" : "Idle"}</div>
          <div className="admin-hub-muted">Select any event row to inspect payload metadata.</div>
        </div>
      </div>

      <div className="admin-hub-main-grid">
        <Card padding="lg" className="admin-hub-section">
          <div className="admin-hub-toolbar">
            <div>
              <div className="admin-hub-eyebrow">Filters</div>
              <h3 className="admin-hub-title">Audit stream</h3>
            </div>
            <div className="admin-hub-filter-row">
              <div className="admin-hub-field">
                <label className="admin-hub-field-label" htmlFor="auditAction">Action</label>
                <Input id="auditAction" value={action} onChange={(e) => setAction(e.target.value)} placeholder="e.g. order.status.update" />
              </div>
              <div className="admin-hub-field">
                <label className="admin-hub-field-label" htmlFor="auditEntity">Entity type</label>
                <Input id="auditEntity" value={entityType} onChange={(e) => setEntityType(e.target.value)} placeholder="e.g. order" />
              </div>
              <div className="admin-hub-field">
                <label className="admin-hub-field-label">Apply</label>
                <Button onClick={() => void load()} loading={loading}>Run filters</Button>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="admin-hub-table-wrap">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="admin-hub-skeleton-row">
                  <Skeleton style={{ height: 14 }} />
                  <Skeleton style={{ height: 14 }} />
                  <Skeleton style={{ height: 14 }} />
                  <Skeleton style={{ height: 14 }} />
                </div>
              ))}
            </div>
          ) : events.length === 0 ? (
            <div className="admin-hub-empty">
              <div className="admin-hub-empty-title">{action || entityType ? "No matching audit events" : "No audit events available"}</div>
              <div className="admin-hub-empty-copy">
                {action || entityType
                  ? "Broaden the filters to bring more events back into view."
                  : "Events will appear here once the system records operational changes."}
              </div>
            </div>
          ) : (
            <div className="admin-hub-table-wrap">
              <table className="admin-hub-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Metadata</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={String(event.id)} className={event.id === selectedId ? "is-active" : ""} onClick={() => setSelectedId(event.id)}>
                      <td>{new Date(event.created_at).toLocaleString()}</td>
                      <td>
                        <div className="admin-hub-cell-title">
                          <div className="admin-hub-cell-main">{formatActor(event)}</div>
                          <div className="admin-hub-cell-sub">{event.actor_user_id ? `User ID ${event.actor_user_id}` : "System event"}</div>
                        </div>
                      </td>
                      <td><Badge tone="accent">{event.action}</Badge></td>
                      <td>
                        <div className="admin-hub-cell-title">
                          <div className="admin-hub-cell-main">{event.entity_type}</div>
                          <div className="admin-hub-cell-sub">{event.entity_id ? `#${event.entity_id}` : "No entity id"}</div>
                        </div>
                      </td>
                      <td>
                        <div className="admin-hub-cell-sub">
                          {JSON.stringify(event.metadata_json ?? {}).slice(0, 120)}
                          {JSON.stringify(event.metadata_json ?? {}).length > 120 ? "..." : ""}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="admin-hub-detail-stack">
          <Card padding="lg" className="admin-hub-section">
            <div className="admin-hub-card-head">
              <div>
                <div className="admin-hub-eyebrow">Event detail</div>
                <h3 className="admin-hub-title">Selected audit record</h3>
              </div>
            </div>

            {!selectedEvent ? (
              <div className="admin-hub-empty">
                <div className="admin-hub-empty-title">No event selected</div>
                <div className="admin-hub-empty-copy">Select a row in the ledger to inspect its full event metadata and actor context.</div>
              </div>
            ) : (
              <>
                <div className="admin-hub-pill-row">
                  <Badge tone="accent">{selectedEvent.action}</Badge>
                  <Badge tone="neutral">{selectedEvent.entity_type}</Badge>
                </div>
                <div className="admin-hub-kv">
                  <div className="admin-hub-field-label">Time</div>
                  <div className="admin-hub-detail-meta">{new Date(selectedEvent.created_at).toLocaleString()}</div>
                  <div className="admin-hub-field-label">Actor</div>
                  <div className="admin-hub-detail-meta">{formatActor(selectedEvent)}</div>
                  <div className="admin-hub-field-label">Entity</div>
                  <div className="admin-hub-detail-meta">{selectedEvent.entity_type}{selectedEvent.entity_id ? ` #${selectedEvent.entity_id}` : ""}</div>
                </div>
                <div className="admin-hub-section">
                  <div className="admin-hub-field-label">Metadata payload</div>
                  <div className="admin-hub-code">{JSON.stringify(selectedEvent.metadata_json ?? {}, null, 2)}</div>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
