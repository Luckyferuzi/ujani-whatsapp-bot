"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";

type TimelineItem = {
  id: string;
  kind: "event" | "note";
  event_type: string;
  title: string;
  description: string | null;
  created_at: string;
  actor_label: string | null;
  actor_type: string | null;
  scope?: "conversation" | "order" | "customer" | null;
};

type Props = {
  title: string;
  timelinePath: string | null;
  notePath: string | null;
  emptyState: string;
  notePlaceholder: string;
  refreshKey?: string | number | null;
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("sw-TZ", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OperatorTimelineNotes({
  title,
  timelinePath,
  notePath,
  emptyState,
  notePlaceholder,
  refreshKey,
}: Props) {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noteBody, setNoteBody] = useState("");

  const loadTimeline = async () => {
    if (!timelinePath) {
      setItems([]);
      return;
    }

    setLoading(true);
    try {
      const data = await api<{ items: TimelineItem[] }>(timelinePath);
      setItems(data.items ?? []);
    } catch (err) {
      console.error("Failed to load operator timeline", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTimeline();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timelinePath, refreshKey]);

  const handleSave = async () => {
    if (!notePath) return;

    const body = noteBody.trim();
    if (!body) {
      toast.error("Write a short internal note first.");
      return;
    }

    setSaving(true);
    try {
      await api(notePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      setNoteBody("");
      await loadTimeline();
      toast.success("Internal note saved");
    } catch (err) {
      console.error("Failed to save internal note", err);
      toast.error("Failed to save internal note");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div style={{ color: "var(--muted, #6b7280)", fontSize: 12, marginTop: 4 }}>
          Internal only. Notes here never go to the customer.
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <textarea
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          placeholder={notePlaceholder}
          rows={3}
          style={{
            width: "100%",
            resize: "vertical",
            borderRadius: 12,
            border: "1px solid rgba(148, 163, 184, 0.35)",
            padding: "10px 12px",
            background: "transparent",
            color: "inherit",
            font: "inherit",
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ color: "var(--muted, #6b7280)", fontSize: 12 }}>
            Best for payment checks, delivery handoff, and customer context.
          </div>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !notePath}
            style={{
              borderRadius: 999,
              border: "1px solid rgba(15, 23, 42, 0.12)",
              padding: "8px 14px",
              background: "var(--surface, #fff)",
              color: "inherit",
              fontWeight: 700,
              cursor: saving ? "wait" : "pointer",
            }}
          >
            {saving ? "Saving..." : "Add note"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {loading ? (
          <div style={{ color: "var(--muted, #6b7280)", fontSize: 13 }}>Loading history...</div>
        ) : items.length === 0 ? (
          <div style={{ color: "var(--muted, #6b7280)", fontSize: 13 }}>{emptyState}</div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              style={{
                border: "1px solid rgba(148, 163, 184, 0.18)",
                borderRadius: 14,
                padding: "10px 12px",
                background: item.kind === "note" ? "rgba(15, 23, 42, 0.03)" : "transparent",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{item.title}</div>
                <div style={{ color: "var(--muted, #6b7280)", fontSize: 11 }}>{formatDateTime(item.created_at)}</div>
              </div>
              {item.description ? (
                <div style={{ marginTop: 6, fontSize: 12.5, lineHeight: 1.45 }}>{item.description}</div>
              ) : null}
              <div style={{ marginTop: 6, color: "var(--muted, #6b7280)", fontSize: 11 }}>
                {item.kind === "note" ? "Internal note" : "Timeline event"}
                {item.actor_label ? ` • ${item.actor_label}` : ""}
                {item.scope ? ` • ${item.scope}` : ""}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
