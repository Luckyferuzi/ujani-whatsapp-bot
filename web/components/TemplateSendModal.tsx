"use client";

import { useEffect, useMemo, useState } from "react";
import { api, type ApiError } from "@/lib/api";

type TemplateField = {
  key: string;
  label: string;
  required: boolean;
};

type TemplateOption = {
  key: string;
  meta_template_name: string | null;
  language_code: string;
  category: string;
  label: string;
  enabled: boolean;
  params: TemplateField[];
  default_params: Record<string, string>;
  preview: string;
  suggested: boolean;
};

type TemplateOptionsResponse = {
  items: TemplateOption[];
  suggested_category: string | null;
  context: {
    latest_order: {
      id: number;
      orderCode: string;
      status: string;
      totalTzs: number;
      paidAmount: number;
      paymentStatus: string;
    } | null;
    restock_items: string[];
  };
};

type Props = {
  conversationId: string | number;
  open: boolean;
  onClose: () => void;
  onSent?: () => void | Promise<void>;
};

function formatCategory(category: string) {
  if (category === "payment_reminder") return "Payment";
  if (category === "order_followup") return "Order";
  return "Restock";
}

export default function TemplateSendModal({ conversationId, open, onClose, onSent }: Props) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<TemplateOption[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void api<TemplateOptionsResponse>(`/api/conversations/${conversationId}/template-options`)
      .then((data) => {
        if (cancelled) return;
        const options = data?.items ?? [];
        setItems(options);
        const preferred = options.find((item) => item.suggested) ?? options[0] ?? null;
        setSelectedKey(preferred?.key ?? null);
        setParams(preferred?.default_params ?? {});
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed to load template options", err);
        setError("Unable to load template options right now.");
        setItems([]);
        setSelectedKey(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, conversationId]);

  const selected = useMemo(
    () => items.find((item) => item.key === selectedKey) ?? null,
    [items, selectedKey]
  );

  useEffect(() => {
    if (!selected) return;
    setParams((current) => ({
      ...selected.default_params,
      ...current,
    }));
  }, [selected?.key]);

  if (!open) return null;

  async function handleSubmit() {
    if (!selected) return;
    setSending(true);
    setError(null);

    try {
      await api("/api/send-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          templateKey: selected.key,
          params,
        }),
      });

      await onSent?.();
      onClose();
    } catch (err) {
      console.error("Failed to send template", err);
      const apiErr = err as ApiError;
      setError(
        apiErr.message ||
          "Unable to send this template right now. Check template configuration and parameters."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="template-modal-overlay" onClick={onClose}>
      <div className="template-modal" onClick={(event) => event.stopPropagation()}>
        <div className="template-modal-header">
          <div>
            <div className="template-modal-title">Use template</div>
            <div className="template-modal-copy">
              The conversation is outside the free reply window, so the next message must use an
              approved WhatsApp template.
            </div>
          </div>
          <button type="button" className="thread-header-action" onClick={onClose}>
            Close
          </button>
        </div>

        {loading ? (
          <div className="template-modal-state">Loading templates...</div>
        ) : !selected ? (
          <div className="template-modal-state">No enabled templates are available.</div>
        ) : (
          <div className="template-modal-body">
            <div className="template-options">
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={
                    "template-option" +
                    (item.key === selected.key ? " template-option--active" : "") +
                    (item.suggested ? " template-option--suggested" : "")
                  }
                  onClick={() => {
                    setSelectedKey(item.key);
                    setParams(item.default_params ?? {});
                  }}
                >
                  <div className="template-option-title">{item.label}</div>
                  <div className="template-option-meta">
                    {formatCategory(item.category)}
                    {item.suggested ? " · Suggested" : ""}
                  </div>
                </button>
              ))}
            </div>

            <div className="template-form">
                <div className="template-form-preview">
                <div className="template-form-label">Preview</div>
                <div className="template-form-preview-copy">{selected.preview}</div>
              </div>

              <div className="template-fields">
                {selected.params.map((field) => (
                  <label key={field.key} className="template-field">
                    <span className="template-field-label">
                      {field.label}
                      {field.required ? " *" : ""}
                    </span>
                    <input
                      className="thread-input template-field-input"
                      value={params[field.key] ?? ""}
                      onChange={(event) =>
                        setParams((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>

              {error ? <div className="template-modal-error">{error}</div> : null}

              <div className="template-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={sending}>
                  Cancel
                </button>
                <button type="button" className="btn btn-success" onClick={handleSubmit} disabled={sending}>
                  {sending ? "Sending..." : "Send template"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
