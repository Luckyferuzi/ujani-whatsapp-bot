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
      params: [],
    };
  }

  const key = String(template.key ?? "").trim();
  const metaTemplateName = normalizeString(template.metaTemplateName);
  const languageCode = normalizeString(template.languageCode);
  const params = Array.isArray(template.params) ? template.params : [];

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
