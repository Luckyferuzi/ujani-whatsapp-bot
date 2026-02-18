// backend/src/runtime/companySettings.ts
//
// Runtime settings cache backed by app_settings (Postgres).
//
// Why:
// - The web Setup Wizard (web/app/setup) expects /api/company/settings to persist
//   WhatsApp credentials and basic company configuration.
// - src/whatsapp.ts needs synchronous access to WhatsApp token / phone_number_id
//   for webhooks and message sending, so we cache the latest settings in-memory.
//
// Notes:
// - This is currently single-tenant (one company per deployment).
// - For true multi-tenant "coexistence for many customers", we would move from
//   app_settings -> dedicated tables keyed by tenant_id.

import { getJsonSetting, setJsonSetting } from "../db/settings.js";


export type CompanySettings = {
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
  app_secret: string | null;
  app_id: string | null;
  graph_api_version: string | null;
  catalog_enabled: boolean;

  // Embedded Signup / Coexistence
  whatsapp_embedded_config_id: string | null;
  whatsapp_solution_id: string | null;
  coexistence_enabled: boolean;

  is_setup_complete: boolean;
};

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  company_name: "",
  logo_url: null,
  theme_color: null,

  enabled_modules: ["inbox"],

  enabled_languages: ["sw", "en"],
  default_language: "sw",

  working_hours: {},
  after_hours_message: {},

  whatsapp_token: null,
  phone_number_id: null,
  waba_id: null,
  verify_token: null,
  app_secret: null,
  app_id: null,
  graph_api_version: "v19.0",
  catalog_enabled: false,

  whatsapp_embedded_config_id: null,
  whatsapp_solution_id: null,
  coexistence_enabled: false,

  is_setup_complete: false,
};

let cached: CompanySettings = { ...DEFAULT_COMPANY_SETTINGS };

export function getCompanySettingsCached(): CompanySettings {
  return cached;
}

export function getVerifyTokenEffective(): string | null {
  return cached.verify_token || process.env.WEBHOOK_VERIFY_TOKEN || process.env.VERIFY_TOKEN || null;
}

export function getAppSecretEffective(): string | null {
  return cached.app_secret || (process.env.APP_SECRET ?? null);
}

export function getAppIdEffective(): string | null {
  return cached.app_id || (process.env.APP_ID ?? null);
}

export function getGraphApiVersionEffective(): string {
  return cached.graph_api_version || process.env.META_GRAPH_VERSION || process.env.GRAPH_API_VERSION || "v19.0";
}


export function getWhatsAppTokenEffective(): string | null {
  return cached.whatsapp_token || process.env.ACCESS_TOKEN || process.env.WHATSAPP_TOKEN || null;
}

export function getPhoneNumberIdEffective(): string | null {
  return cached.phone_number_id || process.env.PHONE_NUMBER_ID || null;
}

export function getWabaIdEffective(): string | null {
  return (
    cached.waba_id ||
    process.env.WABA_ID ||
    process.env.WHATSAPP_WABA_ID ||
    null
  );
}

export function getCatalogEnabledEffective(): boolean {
  const fromDb = cached.catalog_enabled;
  if (typeof fromDb === "boolean") return fromDb;

  const raw = String(process.env.CATALOG_ENABLED ?? "false").toLowerCase().trim();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

export function getEmbeddedConfigIdEffective(): string | null {
  return (
    cached.whatsapp_embedded_config_id ||
    (process.env.WHATSAPP_EMBEDDED_CONFIG_ID ?? null)
  );
}

export function getSolutionIdEffective(): string | null {
  return cached.whatsapp_solution_id || (process.env.WHATSAPP_SOLUTION_ID ?? null);
}

export async function loadCompanySettingsToCache(): Promise<CompanySettings> {
  cached = await getJsonSetting<CompanySettings>(
    "company_settings",
    DEFAULT_COMPANY_SETTINGS
  );

  // Always ensure inbox is present (the UI assumes it)
  if (!cached.enabled_modules?.includes("inbox")) {
    cached.enabled_modules = ["inbox", ...(cached.enabled_modules ?? [])];
  }

  return cached;
}

export async function saveCompanySettings(next: CompanySettings): Promise<void> {
  // normalize
  if (!next.enabled_modules?.includes("inbox")) {
    next.enabled_modules = ["inbox", ...(next.enabled_modules ?? [])];
  }

  cached = next;
  await setJsonSetting("company_settings", next);
}
