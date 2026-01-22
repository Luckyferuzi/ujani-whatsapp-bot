"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { post } from "@/lib/api";
import { toast } from "sonner";

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
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (!confirmOptIn) return false;
  return true;
}, [message, confirmOptIn]);

  const audienceBadge = useMemo(() => {
    if (audience === "24h") {
      return { text: "Audience: Last 24h (Recommended)", tone: "ok" as const };
    }
    return { text: "Audience: All-time (Higher failure risk)", tone: "warn" as const };
  }, [audience]);

  const previewText = useMemo(() => {
    const trimmed = message.trim();
    return trimmed ? trimmed : "Andika ujumbe wako hapo kushoto ili uone preview hapa…";
  }, [message]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = message.trim();
    if (!trimmed) {
      toast.error("Tafadhali andika ujumbe wa kutumwa.");
      return;
    }

    if (!confirmOptIn) {
      toast.error("Tafadhali thibitisha opt-in / ruhusa ya wateja.");
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const payload: any = { message: trimmed };
      if (audience === "24h") payload.within_hours = 24;

      const res = await post<BroadcastResponse>("/api/customers/broadcast", payload);

      setResult(res);
      toast.success("Broadcast imetumwa.", {
        description: `Imetumwa kwa ${res.sent} wateja, imeshindikana kwa ${res.failed}.`,
      });
    } catch (err: any) {
      console.error("Broadcast failed", err);
      toast.error("Imeshindikana kutuma broadcast.", {
        description: err?.message ?? "Kumetokea hitilafu. Tafadhali jaribu tena baadae.",
      });
    } finally {
      setSending(false);
    }
  }

return (
  <>
    <div className="broadcast-topbar">
      <div>
        <div className="broadcast-title">Broadcast</div>
        <div className="broadcast-subtitle">
          Tuma ujumbe mmoja kwa wateja wako. Weka ujumbe mfupi na wa huduma.
        </div>
      </div>

      <Link className="broadcast-link" href="/inbox">
        ← Inbox
      </Link>
    </div>

    <div className="broadcast-shell">
      {/* LEFT: Simple Composer */}
      <div className="broadcast-card">
        <div className="broadcast-card-header">
          <div className="broadcast-card-title">Ujumbe</div>

          <span
            className={
              "broadcast-badge " +
              (audience === "24h" ? "broadcast-badge--ok" : "broadcast-badge--warn")
            }
          >
            {audience === "24h" ? "Last 24h" : "All-time"}
          </span>
        </div>

        <div className="broadcast-card-body">
          <label className="broadcast-label">Walengwa</label>
          <div className="broadcast-segment">
            <button
              type="button"
              className={"broadcast-seg-btn" + (audience === "24h" ? " broadcast-seg-btn--active" : "")}
              onClick={() => setAudience("24h")}
              disabled={sending}
            >
              Last 24 hours
            </button>

            <button
              type="button"
              className={"broadcast-seg-btn" + (audience === "all" ? " broadcast-seg-btn--active" : "")}
              onClick={() => setAudience("all")}
              disabled={sending}
            >
              All-time
            </button>
          </div>

          {audience === "all" && (
            <div className="broadcast-alert">
              Tahadhari: all-time inaweza kushindikana kwa wateja ambao hawaja-message ndani ya 24h.
            </div>
          )}

          <div className="broadcast-section">
            <label className="broadcast-label">Ujumbe wa kutuma</label>
            <textarea
              className="broadcast-textarea"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={maxLength}
              placeholder="Mfano: Habari, tunahitaji kuthibitisha oda yako. Jibu NDIO au HAPANA."
              disabled={sending}
            />

            <div className="broadcast-meta-row">
              <div className="broadcast-note">Tip: Ujumbe 1–3 mistari ni bora.</div>
              <div className="broadcast-count">{remaining} herufi</div>
            </div>
          </div>

          <div className="broadcast-section">
            <label className="broadcast-check">
              <input
                type="checkbox"
                checked={confirmOptIn}
                onChange={(e) => setConfirmOptIn(e.target.checked)}
                disabled={sending}
              />
              <span>Ninathibitisha huu ni ujumbe wa huduma na wateja wamewasiliana na Ujani.</span>
            </label>
          </div>

          <div className="broadcast-footer">
            <button
              type="button"
              className="broadcast-primary"
              onClick={(e) => void handleSubmit(e as any)}
              disabled={sending || !canSubmit}
            >
              {sending ? "Inatuma..." : "Tuma"}
            </button>

            <div className="broadcast-flag">
              {result ? (
                <>
                  Sent <strong>{result.sent}</strong> · Failed <strong>{result.failed}</strong>
                </>
              ) : (
                "Preview iko upande wa kulia."
              )}
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT: Preview + Results (Simple) */}
      <div className="broadcast-preview">
        <div className="broadcast-card">
          <div className="broadcast-card-header">
            <div className="broadcast-card-title">Preview</div>
            <div className="preview-meta">WhatsApp style</div>
          </div>

          <div className="broadcast-card-body">
            <div className="preview-bubble preview-bubble--bot">
              Mfano wa jinsi ujumbe utaonekana kwa mteja.
            </div>

            <div className="preview-bubble preview-bubble--out">{previewText}</div>

            {audience === "all" && (
              <div className="broadcast-note" style={{ marginTop: 10 }}>
                Kwa all-time: failures zinaweza kuongezeka bila templates.
              </div>
            )}
          </div>
        </div>

        <div className="broadcast-card">
          <div className="broadcast-card-header">
            <div className="broadcast-card-title">Matokeo</div>
            <div className="preview-meta">{result ? "Done" : "—"}</div>
          </div>

          <div className="broadcast-card-body">
            {!result ? (
              <div className="broadcast-note">Baada ya kutuma, utapata sent/failed hapa.</div>
            ) : (
              <div className="broadcast-result-grid">
                <div className="broadcast-kpi">
                  <div className="broadcast-kpi-label">Sent</div>
                  <div className="broadcast-kpi-value">{result.sent}</div>
                </div>
                <div className="broadcast-kpi">
                  <div className="broadcast-kpi-label">Failed</div>
                  <div className="broadcast-kpi-value">{result.failed}</div>
                </div>
                <div className="broadcast-kpi">
                  <div className="broadcast-kpi-label">Total</div>
                  <div className="broadcast-kpi-value">
                    {typeof result.total === "number" ? result.total : "—"}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </>
);

}
