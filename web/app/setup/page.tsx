"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";

type CompanySettings = {
  company_name: string;
  whatsapp_token: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  verify_token: string | null;
  app_secret: string | null;
  app_id: string | null;
  graph_api_version: string | null;
  is_setup_complete: boolean;
};

type RuntimeConfig = {
  delivery: {
    base_lat: number;
    base_lng: number;
    service_radius_km: number;
    require_location_pin: boolean;
    rate_per_km: number;
    round_to: number;
    default_distance_km: number;
  };
  payment: {
    lipa_namba_till: string;
    lipa_namba_name: string;
    voda_lnm_till: string;
    voda_lnm_name: string;
    voda_p2p_msisdn: string;
    voda_p2p_name: string;
  };
};

type SetupDiagnostics = {
  setup: {
    missing_required: string[];
    configured_phone_number_id: string | null;
    configured_graph_version: string | null;
  };
  graph: {
    phone_summary:
      | {
          ok: true;
          id: string;
          display_phone_number: string | null;
          verified_name: string | null;
        }
      | null;
  };
  inbox: {
    conversations: number;
    messages_total: number;
    messages_inbound: number;
    messages_outbound: number;
    last_inbound:
      | {
          at: string;
          age_minutes: number | null;
          from_wa_id: string | null;
          from_phone: string | null;
          phone_number_id: string | null;
          body_preview: string;
        }
      | null;
  };
  issues: Array<{ level: "error" | "warn"; code: string; message: string }>;
};

export default function SetupPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [diag, setDiag] = useState<SetupDiagnostics | null>(null);

  const [settings, setSettings] = useState<CompanySettings>({
    company_name: "",
    whatsapp_token: "",
    phone_number_id: "",
    waba_id: "",
    verify_token: "",
    app_secret: "",
    app_id: "",
    graph_api_version: "v19.0",
    is_setup_complete: false,
  });

  const [runtime, setRuntime] = useState<RuntimeConfig | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testText, setTestText] = useState("Ujani setup test message.");

  useEffect(() => {
    if (!user) return;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [s, r] = await Promise.all([
          api<{ ok: true; settings: CompanySettings }>("/api/company/settings"),
          api<{ ok: true; config: RuntimeConfig }>("/api/company/runtime-config"),
        ]);
        setSettings((prev) => ({ ...prev, ...s.settings }));
        setRuntime(r.config);
        const d = await api<{ ok: true; diagnostics: SetupDiagnostics }>("/api/setup/diagnostics");
        setDiag(d.diagnostics);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load setup data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setOkMsg(null);
    try {
      const payload = {
        company_name: settings.company_name || "",
        whatsapp_token: settings.whatsapp_token || null,
        phone_number_id: settings.phone_number_id || null,
        waba_id: settings.waba_id || null,
        verify_token: settings.verify_token || null,
        app_secret: settings.app_secret || null,
        app_id: settings.app_id || null,
        graph_api_version: settings.graph_api_version || "v19.0",
      };
      const res = await api<{ ok: true; settings: CompanySettings }>("/api/company/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSettings((prev) => ({ ...prev, ...res.settings }));
      setOkMsg("Settings saved.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function runTestSend() {
    setTesting(true);
    setError(null);
    setOkMsg(null);
    try {
      await api<{ ok: boolean }>("/api/setup/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo, text: testText }),
      });
      setOkMsg("Test message sent successfully.");
    } catch (e: any) {
      setError(e?.message ?? "Test send failed.");
    } finally {
      setTesting(false);
    }
  }

  async function completeSetup() {
    setCompleting(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await api<{ ok: true; settings: CompanySettings }>("/api/setup/complete", {
        method: "POST",
      });
      setSettings((prev) => ({ ...prev, ...res.settings }));
      setOkMsg("Setup marked as complete.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to complete setup.");
    } finally {
      setCompleting(false);
    }
  }

  async function runDiagnostics() {
    setChecking(true);
    setError(null);
    try {
      const d = await api<{ ok: true; diagnostics: SetupDiagnostics }>("/api/setup/diagnostics");
      setDiag(d.diagnostics);
      setOkMsg("Diagnostics refreshed.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load diagnostics.");
    } finally {
      setChecking(false);
    }
  }

  if (!user) return null;
  if (user.role !== "admin") {
    return (
      <div>
        <h1>Setup</h1>
        <p>Only admin can manage setup.</p>
      </div>
    );
  }
  if (loading) return <div>Loading setup...</div>;

  return (
    <div>
      <h1>Project Setup</h1>
      <p>Split into two parts: WhatsApp connection variables and flow/runtime variables.</p>

      {error ? <p className="text-red-600">{error}</p> : null}
      {okMsg ? <p className="text-green-700">{okMsg}</p> : null}

      <div className="rounded-xl border p-4 mt-4">
        <h2 className="font-semibold">1) WhatsApp Connection (editable in interface)</h2>
        <p className="text-sm mb-3">
          These variables connect this project to Meta WhatsApp API.
        </p>

        <form onSubmit={saveSettings} className="space-y-3">
          <div>
            <label>Company name</label>
            <input
              className="w-full border rounded p-2"
              value={settings.company_name ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, company_name: e.target.value }))}
            />
          </div>

          <div>
            <label>WhatsApp access token</label>
            <input
              type="password"
              className="w-full border rounded p-2"
              value={settings.whatsapp_token ?? ""}
              onChange={(e) => setSettings((s) => ({ ...s, whatsapp_token: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label>Phone Number ID</label>
              <input
                className="w-full border rounded p-2"
                value={settings.phone_number_id ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, phone_number_id: e.target.value }))}
              />
            </div>
            <div>
              <label>WABA ID</label>
              <input
                className="w-full border rounded p-2"
                value={settings.waba_id ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, waba_id: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label>Verify token (webhook)</label>
              <input
                className="w-full border rounded p-2"
                value={settings.verify_token ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, verify_token: e.target.value }))}
              />
            </div>
            <div>
              <label>App secret</label>
              <input
                type="password"
                className="w-full border rounded p-2"
                value={settings.app_secret ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, app_secret: e.target.value }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label>App ID</label>
              <input
                className="w-full border rounded p-2"
                value={settings.app_id ?? ""}
                onChange={(e) => setSettings((s) => ({ ...s, app_id: e.target.value }))}
              />
            </div>
            <div>
              <label>Graph API version</label>
              <input
                className="w-full border rounded p-2"
                value={settings.graph_api_version ?? "v19.0"}
                onChange={(e) => setSettings((s) => ({ ...s, graph_api_version: e.target.value }))}
              />
            </div>
          </div>

          <button className="bg-ui-primary text-white px-4 py-2 rounded" disabled={saving}>
            {saving ? "Saving..." : "Save WhatsApp Settings"}
          </button>
        </form>

        <div className="border-t mt-4 pt-4">
          <h3 className="font-semibold">Test Connection</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
            <input
              className="w-full border rounded p-2"
              placeholder="Recipient phone (E.164 or wa_id)"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
            <input
              className="w-full border rounded p-2"
              placeholder="Test message text"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
            />
          </div>
          <button
            className="mt-3 border rounded px-4 py-2"
            onClick={() => void runTestSend()}
            disabled={testing || !testTo.trim() || !testText.trim()}
          >
            {testing ? "Sending..." : "Send Test Message"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border p-4 mt-4">
        <h2 className="font-semibold">2) Flow / Runtime Variables (currently env-driven)</h2>
        <p className="text-sm mb-3">
          These affect delivery, pricing, and payment behavior during bot flow execution.
        </p>

        {runtime ? (
          <div className="space-y-3">
            <div className="border rounded p-3">
              <div className="font-semibold mb-1">Delivery</div>
              <div className="text-sm">Base: {runtime.delivery.base_lat}, {runtime.delivery.base_lng}</div>
              <div className="text-sm">Service radius: {runtime.delivery.service_radius_km} km</div>
              <div className="text-sm">Require location pin: {runtime.delivery.require_location_pin ? "Yes" : "No"}</div>
              <div className="text-sm">Rate per km: {runtime.delivery.rate_per_km}</div>
              <div className="text-sm">Round to: {runtime.delivery.round_to}</div>
              <div className="text-sm">Default distance: {runtime.delivery.default_distance_km} km</div>
            </div>

            <div className="border rounded p-3">
              <div className="font-semibold mb-1">Payment</div>
              <div className="text-sm">Lipa Namba: {runtime.payment.lipa_namba_till || "-"}</div>
              <div className="text-sm">Vodacom LNM: {runtime.payment.voda_lnm_till || "-"}</div>
              <div className="text-sm">Vodacom P2P: {runtime.payment.voda_p2p_msisdn || "-"}</div>
            </div>
          </div>
        ) : (
          <p>No runtime config data.</p>
        )}
      </div>

      <div className="rounded-xl border p-4 mt-4">
        <h2 className="font-semibold">Finalize</h2>
        <p className="text-sm mb-3">
          Mark setup complete after successful test send and webhook configuration.
        </p>
        <div className="flex items-center gap-3">
          <button className="border rounded px-4 py-2" onClick={() => void completeSetup()} disabled={completing}>
            {completing ? "Completing..." : "Mark Setup Complete"}
          </button>
          <span className="text-sm">
            Status: {settings.is_setup_complete ? "Complete" : "Incomplete"}
          </span>
        </div>
      </div>

      <div className="rounded-xl border p-4 mt-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Bot + Inbox Diagnostics</h2>
          <button className="border rounded px-3 py-1 text-sm" onClick={() => void runDiagnostics()} disabled={checking}>
            {checking ? "Checking..." : "Refresh checks"}
          </button>
        </div>

        {!diag ? (
          <p className="text-sm mt-2">No diagnostics yet.</p>
        ) : (
          <div className="space-y-3 mt-3">
            <div className="text-sm">
              <div>Conversations: {diag.inbox.conversations}</div>
              <div>Messages: {diag.inbox.messages_total} (in: {diag.inbox.messages_inbound}, out: {diag.inbox.messages_outbound})</div>
              <div>
                Last inbound:{" "}
                {diag.inbox.last_inbound
                  ? `${diag.inbox.last_inbound.at} (${diag.inbox.last_inbound.age_minutes ?? 0} min ago)`
                  : "none"}
              </div>
            </div>

            <div className="text-sm">
              <div>Configured Phone Number ID: {diag.setup.configured_phone_number_id || "-"}</div>
              <div>Graph phone check: {diag.graph.phone_summary ? "OK" : "Not reachable / not configured"}</div>
              {diag.graph.phone_summary ? (
                <div>
                  Verified Name: {diag.graph.phone_summary.verified_name || "-"} | Display Number:{" "}
                  {diag.graph.phone_summary.display_phone_number || "-"}
                </div>
              ) : null}
            </div>

            {diag.setup.missing_required.length > 0 ? (
              <div className="text-sm text-red-700">
                Missing required: {diag.setup.missing_required.join(", ")}
              </div>
            ) : null}

            {diag.issues.length > 0 ? (
              <div className="text-sm">
                {diag.issues.map((i) => (
                  <div key={i.code} className={i.level === "error" ? "text-red-700" : "text-amber-700"}>
                    [{i.level}] {i.message}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-green-700">No blocking issues detected.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
