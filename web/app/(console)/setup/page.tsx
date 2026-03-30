"use client";

import { FormEvent, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/components/AuthProvider";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  FormSectionSkeleton,
  Input,
  MetricValue,
  RefreshIndicator,
  StatCardSkeleton,
  TableSkeleton,
  Textarea,
} from "@/components/ui";
import { useCachedQuery } from "@/hooks/useCachedQuery";
import { api } from "@/lib/api";

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
  templates: {
    total: number;
    ready: number;
    blocked: number;
    disabled: number;
    deprecated: number;
    event_table_present: boolean;
    audit: {
      total_events: number;
      last_24h_total: number;
      last_24h_failed: number;
      last_event_at: string | null;
      last_failure:
        | {
            template_key: string;
            template_name: string | null;
            template_language: string | null;
            error_code: string | null;
            error_title: string | null;
            created_at: string;
          }
        | null;
    };
    items: Array<{
      key: string;
      displayName: string;
      category: "payment_reminder" | "order_followup" | "restock_reengagement";
      enabled: boolean;
      deprecated: boolean;
      readiness: TemplateReadiness;
    }>;
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

type TemplateParam = {
  key: string;
  label: string;
  required: boolean;
};

type TemplateReadiness = {
  key: string;
  can_send: boolean;
  available: boolean;
  status: "ready" | "unmapped" | "disabled" | "language_missing" | "invalid";
  status_label: string;
  reason_code: string | null;
  meta_template_name: string | null;
  language_code: string | null;
  enabled: boolean;
  display_name: string | null;
  description: string | null;
  allowed_languages: string[];
  deprecated: boolean;
  sort_order: number | null;
  is_mapped: boolean;
  has_language: boolean;
  language_allowed: boolean;
  blockers: string[];
  warnings: string[];
};

type WhatsAppTemplateConfig = {
  key: string;
  category: "payment_reminder" | "order_followup" | "restock_reengagement";
  displayName: string;
  description: string | null;
  enabled: boolean;
  allowedLanguages: string[];
  deprecated: boolean;
  sortOrder: number;
  metaTemplateName: string | null;
  languageCode: string | null;
  params: TemplateParam[];
  readiness: TemplateReadiness;
};

type SetupBootstrap = {
  settings: CompanySettings;
  runtime: RuntimeConfig;
  diagnostics: SetupDiagnostics;
  catalogDiagnostics: CatalogDiagnostics;
  templates: WhatsAppTemplateConfig[];
};

function formatTemplateCategory(category: WhatsAppTemplateConfig["category"]) {
  if (category === "payment_reminder") return "Payment reminder";
  if (category === "order_followup") return "Order follow-up";
  return "Restock / re-engagement";
}

function getTemplateTone(status: TemplateReadiness["status"]) {
  if (status === "ready") return "success" as const;
  if (status === "disabled") return "neutral" as const;
  return "warning" as const;
}

function getDraftTemplateReadiness(template: {
  key: string;
  displayName: string;
  description: string | null;
  enabled: boolean;
  allowedLanguages: string[];
  deprecated: boolean;
  sortOrder: number;
  metaTemplateName: string | null;
  languageCode: string | null;
  readiness: TemplateReadiness;
}): TemplateReadiness {
  const languageCode = String(template.languageCode ?? "").trim() || null;
  const allowedLanguages = Array.from(
    new Set(
      (template.allowedLanguages ?? [])
        .map((item) => String(item ?? "").trim())
        .filter(Boolean)
    )
  );
  const languageAllowed =
    !!languageCode &&
    (allowedLanguages.length === 0 || allowedLanguages.includes(languageCode));

  if (!template.enabled) {
    return {
      ...template.readiness,
      key: template.key,
      can_send: false,
      available: false,
      status: "disabled",
      status_label: "Template disabled",
      reason_code: "template_disabled",
      enabled: false,
      meta_template_name: template.metaTemplateName,
      language_code: languageCode,
      display_name: template.displayName,
      description: template.description,
      allowed_languages: allowedLanguages,
      deprecated: template.deprecated,
      sort_order: template.sortOrder,
      is_mapped: !!String(template.metaTemplateName ?? "").trim(),
      has_language: !!languageCode,
      language_allowed: languageAllowed,
      blockers: ["template_disabled"],
      warnings: template.deprecated ? ["template_deprecated"] : [],
    };
  }

  if (!String(template.metaTemplateName ?? "").trim()) {
    return {
      ...template.readiness,
      key: template.key,
      can_send: false,
      available: false,
      status: "unmapped",
      status_label: "Template not configured",
      reason_code: "template_config_missing",
      enabled: true,
      meta_template_name: null,
      language_code: languageCode,
      display_name: template.displayName,
      description: template.description,
      allowed_languages: allowedLanguages,
      deprecated: template.deprecated,
      sort_order: template.sortOrder,
      is_mapped: false,
      has_language: !!languageCode,
      language_allowed: languageAllowed,
      blockers: ["template_config_missing"],
      warnings: template.deprecated ? ["template_deprecated"] : [],
    };
  }

  if (!languageCode) {
    return {
      ...template.readiness,
      key: template.key,
      can_send: false,
      available: false,
      status: "language_missing",
      status_label: "Template language missing",
      reason_code: "template_language_unavailable",
      enabled: true,
      meta_template_name: template.metaTemplateName,
      language_code: null,
      display_name: template.displayName,
      description: template.description,
      allowed_languages: allowedLanguages,
      deprecated: template.deprecated,
      sort_order: template.sortOrder,
      is_mapped: true,
      has_language: false,
      language_allowed: false,
      blockers: ["template_language_unavailable"],
      warnings: template.deprecated ? ["template_deprecated"] : [],
    };
  }

  if (!languageAllowed) {
    return {
      ...template.readiness,
      key: template.key,
      can_send: false,
      available: false,
      status: "invalid",
      status_label: "Configured language is not allowed",
      reason_code: "template_language_not_allowed",
      enabled: true,
      meta_template_name: template.metaTemplateName,
      language_code: languageCode,
      display_name: template.displayName,
      description: template.description,
      allowed_languages: allowedLanguages,
      deprecated: template.deprecated,
      sort_order: template.sortOrder,
      is_mapped: true,
      has_language: true,
      language_allowed: false,
      blockers: ["template_language_not_allowed"],
      warnings: template.deprecated ? ["template_deprecated"] : [],
    };
  }

  return {
    ...template.readiness,
    key: template.key,
    can_send: true,
    available: true,
    status: "ready",
    status_label: "Ready to send",
    reason_code: null,
    enabled: true,
    meta_template_name: template.metaTemplateName,
    language_code: languageCode,
    display_name: template.displayName,
    description: template.description,
    allowed_languages: allowedLanguages,
    deprecated: template.deprecated,
    sort_order: template.sortOrder,
    is_mapped: true,
    has_language: true,
    language_allowed: true,
    blockers: [],
    warnings: template.deprecated ? ["template_deprecated"] : [],
  };
}

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
  const [templateConfigs, setTemplateConfigs] = useState<WhatsAppTemplateConfig[]>([]);
  const [savingTemplates, setSavingTemplates] = useState(false);
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
      const [s, r, d, cd, t] = await Promise.all([
        api<{ ok: true; settings: CompanySettings }>("/api/company/settings"),
        api<{ ok: true; config: RuntimeConfig }>("/api/company/runtime-config"),
        api<{ ok: true; diagnostics: SetupDiagnostics }>("/api/setup/diagnostics"),
        api<{ ok: true; diagnostics: CatalogDiagnostics }>("/api/setup/catalog-diagnostics"),
        api<{ ok: true; templates: WhatsAppTemplateConfig[] }>("/api/company/whatsapp-templates"),
      ]);

      return {
        settings: s.settings,
        runtime: r.config,
        diagnostics: d.diagnostics,
        catalogDiagnostics: cd.diagnostics,
        templates: t.templates,
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
    setTemplateConfigs(bootstrap.templates);
    setBootstrapped(true);
  }, [bootstrap, bootstrapped, user]);

  useEffect(() => {
    if (!bootstrapError) return;
    setError(bootstrapError.message ?? "Failed to load setup data.");
  }, [bootstrapError]);

  useEffect(() => {
    if (!bootstrap?.templates) return;
    setTemplateConfigs(bootstrap.templates);
  }, [bootstrap?.templates]);

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
          welcome_intro: settings.business_content?.welcome_intro || {},
          pickup_info: settings.business_content?.pickup_info || {},
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
      setOkMsg("Setup settings saved.");
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
      const res = await api<{ ok: true; settings: CompanySettings }>("/api/setup/complete", { method: "POST" });
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
      const res = await api<{ ok: true; stats: ReconcileStats }>("/api/setup/reconcile-contacts", { method: "POST" });
      setReconcileStats(res.stats);
      setOkMsg("Contact reconciliation completed.");
      const d = await api<{ ok: true; diagnostics: SetupDiagnostics }>("/api/setup/diagnostics");
      setDiag(d.diagnostics);
      if (bootstrap) {
        mutateBootstrap((current) => ({ ...(current ?? bootstrap), diagnostics: d.diagnostics }));
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to reconcile contacts.");
    } finally {
      setReconciling(false);
    }
  }

  async function saveTemplateMappings() {
    setSavingTemplates(true);
    setError(null);
    setOkMsg(null);
    try {
      const res = await api<{ ok: true; templates: WhatsAppTemplateConfig[] }>(
        "/api/company/whatsapp-templates",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templates: templateConfigs.map((template) => ({
              key: template.key,
              category: template.category,
              displayName: template.displayName,
              description: template.description || null,
              enabled: template.enabled,
              allowedLanguages: template.allowedLanguages,
              deprecated: template.deprecated,
              sortOrder: template.sortOrder,
              metaTemplateName: template.metaTemplateName || null,
              languageCode: template.languageCode || null,
              params: template.params,
            })),
          }),
        }
      );
      setTemplateConfigs(res.templates);
      if (bootstrap) {
        mutateBootstrap((current) => ({
          ...(current ?? bootstrap),
          templates: res.templates,
        }));
      }
      setOkMsg("Template mappings saved.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save template mappings.");
    } finally {
      setSavingTemplates(false);
    }
  }

  function updateTemplateConfig(
    key: string,
    patch: Partial<
      Pick<
        WhatsAppTemplateConfig,
        | "displayName"
        | "description"
        | "enabled"
        | "allowedLanguages"
        | "deprecated"
        | "sortOrder"
        | "metaTemplateName"
        | "languageCode"
      >
    >
  ) {
    setTemplateConfigs((current) =>
      current.map((template) =>
        template.key === key
          ? (() => {
              const nextTemplate = {
                ...template,
                ...patch,
              };
              return {
                ...nextTemplate,
                readiness: getDraftTemplateReadiness(nextTemplate),
              };
            })()
          : template
      )
    );
  }

  const blockingIssueCount = diag?.issues.filter((issue) => issue.level === "error").length ?? 0;
  const missingRequiredCount = diag?.setup.missing_required.length ?? 0;
  const paymentMethodCount = settings.business_content?.payment_methods?.filter(
    (item) => item.id.trim() && item.label.trim() && item.value.trim()
  ).length ?? 0;
  const readyTemplateCount = templateConfigs.filter(
    (item) => getDraftTemplateReadiness(item).status === "ready"
  ).length;
  const blockedTemplateCount = diag?.templates.blocked ?? 0;
  const setupReadinessScore = Math.max(0, 4 - Math.min(4, missingRequiredCount + blockingIssueCount));
  const setupProgressPercent = `${(setupReadinessScore / 4) * 100}%`;

  if (!user) return null;
  if (user.role !== "admin") {
    return (
      <EmptyState
        eyebrow="Setup"
        title="Only administrators can manage setup."
        description="Use an administrator account to manage WhatsApp configuration, diagnostics, and business runtime settings."
      />
    );
  }

  if (loading && !bootstrapped) {
    return (
      <div className="ui-skeleton-stack">
        <div className="config-stat-grid">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>
        <Card padding="lg">
          <FormSectionSkeleton />
        </Card>
        <Card padding="lg">
          <TableSkeleton rows={5} />
        </Card>
      </div>
    );
  }

  const issueTone = blockingIssueCount > 0 ? "danger" : missingRequiredCount > 0 ? "warning" : "success";

  return (
    <div className="config-page">
      <PageHeader
        eyebrow="Setup"
        section="Guided configuration"
        title="Workspace Setup Center"
        description="Configure business identity, WhatsApp connection, payment rails, diagnostics, and runtime references from one guided operations surface."
        actions={
          <div className="config-header-meta">
            <Badge tone={settings.is_setup_complete ? "success" : "warning"}>
              {settings.is_setup_complete ? "Complete" : "In progress"}
            </Badge>
            {isRefreshing ? <RefreshIndicator label="Refreshing setup" /> : null}
          </div>
        }
      />

      <div className="config-overview-grid">
        <Card padding="lg" className="config-section-card">
          <div className="config-section-head">
            <div>
              <div className="config-section-eyebrow">Readiness</div>
              <h2 className="config-hero-title">A calmer setup flow for launch-critical configuration.</h2>
              <p className="config-lead">
                Move through connection details, operational copy, runtime references, and diagnostics without losing sight of what is complete and what still needs attention.
              </p>
            </div>
          </div>

          <div className="config-progress">
            <div className="config-progress-bar" style={{ ["--config-progress" as string]: setupProgressPercent }}>
              <span />
            </div>
            <div className="config-progress-meta">
              {setupReadinessScore}/4 readiness signals are clear. Finalize only after test send and diagnostics pass.
            </div>
          </div>

          <div className="config-stat-grid">
            <div className="config-stat-card">
              <span className="config-stat-label">Blocking issues</span>
              <div className="config-stat-value"><MetricValue value={blockingIssueCount} refreshing={isRefreshing} width="4ch" /></div>
              <div className="config-stat-meta">Errors currently reported by diagnostics.</div>
            </div>
            <div className="config-stat-card">
              <span className="config-stat-label">Missing required</span>
              <div className="config-stat-value"><MetricValue value={missingRequiredCount} refreshing={isRefreshing} width="4ch" /></div>
              <div className="config-stat-meta">Required WhatsApp values still not configured.</div>
            </div>
            <div className="config-stat-card">
              <span className="config-stat-label">Payment rails</span>
              <div className="config-stat-value"><MetricValue value={paymentMethodCount} refreshing={isRefreshing} width="4ch" /></div>
              <div className="config-stat-meta">Operator-facing payment instructions currently configured.</div>
            </div>
            <div className="config-stat-card">
              <span className="config-stat-label">Template blockers</span>
              <div className="config-stat-value"><MetricValue value={blockedTemplateCount} refreshing={isRefreshing} width="4ch" /></div>
              <div className="config-stat-meta">Template mappings that still cannot send.</div>
            </div>
          </div>
        </Card>

        <Card tone="muted" padding="lg" className="config-section-card">
          <div>
            <div className="config-section-eyebrow">Guided map</div>
            <h3 className="config-section-title">Move through setup in order</h3>
          </div>
          <div className="config-nav">
            <a className="config-nav__item" href="#connection">
              <div><div className="config-nav__label">1. Connection and business content</div><div className="config-nav__meta">Company identity, WhatsApp credentials, support rails, and operator copy.</div></div>
              <Badge tone="accent">Configure</Badge>
            </a>
            <a className="config-nav__item" href="#template-mappings">
              <div><div className="config-nav__label">2. Template mappings</div><div className="config-nav__meta">Map internal inbox templates to approved WhatsApp template names and exact language codes.</div></div>
              <Badge tone="neutral">Review</Badge>
            </a>
            <a className="config-nav__item" href="#runtime">
              <div><div className="config-nav__label">3. Runtime references</div><div className="config-nav__meta">Read-only delivery and payment values currently driven by runtime config.</div></div>
              <Badge tone="neutral">Review</Badge>
            </a>
            <a className="config-nav__item" href="#verification">
              <div><div className="config-nav__label">4. Diagnostics and final checks</div><div className="config-nav__meta">Test send, inbox checks, contact reconciliation, and catalog health.</div></div>
              <Badge tone={issueTone}>{blockingIssueCount > 0 ? "Action needed" : "On track"}</Badge>
            </a>
          </div>
        </Card>
      </div>

      {error ? <Alert tone="danger" title="Setup issue" description={error} /> : null}
      {okMsg ? <Alert tone="success" title="Setup updated" description={okMsg} /> : null}

      <form onSubmit={saveSettings} id="connection">
        <Card padding="lg" className="config-section-card">
          <div className="config-section-head">
            <div>
              <div className="config-section-eyebrow">Step 1</div>
              <h3 className="config-section-title">Connection and business content</h3>
              <p className="config-section-description">Keep WhatsApp credentials, business-facing copy, and payment instructions together in one setup section.</p>
            </div>
            <div className="config-actions"><Button type="submit" loading={saving}>Save setup settings</Button></div>
          </div>

          <div className="config-form-grid">
            <div className="config-field"><label className="config-field-label">Company name</label><Input value={settings.company_name ?? ""} onChange={(e) => setSettings((s) => ({ ...s, company_name: e.target.value }))} /></div>
            <div className="config-field"><label className="config-field-label">WhatsApp access token</label><Input type="password" value={settings.whatsapp_token ?? ""} onChange={(e) => setSettings((s) => ({ ...s, whatsapp_token: e.target.value }))} /></div>
            <div className="config-field"><label className="config-field-label">Phone Number ID</label><Input value={settings.phone_number_id ?? ""} onChange={(e) => setSettings((s) => ({ ...s, phone_number_id: e.target.value }))} /></div>
            <div className="config-field"><label className="config-field-label">WABA ID</label><Input value={settings.waba_id ?? ""} onChange={(e) => setSettings((s) => ({ ...s, waba_id: e.target.value }))} /></div>
            <div className="config-field"><label className="config-field-label">Verify token</label><Input value={settings.verify_token ?? ""} onChange={(e) => setSettings((s) => ({ ...s, verify_token: e.target.value }))} /></div>
            <div className="config-field"><label className="config-field-label">App secret</label><Input type="password" value={settings.app_secret ?? ""} onChange={(e) => setSettings((s) => ({ ...s, app_secret: e.target.value }))} /></div>
            <div className="config-field"><label className="config-field-label">App ID</label><Input value={settings.app_id ?? ""} onChange={(e) => setSettings((s) => ({ ...s, app_id: e.target.value }))} /></div>
            <div className="config-field"><label className="config-field-label">Graph API version</label><Input value={settings.graph_api_version ?? "v19.0"} onChange={(e) => setSettings((s) => ({ ...s, graph_api_version: e.target.value }))} /></div>
          </div>

          <Card tone="muted" padding="lg" className="config-section-card">
            <div>
              <div className="config-section-eyebrow">Business content</div>
              <h4 className="config-section-title">Operator-facing copy and support rails</h4>
            </div>
            <div className="config-form-grid">
              <div className="config-field"><label className="config-field-label">Welcome intro (Swahili)</label><Textarea value={settings.business_content?.welcome_intro?.sw ?? ""} onChange={(e) => setSettings((s) => ({ ...s, business_content: { ...s.business_content, welcome_intro: { ...s.business_content.welcome_intro, sw: e.target.value } } }))} /></div>
              <div className="config-field"><label className="config-field-label">Welcome intro (English)</label><Textarea value={settings.business_content?.welcome_intro?.en ?? ""} onChange={(e) => setSettings((s) => ({ ...s, business_content: { ...s.business_content, welcome_intro: { ...s.business_content.welcome_intro, en: e.target.value } } }))} /></div>
              <div className="config-field"><label className="config-field-label">Pickup or office info (Swahili)</label><Textarea value={settings.business_content?.pickup_info?.sw ?? ""} onChange={(e) => setSettings((s) => ({ ...s, business_content: { ...s.business_content, pickup_info: { ...s.business_content.pickup_info, sw: e.target.value } } }))} /></div>
              <div className="config-field"><label className="config-field-label">Pickup or office info (English)</label><Textarea value={settings.business_content?.pickup_info?.en ?? ""} onChange={(e) => setSettings((s) => ({ ...s, business_content: { ...s.business_content, pickup_info: { ...s.business_content.pickup_info, en: e.target.value } } }))} /></div>
              <div className="config-field"><label className="config-field-label">Support phone</label><Input value={settings.business_content?.support_phone ?? ""} onChange={(e) => setSettings((s) => ({ ...s, business_content: { ...s.business_content, support_phone: e.target.value } }))} /></div>
              <div className="config-field"><label className="config-field-label">Support email</label><Input value={settings.business_content?.support_email ?? ""} onChange={(e) => setSettings((s) => ({ ...s, business_content: { ...s.business_content, support_email: e.target.value } }))} /></div>
            </div>

            <div className="config-card-stack">
              <div><div className="config-list-label">Payment methods</div><div className="config-field-hint">Keep operator payment rails consistent with the current automation flow.</div></div>
              {(settings.business_content?.payment_methods || []).map((item, index) => (
                <div key={item.id || index} className="config-form-grid">
                  <div className="config-field"><Input placeholder="ID" value={item.id} onChange={(e) => setSettings((s) => ({ ...s, business_content: { ...s.business_content, payment_methods: s.business_content.payment_methods.map((row, rowIndex) => rowIndex === index ? { ...row, id: e.target.value } : row) } }))} /></div>
                  <div className="config-field"><Input placeholder="Label" value={item.label} onChange={(e) => setSettings((s) => ({ ...s, business_content: { ...s.business_content, payment_methods: s.business_content.payment_methods.map((row, rowIndex) => rowIndex === index ? { ...row, label: e.target.value } : row) } }))} /></div>
                  <div className="config-field"><Input placeholder="Number or account" value={item.value} onChange={(e) => setSettings((s) => ({ ...s, business_content: { ...s.business_content, payment_methods: s.business_content.payment_methods.map((row, rowIndex) => rowIndex === index ? { ...row, value: e.target.value } : row) } }))} /></div>
                </div>
              ))}
            </div>

            <label className="config-checkbox">
              <input type="checkbox" checked={!!settings.catalog_enabled} onChange={(e) => setSettings((s) => ({ ...s, catalog_enabled: e.target.checked }))} />
              <span>Enable WhatsApp Catalog features for this workspace.</span>
            </label>
          </Card>

          <Card tone="muted" padding="lg" className="config-section-card">
            <div className="config-section-head">
              <div><div className="config-section-eyebrow">Verification</div><h4 className="config-section-title">Test message flow</h4></div>
              <div className="config-actions"><Button type="button" variant="secondary" loading={testing} onClick={() => void runTestSend()} disabled={!testTo.trim() || !testText.trim()}>Send test message</Button></div>
            </div>
            <div className="config-form-grid">
              <div className="config-field"><label className="config-field-label">Recipient phone</label><Input placeholder="E.164 or wa_id" value={testTo} onChange={(e) => setTestTo(e.target.value)} /></div>
              <div className="config-field"><label className="config-field-label">Test message</label><Input value={testText} onChange={(e) => setTestText(e.target.value)} /></div>
            </div>
          </Card>
        </Card>
      </form>

      <Card padding="lg" className="config-section-card" id="template-mappings">
        <div className="config-section-head">
          <div>
            <div className="config-section-eyebrow">Step 2</div>
            <h3 className="config-section-title">WhatsApp template mappings</h3>
            <p className="config-section-description">
              Operators only see template send actions when these internal keys are mapped to real approved WhatsApp template names and exact language codes.
            </p>
          </div>
          <div className="config-actions">
            <Badge tone={readyTemplateCount === templateConfigs.length && templateConfigs.length > 0 ? "success" : "warning"}>
              {readyTemplateCount}/{templateConfigs.length} ready
            </Badge>
            <Button type="button" loading={savingTemplates} onClick={() => void saveTemplateMappings()}>
              Save template mappings
            </Button>
          </div>
        </div>

        <div className="config-card-stack">
          {templateConfigs.map((template) => {
            const draftReadiness = getDraftTemplateReadiness(template);
            return (
            <Card key={template.key} tone="muted" padding="lg" className="config-section-card">
              <div className="config-section-head">
                <div>
                  <div className="config-list-label">{template.displayName || formatTemplateCategory(template.category)}</div>
                  <div className="config-list-copy">{template.key}</div>
                </div>
                <Badge tone={getTemplateTone(draftReadiness.status)}>
                  {draftReadiness.status_label}
                </Badge>
              </div>

              <div className="config-form-grid">
                <div className="config-field">
                  <label className="config-field-label">Internal key</label>
                  <Input value={template.key} disabled />
                </div>
                <div className="config-field">
                  <label className="config-field-label">Category</label>
                  <Input value={formatTemplateCategory(template.category)} disabled />
                </div>
                <div className="config-field">
                  <label className="config-field-label">Display name</label>
                  <Input
                    value={template.displayName ?? ""}
                    placeholder={formatTemplateCategory(template.category)}
                    onChange={(e) =>
                      updateTemplateConfig(template.key, {
                        displayName: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="config-field">
                  <label className="config-field-label">Meta template name</label>
                  <Input
                    value={template.metaTemplateName ?? ""}
                    placeholder="approved Meta template name"
                    onChange={(e) =>
                      updateTemplateConfig(template.key, {
                        metaTemplateName: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="config-field">
                  <label className="config-field-label">Language code</label>
                  <Input
                    value={template.languageCode ?? ""}
                    placeholder="sw"
                    onChange={(e) =>
                      updateTemplateConfig(template.key, {
                        languageCode: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="config-field">
                  <label className="config-field-label">Allowed languages</label>
                  <Input
                    value={(template.allowedLanguages ?? []).join(", ")}
                    placeholder="sw, en"
                    onChange={(e) =>
                      updateTemplateConfig(template.key, {
                        allowedLanguages: e.target.value
                          .split(",")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </div>
                <div className="config-field">
                  <label className="config-field-label">Sort order</label>
                  <Input
                    type="number"
                    value={String(template.sortOrder ?? 0)}
                    onChange={(e) =>
                      updateTemplateConfig(template.key, {
                        sortOrder: Number(e.target.value || 0),
                      })
                    }
                  />
                </div>
                <div className="config-field" style={{ gridColumn: "1 / -1" }}>
                  <label className="config-field-label">Description</label>
                  <Textarea
                    value={template.description ?? ""}
                    onChange={(e) =>
                      updateTemplateConfig(template.key, {
                        description: e.target.value,
                      })
                    }
                  />
                </div>
              </div>

              <div className="config-list">
                <div className="config-list-item">
                  <div className="config-list-item__copy">
                    <div className="config-list-title">Required variables</div>
                    <div className="config-list-copy">
                      {template.params.map((item) => `${item.label} (${item.key})${item.required ? "" : " optional"}`).join(" | ")}
                    </div>
                  </div>
                  <label className="config-checkbox">
                    <input
                      type="checkbox"
                      checked={template.enabled}
                      onChange={(e) =>
                        updateTemplateConfig(template.key, {
                          enabled: e.target.checked,
                        })
                      }
                    />
                    <span>Enabled</span>
                  </label>
                </div>
                <div className="config-list-item">
                  <div className="config-list-item__copy">
                    <div className="config-list-title">Diagnostics</div>
                    <div className="config-list-copy">
                      {draftReadiness.blockers.length > 0
                        ? draftReadiness.blockers.join(", ")
                        : "No blocking config issues detected."}
                      {draftReadiness.warnings.length > 0 ? ` Warnings: ${draftReadiness.warnings.join(", ")}.` : ""}
                    </div>
                  </div>
                  <label className="config-checkbox">
                    <input
                      type="checkbox"
                      checked={template.deprecated}
                      onChange={(e) =>
                        updateTemplateConfig(template.key, {
                          deprecated: e.target.checked,
                        })
                      }
                    />
                    <span>Deprecated</span>
                  </label>
                </div>
              </div>
            </Card>
            );
          })}
        </div>
      </Card>

      <div className="config-detail-grid" id="runtime">
        <Card padding="lg" className="config-section-card">
          <div><div className="config-section-eyebrow">Step 3</div><h3 className="config-section-title">Runtime references</h3><p className="config-section-description">These values are currently runtime-driven so operators can verify delivery and payment assumptions from one place.</p></div>
          {runtime ? (
            <div className="config-runtime-grid">
              <div className="config-runtime-item"><span className="config-list-label">Delivery base</span><div className="config-runtime-item__value">{runtime.delivery.base_lat}, {runtime.delivery.base_lng}</div></div>
              <div className="config-runtime-item"><span className="config-list-label">Service radius</span><div className="config-runtime-item__value">{runtime.delivery.service_radius_km} km</div></div>
              <div className="config-runtime-item"><span className="config-list-label">Location pin required</span><div className="config-runtime-item__value">{runtime.delivery.require_location_pin ? "Yes" : "No"}</div></div>
              <div className="config-runtime-item"><span className="config-list-label">Rate per km</span><div className="config-runtime-item__value">{runtime.delivery.rate_per_km}</div></div>
              <div className="config-runtime-item"><span className="config-list-label">Round to</span><div className="config-runtime-item__value">{runtime.delivery.round_to}</div></div>
              <div className="config-runtime-item"><span className="config-list-label">Default distance</span><div className="config-runtime-item__value">{runtime.delivery.default_distance_km} km</div></div>
            </div>
          ) : <div className="config-empty">No runtime config data is available.</div>}
        </Card>

        <Card tone="muted" padding="lg" className="config-section-card">
          <div><div className="config-section-eyebrow">Payment references</div><h3 className="config-section-title">Runtime payment rails</h3></div>
          {runtime ? (
            <div className="config-list">
              <div className="config-list-item"><div className="config-list-item__copy"><div className="config-list-title">Lipa Namba</div><div className="config-list-copy">{runtime.payment.lipa_namba_name || "Not set"}</div></div><Badge tone="neutral">{runtime.payment.lipa_namba_till || "-"}</Badge></div>
              <div className="config-list-item"><div className="config-list-item__copy"><div className="config-list-title">Vodacom LNM</div><div className="config-list-copy">{runtime.payment.voda_lnm_name || "Not set"}</div></div><Badge tone="neutral">{runtime.payment.voda_lnm_till || "-"}</Badge></div>
              <div className="config-list-item"><div className="config-list-item__copy"><div className="config-list-title">Vodacom P2P</div><div className="config-list-copy">{runtime.payment.voda_p2p_name || "Not set"}</div></div><Badge tone="neutral">{runtime.payment.voda_p2p_msisdn || "-"}</Badge></div>
            </div>
          ) : <div className="config-empty">No runtime payment references are available.</div>}
        </Card>
      </div>

      <div className="config-detail-grid" id="verification">
        <Card padding="lg" className="config-section-card">
          <div className="config-section-head">
            <div><div className="config-section-eyebrow">Step 4</div><h3 className="config-section-title">Diagnostics and verification</h3><p className="config-section-description">Confirm inbox, graph connection, and contact hygiene before you finalize setup.</p></div>
            <div className="config-actions">
              <Button type="button" variant="secondary" loading={reconciling} onClick={() => void runReconcile()}>Reconcile contacts</Button>
              <Button type="button" variant="secondary" loading={checking} onClick={() => void runDiagnostics()}>Refresh checks</Button>
            </div>
          </div>
          {reconcileStats ? <Alert tone="info" title="Last reconcile result" description={`Groups merged: ${reconcileStats.groups_merged}. Customers merged: ${reconcileStats.customers_merged}. Conversations merged: ${reconcileStats.conversations_merged}. Messages moved: ${reconcileStats.messages_moved}.`} /> : null}
          {diag ? (
            <div className="config-list">
              <div className="config-list-item"><div className="config-list-item__copy"><div className="config-list-title">Inbox activity</div><div className="config-list-copy">Conversations: {diag.inbox.conversations}. Messages: {diag.inbox.messages_total} (in {diag.inbox.messages_inbound}, out {diag.inbox.messages_outbound}).</div></div><Badge tone="neutral">{diag.inbox.last_inbound ? `${diag.inbox.last_inbound.age_minutes ?? 0} min` : "No inbound"}</Badge></div>
              <div className="config-list-item"><div className="config-list-item__copy"><div className="config-list-title">Graph phone check</div><div className="config-list-copy">Configured phone number ID: {diag.setup.configured_phone_number_id || "-"}</div></div><Badge tone={diag.graph.phone_summary ? "success" : "warning"}>{diag.graph.phone_summary ? "Reachable" : "Not reachable"}</Badge></div>
              <div className="config-list-item"><div className="config-list-item__copy"><div className="config-list-title">Template readiness</div><div className="config-list-copy">{diag.templates.ready}/{diag.templates.total} ready, {diag.templates.blocked} blocked, {diag.templates.disabled} disabled.</div></div><Badge tone={diag.templates.blocked > 0 ? "warning" : "success"}>{diag.templates.event_table_present ? "Audited" : "No audit table"}</Badge></div>
              <div className="config-list-item"><div className="config-list-item__copy"><div className="config-list-title">Template audit volume</div><div className="config-list-copy">Total events: {diag.templates.audit.total_events}. Last 24h: {diag.templates.audit.last_24h_total}. Failures in last 24h: {diag.templates.audit.last_24h_failed}.</div></div><Badge tone="neutral">{diag.templates.audit.last_event_at ? new Date(diag.templates.audit.last_event_at).toLocaleString() : "No events"}</Badge></div>
              {diag.setup.missing_required.length > 0 ? <Alert tone="warning" title="Missing required values" description={diag.setup.missing_required.join(", ")} /> : null}
              {diag.templates.audit.last_failure ? <Alert tone="warning" title="Latest template failure" description={`${diag.templates.audit.last_failure.template_key}: ${diag.templates.audit.last_failure.error_title || diag.templates.audit.last_failure.error_code || "Unknown failure"}`} /> : null}
              {diag.issues.length > 0 ? diag.issues.map((issue) => <Alert key={issue.code} tone={issue.level === "error" ? "danger" : "warning"} title={issue.code} description={issue.message} />) : <Alert tone="success" title="No blocking issues detected" description="Diagnostics currently report a healthy setup state." />}
            </div>
          ) : <div className="config-empty">No diagnostics available yet.</div>}
        </Card>

        <Card tone="muted" padding="lg" className="config-section-card">
          <div className="config-section-head">
            <div><div className="config-section-eyebrow">Finalization</div><h3 className="config-section-title">Mark setup complete when checks are clear</h3></div>
            <div className="config-actions"><Button type="button" loading={completing} onClick={() => void completeSetup()}>Mark setup complete</Button></div>
          </div>
          <div className="config-list">
            <div className="config-list-item"><div className="config-list-item__copy"><div className="config-list-title">Setup status</div><div className="config-list-copy">Only finalize after test send, webhook verification, and diagnostics checks pass.</div></div><Badge tone={settings.is_setup_complete ? "success" : "warning"}>{settings.is_setup_complete ? "Complete" : "Incomplete"}</Badge></div>
            {catalogDiag ? <div className="config-list-item"><div className="config-list-item__copy"><div className="config-list-title">Catalog health</div><div className="config-list-copy">Connected catalog ID: {catalogDiag.connected_catalog_id || "-"}</div></div><Badge tone={catalogDiag.healthy ? "success" : settings.catalog_enabled ? "warning" : "neutral"}>{catalogDiag.healthy ? "Healthy" : settings.catalog_enabled ? "Needs attention" : "Disabled"}</Badge></div> : null}
            {catalogDiag?.issues.map((issue) => <Alert key={issue.code} tone={issue.level === "error" ? "danger" : "warning"} title={issue.code} description={issue.message} />)}
          </div>
        </Card>
      </div>
    </div>
  );
}
