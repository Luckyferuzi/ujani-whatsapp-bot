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

type SupportedLang = "sw" | "en";

export type LocalizedBusinessText = Partial<Record<SupportedLang, string>>;

export type PaymentMethodConfig = {
  id: string;
  label: string;
  value: string;
};

export type BusinessTextOverrideKey =
  | "faq.intro"
  | "order.preparing_message"
  | "order.out_for_delivery_message"
  | "order.delivered_message"
  | "proof.ask"
  | "payment.none";

export type BusinessContentSettings = {
  welcome_intro: LocalizedBusinessText;
  pickup_info: LocalizedBusinessText;
  support_phone: string | null;
  support_email: string | null;
  payment_methods: PaymentMethodConfig[];
  text_overrides: Partial<Record<BusinessTextOverrideKey, LocalizedBusinessText>>;
};

export const DEFAULT_BUSINESS_CONTENT: BusinessContentSettings = {
  welcome_intro: {},
  pickup_info: {
    sw: "Tupo Keko Modern Furniture, mkabala na Omax Bar. Wasiliana nasi kwa maelezo zaidi.",
    en: "We are at Keko Modern Furniture, opposite Omax Bar. Contact us for more details.",
  },
  support_phone: null,
  support_email: null,
  payment_methods: [],
  text_overrides: {},
};

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

  business_content: BusinessContentSettings;

  is_setup_complete: boolean;
};

export const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  company_name: "Ujani Herbals",
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

  business_content: DEFAULT_BUSINESS_CONTENT,

  is_setup_complete: false,
};

let cached: CompanySettings = { ...DEFAULT_COMPANY_SETTINGS };

export function getCompanySettingsCached(): CompanySettings {
  return cached;
}

function normalizeLocalizedText(
  value: LocalizedBusinessText | null | undefined
): LocalizedBusinessText {
  return {
    sw: String(value?.sw ?? "").trim(),
    en: String(value?.en ?? "").trim(),
  };
}

function normalizePaymentMethods(
  value: PaymentMethodConfig[] | null | undefined
): PaymentMethodConfig[] {
  return (value ?? [])
    .map((item, index) => ({
      id: String(item?.id ?? `PAY_CFG_${index + 1}`).trim(),
      label: String(item?.label ?? "").trim(),
      value: String(item?.value ?? "").trim(),
    }))
    .filter((item) => item.id && item.label && item.value);
}

export function getCompanyDisplayName(settings: CompanySettings = cached): string {
  return String(settings.company_name ?? "").trim() || "Ujani Herbals";
}

export function getBusinessContentSettings(
  settings: CompanySettings = cached
): BusinessContentSettings {
  const current = settings.business_content ?? DEFAULT_BUSINESS_CONTENT;
  const overrides = current.text_overrides ?? {};

  return {
    welcome_intro: normalizeLocalizedText(current.welcome_intro),
    pickup_info: normalizeLocalizedText(current.pickup_info),
    support_phone: String(current.support_phone ?? "").trim() || null,
    support_email: String(current.support_email ?? "").trim() || null,
    payment_methods: normalizePaymentMethods(current.payment_methods),
    text_overrides: {
      "faq.intro": normalizeLocalizedText(overrides["faq.intro"]),
      "order.preparing_message": normalizeLocalizedText(
        overrides["order.preparing_message"]
      ),
      "order.out_for_delivery_message": normalizeLocalizedText(
        overrides["order.out_for_delivery_message"]
      ),
      "order.delivered_message": normalizeLocalizedText(
        overrides["order.delivered_message"]
      ),
      "proof.ask": normalizeLocalizedText(overrides["proof.ask"]),
      "payment.none": normalizeLocalizedText(overrides["payment.none"]),
    },
  };
}

export function resolveLocalizedBusinessText(
  value: LocalizedBusinessText | null | undefined,
  lang: SupportedLang,
  fallback = ""
): string {
  const normalized = normalizeLocalizedText(value);
  const exact = normalized[lang];
  if (exact) return exact;
  return normalized[lang === "sw" ? "en" : "sw"] || fallback;
}

export function getBusinessTextOverride(
  key: BusinessTextOverrideKey,
  lang: SupportedLang,
  settings: CompanySettings = cached
): string | null {
  const content = getBusinessContentSettings(settings);
  const value = resolveLocalizedBusinessText(content.text_overrides[key], lang, "");
  return value || null;
}

export function getBusinessIntroText(
  lang: SupportedLang,
  settings: CompanySettings = cached
): string | null {
  const content = getBusinessContentSettings(settings);
  const value = resolveLocalizedBusinessText(content.welcome_intro, lang, "");
  return value || null;
}

export function getPickupInfoText(
  lang: SupportedLang,
  settings: CompanySettings = cached
): string {
  const content = getBusinessContentSettings(settings);
  return resolveLocalizedBusinessText(
    content.pickup_info,
    lang,
    resolveLocalizedBusinessText(DEFAULT_BUSINESS_CONTENT.pickup_info, lang, "")
  );
}

export function getSupportContact(settings: CompanySettings = cached) {
  const content = getBusinessContentSettings(settings);
  return {
    phone: content.support_phone,
    email: content.support_email,
  };
}

export function getConfiguredPaymentMethods(
  settings: CompanySettings = cached,
  envSource: NodeJS.ProcessEnv = process.env
): PaymentMethodConfig[] {
  const content = getBusinessContentSettings(settings);
  if (content.payment_methods.length > 0) return content.payment_methods;

  const opts: PaymentMethodConfig[] = [];
  const mixxTill = envSource.LIPA_NAMBA_TILL;
  const mixxName = envSource.LIPA_NAMBA_NAME;
  if (mixxTill) {
    opts.push({
      id: "PAY_MIXX",
      label: "MIXXBYYAS LIPANAMB",
      value: mixxName ? `${mixxTill} • ${mixxName}` : mixxTill,
    });
  }

  const vodaTill = envSource.VODA_LNM_TILL;
  const vodaName = envSource.VODA_LNM_NAME;
  if (vodaTill) {
    opts.push({
      id: "PAY_VODA_LNM",
      label: "VODALIPANMBA",
      value: vodaName ? `${vodaTill} • ${vodaName}` : vodaTill,
    });
  }

  const vodaMsisdn = envSource.VODA_P2P_MSISDN;
  const vodaP2PName = envSource.VODA_P2P_NAME;
  if (vodaMsisdn) {
    opts.push({
      id: "PAY_VODA_P2P",
      label: "Voda P2P",
      value: vodaP2PName ? `${vodaMsisdn} • ${vodaP2PName}` : vodaMsisdn,
    });
  }

  for (let i = 1; i <= 5; i++) {
    const label = envSource[`PAYMENT_${i}_LABEL`];
    const value = envSource[`PAYMENT_${i}_NUMBER`];
    if (label && value) {
      opts.push({ id: `PAY_${i}`, label: String(label), value: String(value) });
    }
  }

  return opts;
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

  cached.company_name = getCompanyDisplayName(cached);
  cached.business_content = getBusinessContentSettings(cached);

  return cached;
}

export async function saveCompanySettings(next: CompanySettings): Promise<void> {
  // normalize
  if (!next.enabled_modules?.includes("inbox")) {
    next.enabled_modules = ["inbox", ...(next.enabled_modules ?? [])];
  }

  next.company_name = getCompanyDisplayName(next);
  next.business_content = getBusinessContentSettings(next);

  cached = next;
  await setJsonSetting("company_settings", next);
}
