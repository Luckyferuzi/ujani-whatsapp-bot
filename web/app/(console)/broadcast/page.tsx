"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Alert, Badge, Button, Card, EmptyState, Select } from "@/components/ui";

type AudienceKey =
  | "marketing_eligible"
  | "previous_buyers"
  | "recent_customers"
  | "all_previous_chatters";

type TemplateField = {
  key: string;
  label: string;
  required: boolean;
};

type TemplateOption = {
  key: string;
  template_name: string;
  language_code: string;
  category: string;
  enabled: boolean;
  parameter_meta: TemplateField[];
};

type AudienceOption = {
  key: AudienceKey;
  label: string;
  description: string;
  advanced: boolean;
};

type BroadcastOptionsResponse = {
  audiences: AudienceOption[];
  templates: TemplateOption[];
};

type BroadcastPreview = {
  audience: AudienceKey;
  label: string;
  recipient_count: number;
  excluded_count: number;
  sample_recipients: Array<{
    customer_id: number;
    customer_name: string | null;
    customer_phone: string | null;
    conversation_id: number;
    last_interaction_at: string | null;
  }>;
};

type BroadcastResult = {
  ok: boolean;
  total: number;
  audience: AudienceKey;
  mode: "test" | "send";
  excluded_count: number;
  sent: number;
  failed: number;
  errors?: Array<{
    conversation_id: number | null;
    customer_name: string | null;
    error: string;
  }>;
};

function formatCategory(category: string) {
  if (category === "payment_reminder") return "Payment";
  if (category === "order_followup") return "Order";
  return "Restock";
}

function formatDate(value?: string | null) {
  if (!value) return "No recent interaction";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("sw-TZ", {
    month: "short",
    day: "2-digit",
  });
}

export default function BroadcastPage() {
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [options, setOptions] = useState<BroadcastOptionsResponse | null>(null);
  const [audience, setAudience] = useState<AudienceKey>("marketing_eligible");
  const [templateKey, setTemplateKey] = useState("");
  const [params, setParams] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [result, setResult] = useState<BroadcastResult | null>(null);

  const selectedTemplate = useMemo(
    () => options?.templates.find((item) => item.key === templateKey) ?? null,
    [options, templateKey]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    void api<BroadcastOptionsResponse>("/api/broadcast/options")
      .then((data) => {
        if (cancelled) return;
        setOptions(data);
        setAudience((data.audiences[0]?.key ?? "marketing_eligible") as AudienceKey);
        setTemplateKey(data.templates[0]?.key ?? "");
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load broadcast options", err);
        toast.error("Unable to load broadcast options.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!audience) return;
    let cancelled = false;
    void api<BroadcastPreview>(`/api/broadcast/audience-preview?audience=${encodeURIComponent(audience)}`)
      .then((data) => {
        if (!cancelled) setPreview(data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load audience preview", err);
        setPreview(null);
      });

    return () => {
      cancelled = true;
    };
  }, [audience]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setParams((current) => {
      const next: Record<string, string> = {};
      for (const field of selectedTemplate.parameter_meta) {
        next[field.key] = current[field.key] ?? "";
      }
      return next;
    });
  }, [selectedTemplate?.key]);

  const canSend = Boolean(selectedTemplate && preview && preview.recipient_count > 0);

  async function handleBroadcast(mode: "test" | "send") {
    if (!selectedTemplate) {
      toast.error("Choose a template before sending.");
      return;
    }

    setSending(true);
    setResult(null);
    try {
      const res = await api<BroadcastResult>("/api/customers/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audience,
          templateKey: selectedTemplate.key,
          params,
          mode,
        }),
      });
      setResult(res);
      toast.success(mode === "test" ? "Test send complete" : "Broadcast complete");
    } catch (err: any) {
      console.error("Broadcast failed", err);
      toast.error(err?.message ?? "Broadcast failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="broadcast-page">
      <section className="broadcast-hero ops-masthead">
        <div className="broadcast-hero__copy ops-masthead__main">
          <div className="broadcast-hero__kicker ops-masthead__eyebrow">Segmented outreach</div>
          <div className="broadcast-hero__title ops-masthead__title">Template broadcasts</div>
          <div className="broadcast-hero__text ops-masthead__description">
            Select an audience first, choose an approved template, preview who will receive it,
            then send with clear result totals.
          </div>
        </div>
        <div className="broadcast-hero__actions ops-masthead__actions">
          <Link href="/followups" className="ui-button ui-button--secondary">
            Open follow-ups
          </Link>
          <Link href="/inbox" className="ui-button ui-button--ghost">
            Open inbox
          </Link>
        </div>
      </section>

      <div className="broadcast-grid">
        <Card className="broadcast-panel" padding="lg">
          <div className="broadcast-panel__head ops-panel-head">
            <div>
              <div className="broadcast-panel__title">Broadcast setup</div>
              <div className="broadcast-panel__copy">
                Bulk sends now use approved templates only. Raw free-text is no longer the primary path.
              </div>
            </div>
            {selectedTemplate ? <Badge tone="accent">{formatCategory(selectedTemplate.category)}</Badge> : null}
          </div>

          {loading || !options ? (
            <div className="broadcast-note">Loading broadcast options…</div>
          ) : (
            <div className="broadcast-form">
              <div className="broadcast-field">
                <label className="broadcast-label" htmlFor="broadcast-audience">
                  Audience
                </label>
                <Select
                  id="broadcast-audience"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as AudienceKey)}
                  disabled={sending}
                >
                  {options.audiences.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.label}{item.advanced ? " (Advanced)" : ""}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="broadcast-field">
                <label className="broadcast-label" htmlFor="broadcast-template">
                  Template
                </label>
                <Select
                  id="broadcast-template"
                  value={templateKey}
                  onChange={(e) => setTemplateKey(e.target.value)}
                  disabled={sending}
                >
                  {options.templates.map((item) => (
                    <option key={item.key} value={item.key}>
                      {item.template_name} · {item.language_code}
                    </option>
                  ))}
                </Select>
              </div>

              {selectedTemplate?.parameter_meta.length ? (
                <div className="broadcast-form">
                  {selectedTemplate.parameter_meta.map((field) => (
                    <div key={field.key} className="broadcast-field">
                      <label className="broadcast-label">{field.label}</label>
                      <input
                        className="ui-input"
                        value={params[field.key] ?? ""}
                        onChange={(e) =>
                          setParams((current) => ({
                            ...current,
                            [field.key]: e.target.value,
                          }))
                        }
                        disabled={sending}
                      />
                    </div>
                  ))}
                </div>
              ) : null}

              <Alert
                tone={audience === "all_previous_chatters" ? "warning" : "accent"}
                title={preview ? `${preview.recipient_count} recipients selected` : "Previewing audience"}
                description={
                  preview
                    ? `${preview.excluded_count} recipients excluded from the broader chatter pool.`
                    : "Loading audience preview…"
                }
              />

              <div className="broadcast-form__footer">
                <div className="broadcast-form__hint">
                  Audience must be explicit before any template is sent.
                </div>
                <div className="broadcast-hero__actions">
                  <Button variant="secondary" disabled={!canSend} loading={sending} onClick={() => void handleBroadcast("test")}>
                    Send test
                  </Button>
                  <Button disabled={!canSend} loading={sending} onClick={() => void handleBroadcast("send")}>
                    Send now
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>

        <div className="broadcast-side">
          <Card className="broadcast-panel" padding="lg">
            <div className="broadcast-panel__head ops-panel-head">
              <div>
                <div className="broadcast-panel__title">Audience preview</div>
                <div className="broadcast-panel__copy">
                  Preview count and a few sample recipients before sending.
                </div>
              </div>
            </div>

            {!preview ? (
              <EmptyState eyebrow="Audience" title="No audience preview yet." description="Choose an audience to load recipient counts." />
            ) : (
              <div className="broadcast-preview">
                <div className="broadcast-preview__bubble broadcast-preview__bubble--system">
                  {preview.label}: {preview.recipient_count} recipients
                </div>
                {preview.sample_recipients.map((item) => (
                  <div key={item.conversation_id} className="broadcast-preview__bubble">
                    {(item.customer_name || item.customer_phone || "Customer") + " · " + formatDate(item.last_interaction_at)}
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="broadcast-panel" padding="lg">
            <div className="broadcast-panel__head ops-panel-head">
              <div>
                <div className="broadcast-panel__title">Result summary</div>
                <div className="broadcast-panel__copy">
                  Sent, failed, and excluded counts from the latest run.
                </div>
              </div>
            </div>

            {!result ? (
              <EmptyState eyebrow="Results" title="No send yet." description="Run a test or full broadcast to see results here." />
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
                  <div className="broadcast-result-card__label">Excluded</div>
                  <div className="broadcast-result-card__value ui-tabular-nums">{result.excluded_count}</div>
                </div>
                {result.errors?.length ? (
                  <Alert tone="warning" title="Some recipients failed" description={result.errors.map((item) => `${item.customer_name || "Customer"}: ${item.error}`).join(" | ")} />
                ) : null}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
