"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { get, post, put } from "@/lib/api";

type CompanySettings = {
  company_name: string;
  logo_url: string | null;
  theme_color: string | null;

  enabled_modules: string[];

  enabled_languages: string[];
  default_language: string;

  working_hours: Record<string, any>;
  after_hours_message: Record<string, string>;

  whatsapp_token: string | null;
  phone_number_id: string | null;
  verify_token: string | null;
  app_id: string | null;
  app_secret: string | null;
  graph_api_version: string | null;

  is_setup_complete: boolean;
};

export default function SetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState<CompanySettings | null>(null);

  const [testTo, setTestTo] = useState("");
  const [testText, setTestText] = useState("Hello from OmniFlow Inbox ✅");
  const [testResult, setTestResult] = useState<string | null>(null);

  const complete = settings?.is_setup_complete ?? false;

  const ALL_MODULES = useMemo(
    () => [
      { key: "inbox", label: "Inbox", hint: "Shared team inbox" },
      { key: "orders", label: "Orders", hint: "Order management" },
      { key: "products", label: "Products", hint: "Catalogue" },
      { key: "flow", label: "Automation", hint: "Flow builder (draft)" },
      { key: "broadcast", label: "Broadcast", hint: "Bulk messaging" },
      { key: "analytics", label: "Analytics", hint: "Dashboards" },
      { key: "incomes", label: "Income", hint: "Finance" },
      { key: "expenses", label: "Expenses", hint: "Finance" },
    ],
    []
  );

  const canSave = useMemo(() => {
    if (!settings) return false;
    return (settings.company_name || "").trim().length > 0;
  }, [settings]);

  function hasModule(key: string) {
    const mods = settings?.enabled_modules ?? [];
    return mods.includes(key);
  }

  function toggleModule(key: string) {
    if (!settings) return;
    // Inbox is always enabled and cannot be turned off.
    if (key === "inbox") return;

    const current = new Set(settings.enabled_modules ?? []);
    // Ensure inbox is always enabled
    current.add("inbox");

    if (current.has(key)) current.delete(key);
    else current.add(key);

    setSettings({ ...settings, enabled_modules: Array.from(current) });
  }

  async function load() {
    setLoading(true);
    try {
      const r = await get<{ ok: true; settings: CompanySettings }>("/api/company/settings");
      setSettings(r.settings);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveSettings(patch: Partial<CompanySettings>) {
    if (!settings) return;
    setSaving(true);
    try {
      const r = await put<{ ok: true; settings: CompanySettings }>("/api/company/settings", patch);
      setSettings(r.settings);
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTestResult(null);
    try {
      await post<{ ok: true }>("/api/setup/test-send", { to: testTo, text: testText });
      setTestResult("Test message sent successfully.");
    } catch (e: any) {
      setTestResult(`Failed: ${e?.message ?? "unknown error"}`);
    }
  }

  async function finishSetup() {
    setSaving(true);
    try {
      const r = await post<{ ok: true; settings: CompanySettings }>("/api/setup/complete");
      setSettings(r.settings);
      router.replace("/inbox");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-6 text-ui-dim text-sm">Loading setup…</div>;
  }

  if (!settings) {
    return (
      <div className="p-6">
        <div className="text-sm text-red-600">Failed to load settings.</div>
        <button className="mt-3 px-3 py-2 rounded bg-black text-white text-sm" onClick={load}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold mb-1">Setup Wizard</h1>
      <p className="text-ui-dim text-sm mb-6">
        Configure this installation for a specific company. After setup, you can operate the Inbox normally.
      </p>

      {/* Step 1: Company */}
      <div className="rounded-xl border border-ui-border p-4 mb-4">
        <div className="font-medium mb-2">1) Company identity</div>
        <label className="block text-sm mb-1">Company name</label>
        <input
          className="w-full border border-ui-border rounded px-3 py-2 text-sm"
          value={settings.company_name ?? ""}
          onChange={(e) => setSettings({ ...settings, company_name: e.target.value })}
          placeholder="e.g. Coca Tanzania"
        />

        <div className="mt-3 flex gap-2">
          <button
            disabled={!canSave || saving}
            className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
            onClick={() => saveSettings({ company_name: settings.company_name })}
          >
            Save
          </button>
          {complete && <span className="text-sm text-green-700 self-center">Setup already completed.</span>}
        </div>
      </div>

      {/* Step 2: WhatsApp */}
      <div className="rounded-xl border border-ui-border p-4 mb-4">
        <div className="font-medium mb-2">2) WhatsApp Cloud API</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm mb-1">Access token</label>
            <input
              className="w-full border border-ui-border rounded px-3 py-2 text-sm"
              value={settings.whatsapp_token ?? ""}
              onChange={(e) => setSettings({ ...settings, whatsapp_token: e.target.value || null })}
              placeholder="EAAG..."
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Phone number ID</label>
            <input
              className="w-full border border-ui-border rounded px-3 py-2 text-sm"
              value={settings.phone_number_id ?? ""}
              onChange={(e) => setSettings({ ...settings, phone_number_id: e.target.value || null })}
              placeholder="1234567890"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Verify token</label>
            <input
              className="w-full border border-ui-border rounded px-3 py-2 text-sm"
              value={settings.verify_token ?? ""}
              onChange={(e) => setSettings({ ...settings, verify_token: e.target.value || null })}
              placeholder="your-verify-token"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">App ID (optional)</label>
            <input
              className="w-full border border-ui-border rounded px-3 py-2 text-sm"
              value={settings.app_id ?? ""}
              onChange={(e) => setSettings({ ...settings, app_id: e.target.value || null })}
              placeholder="123456789"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">App Secret (optional)</label>
            <input
              className="w-full border border-ui-border rounded px-3 py-2 text-sm"
              value={settings.app_secret ?? ""}
              onChange={(e) => setSettings({ ...settings, app_secret: e.target.value || null })}
              placeholder="your-app-secret"
              type="password"
            />
          </div>
          <div>
            <label className="block text-sm mb-1">Graph API version</label>
            <input
              className="w-full border border-ui-border rounded px-3 py-2 text-sm"
              value={settings.graph_api_version ?? "v19.0"}
              onChange={(e) => setSettings({ ...settings, graph_api_version: e.target.value || null })}
              placeholder="v19.0"
            />
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <button
            disabled={saving}
            className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
            onClick={() =>
              saveSettings({
                whatsapp_token: settings.whatsapp_token,
                phone_number_id: settings.phone_number_id,
                verify_token: settings.verify_token,
                app_id: settings.app_id,
                app_secret: settings.app_secret,
                graph_api_version: settings.graph_api_version,
              })
            }
          >
            Save WhatsApp settings
          </button>
        </div>

        <div className="mt-4 border-t border-ui-border pt-4">
          <div className="font-medium text-sm mb-2">Test message</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm mb-1">Send to (E.164 digits, + allowed)</label>
              <input
                className="w-full border border-ui-border rounded px-3 py-2 text-sm"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="+2557XXXXXXX"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Message</label>
              <input
                className="w-full border border-ui-border rounded px-3 py-2 text-sm"
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <button className="px-3 py-2 rounded bg-ui-primary text-white text-sm" onClick={sendTest}>
              Send test
            </button>
            {testResult && <span className="text-sm text-ui-dim">{testResult}</span>}
          </div>
        </div>
      </div>

      {/* Step 3: Modules */}
      <div className="rounded-xl border border-ui-border p-4 mb-4">
        <div className="font-medium mb-2">3) Enable modules</div>
        <p className="text-ui-dim text-sm mb-3">
          Choose which modules appear in the sidebar for this installation. You can change this later.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {ALL_MODULES.map((m) => {
            const checked = hasModule(m.key) || m.key === "inbox";
            const disabled = m.key === "inbox";
            return (
              <label key={m.key} className="flex items-start gap-2 border border-ui-border rounded px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleModule(m.key)}
                />
                <span>
                  <div className="font-medium">
                    {m.label}
                    {disabled ? " (required)" : ""}
                  </div>
                  <div className="text-ui-dim text-xs">{m.hint}</div>
                </span>
              </label>
            );
          })}
        </div>

        <div className="mt-3 flex gap-2">
          <button
            disabled={saving}
            className="px-3 py-2 rounded bg-black text-white text-sm disabled:opacity-50"
            onClick={() => saveSettings({ enabled_modules: settings.enabled_modules })}
          >
            Save modules
          </button>
        </div>
      </div>

      {/* Step 4: Complete */}
      <div className="rounded-xl border border-ui-border p-4">
        <div className="font-medium mb-2">4) Finish</div>
        <p className="text-ui-dim text-sm mb-3">When you finish, this installation will redirect users to the Inbox.</p>
        <button
          disabled={saving || !canSave}
          className="px-3 py-2 rounded bg-green-700 text-white text-sm disabled:opacity-50"
          onClick={finishSetup}
        >
          Mark setup as complete
        </button>
      </div>
    </div>
  );
}
