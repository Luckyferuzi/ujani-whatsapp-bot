import type {
  InboxTemplateConfig,
  TemplateParameterMeta,
} from "./companySettings.js";

export type InboxTemplateReadinessStatus =
  | "ready"
  | "unmapped"
  | "disabled"
  | "language_missing"
  | "invalid";

export type InboxTemplateReadiness = {
  key: string;
  can_send: boolean;
  available: boolean;
  status: InboxTemplateReadinessStatus;
  status_label: string;
  reason_code: string | null;
  meta_template_name: string | null;
  language_code: string | null;
  enabled: boolean;
  category: InboxTemplateConfig["category"] | null;
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
  params: TemplateParameterMeta[];
};

function normalizeString(value: unknown) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export function resolveInboxTemplateReadiness(
  template: InboxTemplateConfig | null | undefined
): InboxTemplateReadiness {
  if (!template) {
    return {
      key: "",
      can_send: false,
      available: false,
      status: "invalid",
      status_label: "Template unavailable",
      reason_code: "template_not_found",
      meta_template_name: null,
      language_code: null,
      enabled: false,
      category: null,
      display_name: null,
      description: null,
      allowed_languages: [],
      deprecated: false,
      sort_order: null,
      is_mapped: false,
      has_language: false,
      language_allowed: false,
      blockers: ["template_not_found"],
      warnings: [],
      params: [],
    };
  }

  const key = String(template.key ?? "").trim();
  const metaTemplateName = normalizeString(template.metaTemplateName);
  const languageCode = normalizeString(template.languageCode);
  const params = Array.isArray(template.params) ? template.params : [];
  const allowedLanguages = Array.isArray(template.allowedLanguages)
    ? template.allowedLanguages
        .map((item) => normalizeString(item))
        .filter((item): item is string => item != null)
    : [];
  const languageAllowed =
    !!languageCode &&
    (allowedLanguages.length === 0 || allowedLanguages.includes(languageCode));
  const warnings = template.deprecated === true ? ["template_deprecated"] : [];

  if (!key) {
    return {
      key: "",
      can_send: false,
      available: false,
      status: "invalid",
      status_label: "Template config invalid",
      reason_code: "template_config_missing",
      meta_template_name: metaTemplateName,
      language_code: languageCode,
      enabled: template.enabled !== false,
      category: template.category ?? null,
      display_name: normalizeString(template.displayName),
      description: normalizeString(template.description),
      allowed_languages: allowedLanguages,
      deprecated: template.deprecated === true,
      sort_order: Number.isFinite(template.sortOrder) ? template.sortOrder : null,
      is_mapped: !!metaTemplateName,
      has_language: !!languageCode,
      language_allowed: languageAllowed,
      blockers: ["template_config_missing"],
      warnings,
      params,
    };
  }

  if (template.enabled === false) {
    return {
      key,
      can_send: false,
      available: false,
      status: "disabled",
      status_label: "Template disabled",
      reason_code: "template_disabled",
      meta_template_name: metaTemplateName,
      language_code: languageCode,
      enabled: false,
      category: template.category,
      display_name: normalizeString(template.displayName),
      description: normalizeString(template.description),
      allowed_languages: allowedLanguages,
      deprecated: template.deprecated === true,
      sort_order: Number.isFinite(template.sortOrder) ? template.sortOrder : null,
      is_mapped: !!metaTemplateName,
      has_language: !!languageCode,
      language_allowed: languageAllowed,
      blockers: ["template_disabled"],
      warnings,
      params,
    };
  }

  if (!metaTemplateName) {
    return {
      key,
      can_send: false,
      available: false,
      status: "unmapped",
      status_label: "Template not configured",
      reason_code: "template_config_missing",
      meta_template_name: null,
      language_code: languageCode,
      enabled: true,
      category: template.category,
      display_name: normalizeString(template.displayName),
      description: normalizeString(template.description),
      allowed_languages: allowedLanguages,
      deprecated: template.deprecated === true,
      sort_order: Number.isFinite(template.sortOrder) ? template.sortOrder : null,
      is_mapped: false,
      has_language: !!languageCode,
      language_allowed: languageAllowed,
      blockers: ["template_config_missing"],
      warnings,
      params,
    };
  }

  if (!languageCode) {
    return {
      key,
      can_send: false,
      available: false,
      status: "language_missing",
      status_label: "Template language missing",
      reason_code: "template_language_unavailable",
      meta_template_name: metaTemplateName,
      language_code: null,
      enabled: true,
      category: template.category,
      display_name: normalizeString(template.displayName),
      description: normalizeString(template.description),
      allowed_languages: allowedLanguages,
      deprecated: template.deprecated === true,
      sort_order: Number.isFinite(template.sortOrder) ? template.sortOrder : null,
      is_mapped: true,
      has_language: false,
      language_allowed: false,
      blockers: ["template_language_unavailable"],
      warnings,
      params,
    };
  }

  if (!languageAllowed) {
    return {
      key,
      can_send: false,
      available: false,
      status: "invalid",
      status_label: "Configured language is not allowed",
      reason_code: "template_language_not_allowed",
      meta_template_name: metaTemplateName,
      language_code: languageCode,
      enabled: true,
      category: template.category,
      display_name: normalizeString(template.displayName),
      description: normalizeString(template.description),
      allowed_languages: allowedLanguages,
      deprecated: template.deprecated === true,
      sort_order: Number.isFinite(template.sortOrder) ? template.sortOrder : null,
      is_mapped: true,
      has_language: true,
      language_allowed: false,
      blockers: ["template_language_not_allowed"],
      warnings,
      params,
    };
  }

  return {
    key,
    can_send: true,
    available: true,
    status: "ready",
    status_label: "Ready to send",
    reason_code: null,
    meta_template_name: metaTemplateName,
    language_code: languageCode,
    enabled: true,
    category: template.category,
    display_name: normalizeString(template.displayName),
    description: normalizeString(template.description),
    allowed_languages: allowedLanguages,
    deprecated: template.deprecated === true,
    sort_order: Number.isFinite(template.sortOrder) ? template.sortOrder : null,
    is_mapped: true,
    has_language: true,
    language_allowed: true,
    blockers: [],
    warnings,
    params,
  };
}

export function indexInboxTemplateReadiness(
  templates: InboxTemplateConfig[]
): Map<string, InboxTemplateReadiness> {
  return new Map(
    templates.map((template) => {
      const readiness = resolveInboxTemplateReadiness(template);
      return [readiness.key, readiness];
    })
  );
}

export function listReadyInboxTemplates(templates: InboxTemplateConfig[]) {
  return templates
    .map((template) => ({
      template,
      readiness: resolveInboxTemplateReadiness(template),
    }))
    .filter((item) => item.readiness.can_send);
}
