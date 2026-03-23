"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Alert,
  Button,
  EmptyState,
  RefreshIndicator,
  Textarea,
} from "@/components/ui";

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
    <div className="timeline-notes">
      <div className="timeline-notes__header">
        <div className="panel-card-title">{title}</div>
        <div className="timeline-notes__copy">
          Internal only. Notes here never go to the customer.
        </div>
      </div>

      <div className="timeline-notes__composer">
        <Textarea
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          placeholder={notePlaceholder}
          rows={3}
        />
        <div className="timeline-notes__composer-footer">
          <div className="timeline-notes__hint">
            Best for payment checks, delivery handoff, and customer context.
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void handleSave()}
            disabled={!notePath}
            loading={saving}
          >
            {saving ? "Saving..." : "Add note"}
          </Button>
        </div>
      </div>

      <div className="timeline-notes__history">
        {loading ? (
          <div className="timeline-notes__refresh">
            <RefreshIndicator label="Loading history" />
          </div>
        ) : items.length === 0 ? (
          <div className="timeline-notes__empty">
            <EmptyState
              eyebrow="Notes"
              title="No history yet"
              description={emptyState}
            />
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={
                "timeline-notes__item" +
                (item.kind === "note" ? " timeline-notes__item--note" : "")
              }
            >
              <div className="timeline-notes__item-top">
                <div className="timeline-notes__item-title">{item.title}</div>
                <div className="timeline-notes__item-time">
                  {formatDateTime(item.created_at)}
                </div>
              </div>
              {item.description ? (
                <div className="timeline-notes__item-body">{item.description}</div>
              ) : null}
              <div className="timeline-notes__item-meta">
                {item.kind === "note" ? "Internal note" : "Timeline event"}
                {item.actor_label ? ` · ${item.actor_label}` : ""}
                {item.scope ? ` · ${item.scope}` : ""}
              </div>
            </div>
          ))
        )}
      </div>

      {!notePath ? (
        <Alert
          tone="neutral"
          title="Notes unavailable"
          description="This conversation does not currently support internal note entry."
        />
      ) : null}
    </div>
  );
}
