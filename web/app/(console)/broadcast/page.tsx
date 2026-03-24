"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { post } from "@/lib/api";
import { toast } from "sonner";
import { Alert, Badge, Button, Card, EmptyState, Select, Textarea } from "@/components/ui";

type BroadcastResponse = {
  ok: boolean;
  total?: number;
  sent: number;
  failed: number;
  within_hours?: number | null;
};

type Audience = "24h" | "all";

export default function BroadcastPage() {
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<Audience>("24h");
  const [confirmOptIn, setConfirmOptIn] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BroadcastResponse | null>(null);

  const maxLength = 1000;
  const remaining = maxLength - message.length;

  const canSubmit = useMemo(() => {
    return message.trim().length > 0 && confirmOptIn;
  }, [message, confirmOptIn]);

  const audienceMeta = useMemo(() => {
    if (audience === "24h") {
      return {
        title: "Recent customers",
        copy: "Safer delivery window for customers who have messaged within the last 24 hours.",
        tone: "accent" as const,
      };
    }

    return {
      title: "All-time audience",
      copy: "Higher failure risk for customers outside the WhatsApp service window.",
      tone: "warning" as const,
    };
  }, [audience]);

  const previewText = useMemo(() => {
    const trimmed = message.trim();
    return trimmed || "Write a service update to preview the outgoing message here.";
  }, [message]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = message.trim();
    if (!trimmed) {
      toast.error("Write a message before sending.");
      return;
    }

    if (!confirmOptIn) {
      toast.error("Confirm that recipients are eligible for this message.");
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const payload: { message: string; within_hours?: number } = { message: trimmed };
      if (audience === "24h") payload.within_hours = 24;

      const res = await post<BroadcastResponse>("/api/customers/broadcast", payload);
      setResult(res);
      toast.success("Broadcast sent", {
        description: `Sent ${res.sent}. Failed ${res.failed}.`,
      });
    } catch (err: any) {
      console.error("Broadcast failed", err);
      toast.error("Broadcast failed", {
        description: err?.message ?? "Please try again shortly.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="broadcast-page">
      <section className="broadcast-hero ops-masthead">
        <div className="broadcast-hero__copy ops-masthead__main">
          <div className="broadcast-hero__kicker ops-masthead__eyebrow">Outbound control</div>
          <div className="broadcast-hero__title ops-masthead__title">Broadcasts</div>
          <div className="broadcast-hero__text ops-masthead__description">
            Send careful service updates to recent customers with clear audience scope,
            message preview, and delivery results.
          </div>
        </div>
        <div className="broadcast-hero__actions ops-masthead__actions">
          <Link href="/inbox" className="ui-button ui-button--secondary">
            Open inbox
          </Link>
          <Link href="/" className="ui-button ui-button--ghost">
            Command Center
          </Link>
        </div>
      </section>

      <div className="broadcast-grid">
        <Card className="broadcast-panel" padding="lg">
          <div className="broadcast-panel__head ops-panel-head">
            <div>
              <div className="broadcast-panel__title">Campaign setup</div>
              <div className="broadcast-panel__copy">
                Keep the message short, practical, and clearly service-oriented.
              </div>
            </div>
            <Badge tone={audienceMeta.tone}>{audienceMeta.title}</Badge>
          </div>

          <form className="broadcast-form" onSubmit={(e) => void handleSubmit(e)}>
            <div className="broadcast-field">
              <label className="broadcast-label" htmlFor="broadcast-audience">
                Audience
              </label>
              <Select
                id="broadcast-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value as Audience)}
                disabled={sending}
              >
                <option value="24h">Recent customers from the last 24 hours</option>
                <option value="all">All-time customer audience</option>
              </Select>
            </div>

            <Alert tone={audienceMeta.tone} title={audienceMeta.title} description={audienceMeta.copy} />

            <div className="broadcast-field">
              <label className="broadcast-label" htmlFor="broadcast-message">
                Message
              </label>
              <Textarea
                id="broadcast-message"
                className="broadcast-textarea"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={maxLength}
                placeholder="Example: Hello, we need to confirm your order today. Reply YES to continue or NO to cancel."
                disabled={sending}
              />
              <div className="broadcast-meta-row">
                <div className="broadcast-note">
                  Best results usually come from 1 to 3 short lines.
                </div>
                <div className="broadcast-count ui-tabular-nums">{remaining} characters</div>
              </div>
            </div>

            <label className="broadcast-check">
              <input
                type="checkbox"
                checked={confirmOptIn}
                onChange={(e) => setConfirmOptIn(e.target.checked)}
                disabled={sending}
              />
              <span>
                I confirm this is a service message and the recipients are valid for outreach.
              </span>
            </label>

            <div className="broadcast-form__footer">
              <div className="broadcast-form__hint">
                Review the preview and audience before sending.
              </div>
              <Button type="submit" loading={sending} disabled={!canSubmit}>
                {sending ? "Sending..." : "Send broadcast"}
              </Button>
            </div>
          </form>
        </Card>

        <div className="broadcast-side">
          <Card className="broadcast-panel" padding="lg">
            <div className="broadcast-panel__head ops-panel-head">
              <div>
                <div className="broadcast-panel__title">Message preview</div>
                <div className="broadcast-panel__copy">
                  How the outgoing update will read inside the customer thread.
                </div>
              </div>
              <Badge tone="neutral">WhatsApp</Badge>
            </div>

            <div className="broadcast-preview">
              <div className="broadcast-preview__bubble broadcast-preview__bubble--system">
                Service update preview
              </div>
              <div className="broadcast-preview__bubble broadcast-preview__bubble--out">
                {previewText}
              </div>
            </div>
          </Card>

          <Card className="broadcast-panel" padding="lg">
            <div className="broadcast-panel__head ops-panel-head">
              <div>
                <div className="broadcast-panel__title">Delivery result</div>
                <div className="broadcast-panel__copy">
                  Sent and failed counts from the latest broadcast attempt.
                </div>
              </div>
            </div>

            {!result ? (
              <EmptyState
                eyebrow="Results"
                title="No broadcast sent yet."
                description="Run a broadcast to see delivery totals here."
              />
            ) : (
              <div className="broadcast-results">
                <div className="broadcast-result-card">
                  <div className="broadcast-result-card__label">Sent</div>
                  <div className="broadcast-result-card__value ui-tabular-nums">{result.sent}</div>
                </div>
                <div className="broadcast-result-card">
                  <div className="broadcast-result-card__label">Failed</div>
                  <div className="broadcast-result-card__value ui-tabular-nums">{result.failed}</div>
                </div>
                <div className="broadcast-result-card">
                  <div className="broadcast-result-card__label">Total</div>
                  <div className="broadcast-result-card__value ui-tabular-nums">
                    {typeof result.total === "number" ? result.total : "-"}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
