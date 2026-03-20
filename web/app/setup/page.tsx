"use client";

import { FormEvent, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/AuthProvider";
import { useCachedQuery } from "@/hooks/useCachedQuery";

type CompanySettings = {
  company_name: string;
  whatsapp_token: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  verify_token: string | null;
  app_secret: string | null;
  app_id: string | null;
  graph_api_version: string | null;
  catalog_enabled: boolean;
  business_content: {
    welcome_intro: { sw?: string; en?: string };
    pickup_info: { sw?: string; en?: string };
    support_phone: string | null;
    support_email: string | null;
    payment_methods: Array<{ id: string; label: string; value: string }>;
  };
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

type CatalogDiagnostics = {
  catalog_enabled: boolean;
  configured_phone_number_id: string | null;
  configured_waba_id: string | null;
  connected_catalog_id: string | null;
  healthy: boolean;
  issues: Array<{ level: "error" | "warn"; code: string; message: string }>;
};

type ReconcileStats = {
  groups_merged: number;
  customers_merged: number;
  conversations_merged: number;
  messages_moved: number;
};

type SetupBootstrap = {
  settings: CompanySettings;
  runtime: RuntimeConfig;
  diagnostics: SetupDiagnostics;
  catalogDiagnostics: CatalogDiagnostics;
};

export default function SetupPage() {
  const { user } = useAuth();
  const [bootstrapped, setBootstrapped] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [diag, setDiag] = useState<SetupDiagnostics | null>(null);
  const [catalogDiag, setCatalogDiag] = useState<CatalogDiagnostics | null>(null);
  const [reconcileStats, setReconcileStats] = useState<ReconcileStats | null>(null);

  const [settings, setSettings] = useState<CompanySettings>({
    company_name: "",
    whatsapp_token: "",
    phone_number_id: "",
    waba_id: "",
    verify_token: "",
    app_secret: "",
    app_id: "",
    graph_api_version: "v19.0",
    catalog_enabled: false,
    business_content: {
      welcome_intro: { sw: "", en: "" },
      pickup_info: { sw: "", en: "" },
      support_phone: "",
      support_email: "",
      payment_methods: [
        { id: "PAY_1", label: "", value: "" },
        { id: "PAY_2", label: "", value: "" },
        { id: "PAY_3", label: "", value: "" },
      ],
    },
    is_setup_complete: false,
  });

  const [runtime, setRuntime] = useState<RuntimeConfig | null>(null);
  const [testTo, setTestTo] = useState("");
  const [testText, setTestText] = useState("Ujani setup test message.");

  const {
    data: bootstrap,
    error: bootstrapError,
    isLoading: loading,
    isRefreshing,
    mutate: mutateBootstrap,
  } = useCachedQuery(
    user ? "setup:bootstrap" : null,
    async (): Promise<SetupBootstrap> => {
      const [s, r, d, cd] = await Promise.all([
        api<{ ok: true; settings: CompanySettings }>("/api/company/settings"),
        api<{ ok: true; config: RuntimeConfig }>("/api/company/runtime-config"),
        api<{ ok: true; diagnostics: SetupDiagnostics }>("/api/setup/diagnostics"),
        api<{ ok: true; diagnostics: CatalogDiagnostics }>("/api/setup/catalog-diagnostics"),
      ]);

      return {
        settings: s.settings,
        runtime: r.config,
        diagnostics: d.diagnostics,
        catalogDiagnostics: cd.diagnostics,
      };
    },
    { enabled: !!user, staleMs: 30_000 }
  );

  useEffect(() => {
    if (!user) {
      setBootstrapped(false);
      return;
    }
    if (!bootstrap || bootstrapped) return;

    setSettings((prev) => ({ ...prev, ...bootstrap.settings }));
    setRuntime(bootstrap.runtime);
    setDiag(bootstrap.diagnostics);
    setCatalogDiag(bootstrap.catalogDiagnostics);
    setBootstrapped(true);
  }, [bootstrap, bootstrapped, user]);

  useEffect(() => {
    if (!bootstrapError) return;
    setError(bootstrapError.message ?? "Failed to load setup data.");
  }, [bootstrapError]);

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
        catalog_enabled: !!settings.catalog_enabled,
        business_content: {
          welcome_intro: {
            sw: settings.business_content?.welcome_intro?.sw || "",
            en: settings.business_content?.welcome_intro?.en || "",
          },
          pickup_info: {
            sw: settings.business_content?.pickup_info?.sw || "",
            en: settings.business_content?.pickup_info?.en || "",
          },
          support_phone: settings.business_content?.support_phone || null,
          support_email: settings.business_content?.support_email || null,
          payment_methods: (settings.business_content?.payment_methods || []).filter(
            (item) => item.id.trim() && item.label.trim() && item.value.trim()
          ),
        },
      };
      const res = await api<{ ok: true; settings: CompanySettings }>("/api/company/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSettings((prev) => ({ ...prev, ...res.settings }));
      if (bootstrap) {
        mutateBootstrap((current) => ({
          ...(current ?? bootstrap),
          settings: { ...(current?.settings ?? bootstrap.settings), ...res.settings },
        }));
      }
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
      const cd = await api<{ ok: true; diagnostics: CatalogDiagnostics }>("/api/setup/catalog-diagnostics");
      setCatalogDiag(cd.diagnostics);
      if (bootstrap) {
        mutateBootstrap((current) => ({
          ...(current ?? bootstrap),
          diagnostics: d.diagnostics,
          catalogDiagnostics: cd.diagnostics,
        }));
      }
      setOkMsg("Diagnostics refreshed.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to load diagnostics.");
    } finally {
      setChecking(false);
    }
  }

  async function runReconcile() {
    setReconciling(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await api<{ ok: true; stats: ReconcileStats }>("/api/setup/reconcile-contacts", {
        method: "POST",
      });
      setReconcileStats(res.stats);
      setOkMsg("Contact reconciliation completed.");
      const d = await api<{ ok: true; diagnostics: SetupDiagnostics }>("/api/setup/diagnostics");
      setDiag(d.diagnostics);
      if (bootstrap) {
        mutateBootstrap((current) => ({
          ...(current ?? bootstrap),
          diagnostics: d.diagnostics,
        }));
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to reconcile contacts.");
    } finally {
      setReconciling(false);
    }
  }

  const blockingIssueCount = diag?.issues.filter((issue) => issue.level === "error").length ?? 0;
  const missingRequiredCount = diag?.setup.missing_required.length ?? 0;
  const paymentMethodCount = settings.business_content?.payment_methods?.filter(
    (item) => item.id.trim() && item.label.trim() && item.value.trim()
  ).length ?? 0;

  if (!user) return null;
  if (user.role !== "admin") {
    return (
      <div>
        <h1>Setup</h1>
        <p>Only admin can manage setup.</p>
      </div>
    );
  }
  if (loading && !bootstrapped) return <div>Loading setup...</div>;

  return (
    <div className="setup-page">
      <section className="setup-hero">
        <div className="setup-hero-copy">
          <div className="setup-kicker">System and business settings</div>
          <h1>Business setup</h1>
          <p>
            Manage business identity, WhatsApp connection details, operator-facing payment instructions, and live
            diagnostics from one setup workspace.
          </p>
          {isRefreshing ? <div className="setup-kicker">Refreshing setup data...</div> : null}
        </div>

        <div className="setup-hero-grid">
          <div className="setup-metric">
            <span className="setup-metric-label">Setup status</span>
            <strong className="setup-metric-value">{settings.is_setup_complete ? "Complete" : "In progress"}</strong>
            <span className="setup-metric-meta">mark complete only after test send and webhook checks pass</span>
          </div>
          <div className="setup-metric">
            <span className="setup-metric-label">Blocking issues</span>
            <strong className="setup-metric-value">{blockingIssueCount}</strong>
            <span className="setup-metric-meta">errors currently reported by diagnostics</span>
          </div>
          <div className="setup-metric">
            <span className="setup-metric-label">Payment rails</span>
            <strong className="setup-metric-value">{paymentMethodCount}</strong>
            <span className="setup-metric-meta">configured payment instructions for operators and chatbot</span>
          </div>
        </div>
      </section>

      <div className="setup-summary-grid">
        <div className="setup-summary-card">
          <div className="setup-summary-label">Missing required fields</div>
          <div className="setup-summary-value">{missingRequiredCount}</div>
          <div className="setup-summary-sub">required WhatsApp config values still not present</div>
        </div>
        <div className="setup-summary-card">
          <div className="setup-summary-label">Catalog state</div>
          <div className="setup-summary-value">{catalogDiag?.healthy ? "Healthy" : settings.catalog_enabled ? "Needs attention" : "Disabled"}</div>
          <div className="setup-summary-sub">catalog availability based on current diagnostics</div>
        </div>
        <div className="setup-summary-card">
          <div className="setup-summary-label">Inbox activity</div>
          <div className="setup-summary-value">{diag?.inbox.conversations ?? 0}</div>
          <div className="setup-summary-sub">conversation threads currently present in the inbox</div>
        </div>
      </div>

      {error ? <p className="text-red-600 setup-status-banner setup-status-banner--error">{error}</p> : null}
      {okMsg ? <p className="text-green-700 setup-status-banner setup-status-banner--ok">{okMsg}</p> : null}

      <div className="rounded-xl border p-4 mt-4 setup-section-card">
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

          <div className="border rounded p-3 space-y-3">
            <div className="font-semibold">Business Content</div>
            <p className="text-sm">
              These values keep the current flow logic intact while moving brand-owned text and payment rails into config.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label>Welcome intro (Swahili)</label>
                <textarea
                  className="w-full border rounded p-2 min-h-24"
                  value={settings.business_content?.welcome_intro?.sw ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      business_content: {
                        ...s.business_content,
                        welcome_intro: { ...s.business_content.welcome_intro, sw: e.target.value },
                      },
                    }))
                  }
                />
              </div>
              <div>
                <label>Welcome intro (English)</label>
                <textarea
                  className="w-full border rounded p-2 min-h-24"
                  value={settings.business_content?.welcome_intro?.en ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      business_content: {
                        ...s.business_content,
                        welcome_intro: { ...s.business_content.welcome_intro, en: e.target.value },
                      },
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label>Pickup / office info (Swahili)</label>
                <textarea
                  className="w-full border rounded p-2 min-h-24"
                  value={settings.business_content?.pickup_info?.sw ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      business_content: {
                        ...s.business_content,
                        pickup_info: { ...s.business_content.pickup_info, sw: e.target.value },
                      },
                    }))
                  }
                />
              </div>
              <div>
                <label>Pickup / office info (English)</label>
                <textarea
                  className="w-full border rounded p-2 min-h-24"
                  value={settings.business_content?.pickup_info?.en ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      business_content: {
                        ...s.business_content,
                        pickup_info: { ...s.business_content.pickup_info, en: e.target.value },
                      },
                    }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label>Support phone / WhatsApp</label>
                <input
                  className="w-full border rounded p-2"
                  value={settings.business_content?.support_phone ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      business_content: { ...s.business_content, support_phone: e.target.value },
                    }))
                  }
                />
              </div>
              <div>
                <label>Support email</label>
                <input
                  className="w-full border rounded p-2"
                  value={settings.business_content?.support_email ?? ""}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      business_content: { ...s.business_content, support_email: e.target.value },
                    }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="font-medium">Payment methods</div>
              {(settings.business_content?.payment_methods || []).map((item, index) => (
                <div key={item.id || index} className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <input
                    className="w-full border rounded p-2"
                    placeholder="ID"
                    value={item.id}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        business_content: {
                          ...s.business_content,
                          payment_methods: s.business_content.payment_methods.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, id: e.target.value } : row
                          ),
                        },
                      }))
                    }
                  />
                  <input
                    className="w-full border rounded p-2"
                    placeholder="Label"
                    value={item.label}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        business_content: {
                          ...s.business_content,
                          payment_methods: s.business_content.payment_methods.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, label: e.target.value } : row
                          ),
                        },
                      }))
                    }
                  />
                  <input
                    className="w-full border rounded p-2"
                    placeholder="Number / account"
                    value={item.value}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        business_content: {
                          ...s.business_content,
                          payment_methods: s.business_content.payment_methods.map((row, rowIndex) =>
                            rowIndex === index ? { ...row, value: e.target.value } : row
                          ),
                        },
                      }))
                    }
                  />
                </div>
              ))}
            </div>
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

          <div>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={!!settings.catalog_enabled}
                onChange={(e) => setSettings((s) => ({ ...s, catalog_enabled: e.target.checked }))}
              />
              <span>Enable WhatsApp Catalog features</span>
            </label>
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

      <div className="rounded-xl border p-4 mt-4 setup-section-card">
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

      <div className="rounded-xl border p-4 mt-4 setup-section-card">
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

      <div className="rounded-xl border p-4 mt-4 setup-section-card">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-semibold">Bot + Inbox Diagnostics</h2>
          <div className="flex items-center gap-2">
            <button className="border rounded px-3 py-1 text-sm" onClick={() => void runReconcile()} disabled={reconciling}>
              {reconciling ? "Reconciling..." : "Reconcile Contacts & Chats"}
            </button>
            <button className="border rounded px-3 py-1 text-sm" onClick={() => void runDiagnostics()} disabled={checking}>
              {checking ? "Checking..." : "Refresh checks"}
            </button>
          </div>
        </div>

        {reconcileStats ? (
          <div className="text-sm mt-3 border rounded p-3">
            <div className="font-semibold mb-1">Last Reconcile Result</div>
            <div>Number groups merged: {reconcileStats.groups_merged}</div>
            <div>Duplicate customers merged: {reconcileStats.customers_merged}</div>
            <div>Duplicate conversations merged: {reconcileStats.conversations_merged}</div>
            <div>Messages moved to canonical threads: {reconcileStats.messages_moved}</div>
          </div>
        ) : null}

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

      <div className="rounded-xl border p-4 mt-4 setup-section-card">
        <h2 className="font-semibold">Catalog Health</h2>
        {!catalogDiag ? (
          <p className="text-sm mt-2">No catalog diagnostics yet.</p>
        ) : (
          <div className="text-sm mt-2 space-y-1">
            <div>Catalog enabled: {catalogDiag.catalog_enabled ? "Yes" : "No"}</div>
            <div>Connected catalog id: {catalogDiag.connected_catalog_id || "-"}</div>
            <div>Catalog status: {catalogDiag.healthy ? "Healthy" : "Not ready"}</div>
            {catalogDiag.issues.map((i) => (
              <div key={i.code} className={i.level === "error" ? "text-red-700" : "text-amber-700"}>
                [{i.level}] {i.message}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
