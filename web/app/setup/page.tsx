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
  waba_id: string | null;
  verify_token: string | null;
  app_id: string | null;
  app_secret: string | null;
  graph_api_version: string | null;

  // IMPORTANT: coexistence fields intentionally removed from UI
  is_setup_complete: boolean;
};

type PhoneNumberRow = {
  phone_number_id: string;
  display_phone_number: string | null;
  label: string | null;
  is_default: boolean;
};

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      className="text-xs px-2 py-1 rounded border border-ui-border hover:bg-gray-50"
      onClick={() => void navigator.clipboard.writeText(text)}
      title={text}
    >
      {label}
    </button>
  );
}

function SecretInput(props: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  revealed: boolean;
  onToggle: () => void;
  hint?: string;
}) {
  const { label, value, placeholder, onChange, revealed, onToggle, hint } = props;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <label className="text-sm font-semibold">{label}</label>
        <button
          type="button"
          className="text-xs px-2 py-1 rounded border border-ui-border hover:bg-gray-50"
          onClick={onToggle}
        >
          {revealed ? "Hide" : "Show"}
        </button>
      </div>

      <input
        className="w-full mt-1 px-3 py-2 rounded border border-ui-border"
        type={revealed ? "text" : "password"}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
      />

      {hint ? <div className="text-xs text-ui-muted mt-1">{hint}</div> : null}
    </div>
  );
}

export default function SetupPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumberRow[]>([]);

  // Local form state (manual-only)
  const [companyName, setCompanyName] = useState("");
  const [waToken, setWaToken] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [wabaId, setWabaId] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [graphVer, setGraphVer] = useState("v19.0");

  const [revealToken, setRevealToken] = useState(false);
  const [revealSecret, setRevealSecret] = useState(false);

  const [testTo, setTestTo] = useState("");
  const [testText, setTestText] = useState("Hello from Ujani bot ✅");

  const isComplete = !!settings?.is_setup_complete;

  const defaultPhoneRow = useMemo(() => {
    return phoneNumbers.find((x) => x.is_default) ?? null;
  }, [phoneNumbers]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [r, pn] = await Promise.all([
        get<{ ok: true; settings: CompanySettings }>("/api/company/settings"),
        get<{ items: any[] }>("/api/company/whatsapp-numbers").catch(() => ({ items: [] })),
      ]);

      setSettings(r.settings);

      const rows = (pn.items || []).map((x: any) => ({
        phone_number_id: String(x.phone_number_id),
        display_phone_number: x.display_phone_number ?? null,
        label: x.label ?? null,
        is_default: !!x.is_default,
      })) as PhoneNumberRow[];
      setPhoneNumbers(rows);

      setCompanyName(r.settings.company_name ?? "");
      setWaToken(r.settings.whatsapp_token ?? "");
      setPhoneNumberId(r.settings.phone_number_id ?? "");
      setWabaId(r.settings.waba_id ?? "");
      setVerifyToken(r.settings.verify_token ?? "");
      setAppId(r.settings.app_id ?? "");
      setAppSecret(r.settings.app_secret ?? "");
      setGraphVer(r.settings.graph_api_version ?? "v19.0");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    if (!settings) return;
    setSaving(true);
    try {
      const payload: Partial<CompanySettings> = {
        company_name: companyName.trim() || settings.company_name,

        whatsapp_token: waToken.trim() || null,
        phone_number_id: phoneNumberId.trim() || null,
        waba_id: wabaId.trim() || null,
        verify_token: verifyToken.trim() || null,
        app_id: appId.trim() || null,
        app_secret: appSecret.trim() || null,
        graph_api_version: graphVer.trim() || "v19.0",
      };

      const out = await put<{ ok: true; settings: CompanySettings }>("/api/company/settings", payload);
      setSettings(out.settings);

      // Refresh phone numbers list after save (in case token/phone id changed)
      const pn = await get<{ items: any[] }>("/api/company/whatsapp-numbers").catch(() => ({ items: [] }));
      const rows = (pn.items || []).map((x: any) => ({
        phone_number_id: String(x.phone_number_id),
        display_phone_number: x.display_phone_number ?? null,
        label: x.label ?? null,
        is_default: !!x.is_default,
      })) as PhoneNumberRow[];
      setPhoneNumbers(rows);

      alert("Saved ✅");
    } catch (e: any) {
      alert(e?.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function setDefaultPhone(id: string) {
    if (!id) return;
    setSaving(true);
    try {
      await post("/api/company/whatsapp-numbers/default", { phone_number_id: id });
      await load();
      alert("Default number set ✅");
    } catch (e: any) {
      alert(e?.message ?? "Failed to set default");
    } finally {
      setSaving(false);
    }
  }

  async function testSend() {
    setSaving(true);
    try {
      const to = testTo.trim();
      if (!to) return alert("Enter test recipient number");

      await post("/api/setup/test-send", { to, text: testText });
      alert("Test sent ✅ (check WhatsApp)");
    } catch (e: any) {
      alert(e?.message ?? "Test send failed");
    } finally {
      setSaving(false);
    }
  }

  async function completeSetup() {
    setSaving(true);
    try {
      const out = await post<{ ok: true; settings: CompanySettings }>("/api/setup/complete", {});
      setSettings(out.settings);
      alert("Setup complete ✅");
      router.push("/");
    } catch (e: any) {
      alert(e?.message ?? "Failed to complete setup");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="rounded-xl border p-5">Loading…</div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6">
        <div className="rounded-xl border p-5">Failed to load settings.</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="rounded-xl border p-5">
        <h1 className="text-xl font-black">Setup</h1>
        <p className="text-sm text-ui-muted mt-1">
          Manual WhatsApp Cloud API setup (Coexistence / Embedded Signup removed).
        </p>

        {isComplete ? (
          <div className="mt-3 text-sm">
            ✅ Setup complete. If WhatsApp stops working after DB reset, re-enter token + phone_number_id here.
          </div>
        ) : (
          <div className="mt-3 text-sm">
            ⚠️ Not complete yet. Save credentials, test-send, then click “Complete setup”.
          </div>
        )}
      </div>

      <div className="rounded-xl border p-5 space-y-4">
        <h2 className="text-lg font-extrabold">Company</h2>

        <div>
          <label className="text-sm font-semibold">Company name</label>
          <input
            className="w-full mt-1 px-3 py-2 rounded border border-ui-border"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-xl border p-5 space-y-4">
        <h2 className="text-lg font-extrabold">WhatsApp Cloud API credentials</h2>

        <SecretInput
          label="WHATSAPP_TOKEN"
          value={waToken}
          onChange={setWaToken}
          revealed={revealToken}
          onToggle={() => setRevealToken((x) => !x)}
          hint="Use a permanent/system-user token. Temporary tokens will break."
        />

        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-semibold">PHONE_NUMBER_ID</label>
            {phoneNumberId ? <CopyButton text={phoneNumberId} /> : null}
          </div>

          <input
            className="w-full mt-1 px-3 py-2 rounded border border-ui-border"
            value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value)}
            placeholder="e.g. 123456789012345"
          />

          {phoneNumbers.length > 0 ? (
            <div className="mt-2 border border-ui-border rounded p-3">
              <div className="text-xs text-ui-muted mb-2">Phone numbers seen by the backend:</div>
              <select
                className="w-full px-3 py-2 rounded border border-ui-border"
                value={defaultPhoneRow?.phone_number_id ?? ""}
                onChange={(e) => void setDefaultPhone(e.target.value)}
                disabled={saving}
              >
                <option value="" disabled>
                  Choose default sending number…
                </option>
                {phoneNumbers.map((x) => (
                  <option key={x.phone_number_id} value={x.phone_number_id}>
                    {x.display_phone_number ?? x.phone_number_id} {x.is_default ? "(default)" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="text-xs text-ui-muted mt-2">
              (No numbers listed yet — usually means token/WABA not saved, or token can’t access the account.)
            </div>
          )}
        </div>

        <div>
          <label className="text-sm font-semibold">WABA_ID</label>
          <input
            className="w-full mt-1 px-3 py-2 rounded border border-ui-border"
            value={wabaId}
            onChange={(e) => setWabaId(e.target.value)}
            placeholder="e.g. 123456789012345"
          />
        </div>

        <div>
          <label className="text-sm font-semibold">VERIFY_TOKEN</label>
          <input
            className="w-full mt-1 px-3 py-2 rounded border border-ui-border"
            value={verifyToken}
            onChange={(e) => setVerifyToken(e.target.value)}
            placeholder="Webhook verify token"
          />
        </div>

        <div>
          <label className="text-sm font-semibold">APP_ID</label>
          <input
            className="w-full mt-1 px-3 py-2 rounded border border-ui-border"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder="Meta App ID"
          />
        </div>

        <SecretInput
          label="APP_SECRET"
          value={appSecret}
          onChange={setAppSecret}
          revealed={revealSecret}
          onToggle={() => setRevealSecret((x) => !x)}
        />

        <div>
          <label className="text-sm font-semibold">GRAPH_API_VERSION</label>
          <input
            className="w-full mt-1 px-3 py-2 rounded border border-ui-border"
            value={graphVer}
            onChange={(e) => setGraphVer(e.target.value)}
            placeholder="v19.0"
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            className="px-3 py-2 rounded border border-ui-border hover:bg-gray-50"
            disabled={saving}
            onClick={() => void saveSettings()}
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>

      <div className="rounded-xl border p-5 space-y-3">
        <h2 className="text-lg font-extrabold">Test send</h2>

        <div>
          <label className="text-sm font-semibold">Send to (phone)</label>
          <input
            className="w-full mt-1 px-3 py-2 rounded border border-ui-border"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="e.g. 2557xxxxxxx"
          />
        </div>

        <div>
          <label className="text-sm font-semibold">Message</label>
          <input
            className="w-full mt-1 px-3 py-2 rounded border border-ui-border"
            value={testText}
            onChange={(e) => setTestText(e.target.value)}
          />
        </div>

        <button
          type="button"
          className="px-3 py-2 rounded border border-ui-border hover:bg-gray-50"
          disabled={saving}
          onClick={() => void testSend()}
        >
          {saving ? "Sending…" : "Send test"}
        </button>
      </div>

      <div className="rounded-xl border p-5 space-y-3">
        <h2 className="text-lg font-extrabold">Finish</h2>
        <p className="text-sm text-ui-muted">
          Click this only after test-send works and your webhook is configured in Meta.
        </p>

        <button
          type="button"
          className="px-3 py-2 rounded border border-ui-border hover:bg-gray-50"
          disabled={saving}
          onClick={() => void completeSetup()}
        >
          {saving ? "Working…" : "Complete setup"}
        </button>
      </div>
    </div>
  );
}
