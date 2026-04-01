// backend/src/routes/company.ts
//
// Implements the endpoints expected by web/app/setup/page.tsx:
//   GET  /api/company/settings
//   PUT  /api/company/settings
//   POST /api/setup/test-send
//   POST /api/setup/complete
//
// On WhatsApp credential save, we also fetch the WhatsApp Business Profile
// and store it in app_settings for quick UI display / debugging.

import { Router } from "express";
import { z } from "zod";
import { env } from "../config.js";
import {
  DEFAULT_INBOX_TEMPLATES,
  DEFAULT_COMPANY_SETTINGS,
  getBusinessContentSettings,
  getCatalogInitializedEffective,
  getConfiguredCatalogIdEffective,
  getWebhookCatalogIdEffective,
  getPhoneNumberIdEffective,
  getWabaIdEffective,
  getCatalogEnabledEffective,
  getCompanyDisplayName,
  getCompanySettingsCached,
  getInboxTemplateRegistry,
  loadCompanySettingsToCache,
  saveInboxTemplateRegistry,
  saveCompanySettings,
  setCompanyCatalogId,
  type InboxTemplateConfig,
} from "../runtime/companySettings.js";
import { resolveInboxTemplateReadiness } from "../runtime/inboxTemplateReadiness.js";
import {
  getBusinessProfile,
  getConnectedCatalogInfo,
  getPhoneNumberSummary,
  resolveCatalogId,
  sendText,
} from "../whatsapp.js";
import { setJsonSetting } from "../db/settings.js";
import {
  getOrCreateConversationForPhone,
  insertOutboundMessage,
  listProductCatalogLinksSummary,
  listWhatsAppPhoneNumbers,
  reconcileCustomersAndConversations,
  setDefaultWhatsAppPhoneNumber,
  upsertCustomerByWa,
  upsertWhatsAppPhoneNumber,
} from "../db/queries.js";
import db from "../db/knex.js";
import { emit } from "../sockets.js";

export const companyRoutes = Router();

const patchSchema = z
  .object({
    company_name: z.string().optional(),
    logo_url: z.string().nullable().optional(),
    theme_color: z.string().nullable().optional(),

    enabled_modules: z.array(z.string()).optional(),

    enabled_languages: z.array(z.string()).optional(),
    default_language: z.string().optional(),

    working_hours: z.record(z.any()).optional(),
    after_hours_message: z.record(z.string()).optional(),

    whatsapp_token: z.string().nullable().optional(),
    phone_number_id: z.string().nullable().optional(),
    waba_id: z.string().nullable().optional(),
    verify_token: z.string().nullable().optional(),
    app_secret: z.string().nullable().optional(),
    app_id: z.string().nullable().optional(),
    graph_api_version: z.string().nullable().optional(),
    catalog_enabled: z.boolean().optional(),
    catalog_id: z.string().nullable().optional(),

    whatsapp_embedded_config_id: z.string().nullable().optional(),
    whatsapp_solution_id: z.string().nullable().optional(),
    coexistence_enabled: z.boolean().optional(),

    business_content: z
      .object({
        welcome_intro: z.record(z.string()).optional(),
        pickup_info: z.record(z.string()).optional(),
        support_phone: z.string().nullable().optional(),
        support_email: z.string().nullable().optional(),
        payment_methods: z
          .array(
            z.object({
              id: z.string().min(1),
              label: z.string().min(1),
              value: z.string().min(1),
            })
          )
          .optional(),
        text_overrides: z.record(z.record(z.string())).optional(),
      })
      .optional(),

    is_setup_complete: z.boolean().optional(),
  })
  .strict();

const templateConfigSchema = z
  .object({
    key: z.string().min(1),
    metaTemplateName: z.string().trim().nullable().optional(),
    languageCode: z.string().trim().nullable().optional(),
    category: z.enum([
      "payment_reminder",
      "order_followup",
      "restock_reengagement",
    ]),
    displayName: z.string().trim().min(1).optional(),
    description: z.string().trim().nullable().optional(),
    enabled: z.boolean().optional(),
    allowedLanguages: z.array(z.string().trim().min(1)).optional(),
    deprecated: z.boolean().optional(),
    sortOrder: z.number().int().optional(),
    params: z
      .array(
        z.object({
          key: z.string().min(1),
          label: z.string().min(1),
          required: z.boolean().optional(),
        })
      )
      .optional(),
  })
  .strict();

function serializeInboxTemplates(templates: InboxTemplateConfig[]) {
  const items = templates
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
    .map((template) => {
    const readiness = resolveInboxTemplateReadiness(template);
    return {
      key: template.key,
      category: template.category,
      displayName: template.displayName,
      description: template.description,
      enabled: template.enabled,
      allowedLanguages: template.allowedLanguages,
      deprecated: template.deprecated,
      sortOrder: template.sortOrder,
      metaTemplateName: template.metaTemplateName,
      languageCode: template.languageCode,
      params: template.params,
      readiness,
    };
  });

  const summary = {
    total: items.length,
    ready: items.filter((item) => item.readiness.can_send).length,
    blocked: items.filter((item) => !item.readiness.can_send).length,
    disabled: items.filter((item) => item.readiness.status === "disabled").length,
    deprecated: items.filter((item) => item.deprecated).length,
  };

  return { items, summary };
}

function mergeSettings(
  current: typeof DEFAULT_COMPANY_SETTINGS,
  patch: z.infer<typeof patchSchema>
) {
  const merged = {
    ...current,
    ...patch,
  };
  const next: typeof DEFAULT_COMPANY_SETTINGS = {
    ...merged,
    business_content: getBusinessContentSettings(merged as typeof DEFAULT_COMPANY_SETTINGS),
  };

  // inbox is always enabled
  const mods = new Set(["inbox", ...(next.enabled_modules ?? [])]);
  next.enabled_modules = Array.from(mods);

  return next;
}

async function refreshBusinessInfoBestEffort() {
  try {
    const profile = await getBusinessProfile();
    await setJsonSetting("whatsapp_business_profile_cache", profile);
    await setJsonSetting("whatsapp_business_profile_refreshed_at", {
      at: new Date().toISOString(),
    });
  } catch (e: any) {
    await setJsonSetting("whatsapp_business_profile_cache", {
      error: "failed_to_fetch_business_profile",
      message: e?.message ?? "unknown_error",
      at: new Date().toISOString(),
    });
  }
}

companyRoutes.get("/company/settings", async (_req, res) => {
  // Ensure cache is warm (first request after boot)
  try {
    await loadCompanySettingsToCache();
  } catch {
    // ignore; fallback to default cache
  }

  return res.json({ ok: true, settings: getCompanySettingsCached() });
});

companyRoutes.get("/company/whatsapp-templates", async (_req, res) => {
  const templates = await getInboxTemplateRegistry();
  const serialized = serializeInboxTemplates(templates);
  return res.json({
    ok: true,
    templates: serialized.items,
    summary: serialized.summary,
  });
});

companyRoutes.put("/company/whatsapp-templates", async (req, res) => {
  const parsed = z
    .object({
      templates: z.array(templateConfigSchema),
    })
    .strict()
    .safeParse(req.body ?? {});

  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_payload",
      code: "invalid_payload",
      details: parsed.error.flatten(),
    });
  }

  const providedByKey = new Map(
    parsed.data.templates.map((template) => [template.key, template] as const)
  );

  const nextTemplates = DEFAULT_INBOX_TEMPLATES.map((fallback) => {
    const template = providedByKey.get(fallback.key) ?? fallback;
    const nextSortOrder = Number(template.sortOrder);
    return {
      key: fallback.key,
      category: template.category ?? fallback.category,
      displayName: String(template.displayName ?? fallback.displayName).trim() || fallback.displayName,
      description: String(template.description ?? fallback.description ?? "").trim() || null,
      enabled: template.enabled !== false,
      allowedLanguages: Array.isArray(template.allowedLanguages)
        ? Array.from(
            new Set(
              template.allowedLanguages
                .map((item) => String(item ?? "").trim())
                .filter(Boolean)
            )
          )
        : fallback.allowedLanguages,
      deprecated: template.deprecated === true,
      sortOrder: Number.isFinite(nextSortOrder) ? nextSortOrder : fallback.sortOrder,
      metaTemplateName: String(template.metaTemplateName ?? "").trim() || null,
      languageCode: String(template.languageCode ?? "").trim() || null,
      params: Array.isArray(template.params)
        ? template.params.map((item) => ({
            key: item.key,
            label: item.label,
            required: item.required !== false,
          }))
        : fallback.params,
    } satisfies InboxTemplateConfig;
  });

  const saved = await saveInboxTemplateRegistry(nextTemplates);
  const serialized = serializeInboxTemplates(saved);
  return res.json({
    ok: true,
    templates: serialized.items,
    summary: serialized.summary,
  });
});

// Lightweight sidebar metadata endpoint used by the web app.
companyRoutes.get("/company/meta", async (_req, res) => {
  try {
    await loadCompanySettingsToCache();
  } catch {
    // fallback to cached/default values
  }

  const s = getCompanySettingsCached();
  return res.json({
    ok: true,
    meta: {
      company_name: getCompanyDisplayName(s),
      enabled_modules: Array.isArray(s.enabled_modules) ? s.enabled_modules : ["inbox"],
      catalog_enabled: !!s.catalog_enabled,
    },
  });
});

// Runtime flow config (non-secret operational values, mostly env-driven today).
companyRoutes.get("/company/runtime-config", async (_req, res) => {
  return res.json({
    ok: true,
    config: {
      delivery: {
        base_lat: env.BASE_LAT,
        base_lng: env.BASE_LNG,
        service_radius_km: env.SERVICE_RADIUS_KM,
        require_location_pin: env.REQUIRE_LOCATION_PIN,
        rate_per_km: env.DELIVERY_RATE_PER_KM,
        round_to: env.DELIVERY_ROUND_TO,
        default_distance_km: env.DEFAULT_DISTANCE_KM,
      },
      payment: {
        lipa_namba_till: process.env.LIPA_NAMBA_TILL ?? "",
        lipa_namba_name: process.env.LIPA_NAMBA_NAME ?? "",
        voda_lnm_till: process.env.VODA_LNM_TILL ?? "",
        voda_lnm_name: process.env.VODA_LNM_NAME ?? "",
        voda_p2p_msisdn: process.env.VODA_P2P_MSISDN ?? "",
        voda_p2p_name: process.env.VODA_P2P_NAME ?? "",
      },
    },
  });
});

companyRoutes.put("/company/settings", async (req, res) => {
  const parsed = patchSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
  }

  // Ensure cache is warm
  const current = await loadCompanySettingsToCache().catch(() => getCompanySettingsCached());

  const next = mergeSettings(current, parsed.data);
  // Guardrail: Phone Number ID must never equal Meta App ID
if (
  next.phone_number_id &&
  next.app_id &&
  String(next.phone_number_id).trim() === String(next.app_id).trim()
) {
  return res.status(400).json({
    error: "invalid_phone_number_id",
    message:
      "PHONE_NUMBER_ID cannot be the same as APP_ID. Use the WhatsApp Phone Number ID from WABA phone_numbers.",
  });
}

// Basic format check (helps catch accidental pasted text)
if (next.phone_number_id && !/^\d{8,}$/.test(String(next.phone_number_id).trim())) {
  return res.status(400).json({
    error: "invalid_phone_number_id",
    message: "PHONE_NUMBER_ID must be digits only (Meta phone number id).",
  });
}
  await saveCompanySettings(next);

  // If WA credentials were involved, refresh business info (priority request)
  const touchedWA =
    "whatsapp_token" in parsed.data ||
    "phone_number_id" in parsed.data ||
    "waba_id" in parsed.data ||
    "graph_api_version" in parsed.data;

  if (touchedWA && next.whatsapp_token && next.phone_number_id) {
    // Track this phone number in DB (multi-number support).
    await upsertWhatsAppPhoneNumber({
      phone_number_id: next.phone_number_id,
    });

    await refreshBusinessInfoBestEffort();
  }

  return res.json({ ok: true, settings: next });
});

// List connected WhatsApp phone numbers (single-tenant, multi-number).
companyRoutes.get("/company/whatsapp-numbers", async (_req, res) => {
  const rows = await listWhatsAppPhoneNumbers();
  return res.json({ ok: true, items: rows, numbers: rows });
});

// Set default sending phone number.
companyRoutes.post("/company/whatsapp-numbers/default", async (req, res) => {
  const schema = z
    .object({ phone_number_id: z.string().min(3) })
    .strict();

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_payload" });
  }

  await setDefaultWhatsAppPhoneNumber(parsed.data.phone_number_id);

  // Also update company_settings.phone_number_id to keep the legacy/default path aligned.
  const current = await loadCompanySettingsToCache().catch(() => getCompanySettingsCached());
  const next = { ...current, phone_number_id: parsed.data.phone_number_id };
  await saveCompanySettings(next);

  return res.json({ ok: true, settings: next });
});

companyRoutes.post("/setup/test-send", async (req, res) => {
  const schema = z
    .object({
      to: z.string().min(3),
      text: z.string().min(1).max(1000),
    })
    .strict();

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_payload" });
  }

  try {
    const waResponse = await sendText(parsed.data.to, parsed.data.text);

    // Also persist in inbox so test sends are visible in the interface.
    const { id: customerId } = await upsertCustomerByWa(
      parsed.data.to,
      undefined,
      parsed.data.to
    );
    const conversationId = await getOrCreateConversationForPhone(
      customerId,
      getPhoneNumberIdEffective() ?? null
    );
    const inserted = await insertOutboundMessage(
      conversationId,
      "text",
      parsed.data.text,
      {
        waMessageId: typeof waResponse?.messages?.[0]?.id === "string" ? waResponse.messages[0].id : null,
        status: "sent",
        messageKind: "freeform",
      }
    );

    emit("message.created", { conversation_id: conversationId, message: inserted });
    emit("conversation.updated", {});

    return res.json({ ok: true });
  } catch (e: any) {
    // Do NOT crash the server; return a helpful response to the UI
    return res.status(400).json({
      ok: false,
      error: "whatsapp_send_failed",
      message:
        e?.message ??
        "Failed to send WhatsApp message. Check WHATSAPP_TOKEN + PHONE_NUMBER_ID permissions.",
    });
  }
});

companyRoutes.post("/setup/set-catalog-id", async (req, res) => {
  const parsed = z
    .object({
      catalogId: z.string().trim().min(5),
    })
    .strict()
    .safeParse(req.body ?? {});

  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid_payload",
      message: "catalogId is required",
      details: parsed.error.flatten(),
    });
  }

  const catalogId = String(parsed.data.catalogId ?? "").trim();
  if (!/^\d{5,}$/.test(catalogId)) {
    return res.status(400).json({
      error: "invalid_catalog_id",
      message: "catalogId must be digits only.",
    });
  }

  try {
    const settings = await setCompanyCatalogId(null, catalogId);
    return res.json({
      ok: true,
      catalog_id: settings.catalog_id,
      settings,
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: "catalog_id_save_failed",
      message: e?.message ?? "Failed to save catalog id.",
    });
  }
});

companyRoutes.get("/setup/diagnostics", async (_req, res) => {
  try {
    const s = await loadCompanySettingsToCache().catch(() => getCompanySettingsCached());
    const templates = await getInboxTemplateRegistry();
    const serializedTemplates = serializeInboxTemplates(templates);
    const templateEventsTablePresent = await db.schema
      .hasTable("template_send_events")
      .catch(() => false);

    const missing: string[] = [];
    if (!s.whatsapp_token) missing.push("whatsapp_token");
    if (!s.phone_number_id) missing.push("phone_number_id");
    if (!s.verify_token) missing.push("verify_token");
    if (!s.app_secret) missing.push("app_secret");

    const [convAgg, msgAgg, lastInbound, phoneSummary, templateAuditAgg, templateRecentFailure] =
      await Promise.all([
      db("conversations").count<{ count: string }>("id as count").first(),
      db("messages")
        .select(
          db.raw("COUNT(*)::int as total"),
          db.raw("SUM(CASE WHEN direction='inbound' THEN 1 ELSE 0 END)::int as inbound"),
          db.raw("SUM(CASE WHEN direction='out' THEN 1 ELSE 0 END)::int as outbound")
        )
        .first(),
      db("messages as m")
        .join("conversations as c", "c.id", "m.conversation_id")
        .join("customers as u", "u.id", "c.customer_id")
        .where("m.direction", "inbound")
        .orderBy("m.created_at", "desc")
        .select(
          "m.created_at",
          "m.body",
          "u.wa_id",
          "u.phone",
          "c.phone_number_id"
        )
        .first(),
      getPhoneNumberSummary().catch(() => null),
      templateEventsTablePresent
        ? db("template_send_events")
            .select(
              db.raw("COUNT(*)::int as total"),
              db.raw(
                "SUM(CASE WHEN created_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END)::int as last_24h_total"
              ),
              db.raw(
                "SUM(CASE WHEN send_status = 'failed' AND created_at >= NOW() - INTERVAL '24 hours' THEN 1 ELSE 0 END)::int as last_24h_failed"
              ),
              db.raw("MAX(created_at) as last_event_at")
            )
            .first()
        : Promise.resolve(null),
      templateEventsTablePresent
        ? db("template_send_events")
            .where("send_status", "failed")
            .orderBy("created_at", "desc")
            .select(
              "template_key",
              "template_name",
              "template_language",
              "error_code",
              "error_title",
              "created_at"
            )
            .first()
        : Promise.resolve(null),
    ]);

    const nowMs = Date.now();
    const lastInboundAt = lastInbound?.created_at
      ? new Date(lastInbound.created_at).toISOString()
      : null;
    const lastInboundAgeMinutes = lastInboundAt
      ? Math.max(0, Math.round((nowMs - new Date(lastInboundAt).getTime()) / 60000))
      : null;

    const issues: Array<{ level: "error" | "warn"; code: string; message: string }> = [];

    if (missing.length > 0) {
      issues.push({
        level: "error",
        code: "missing_required_settings",
        message: `Missing required WhatsApp setup values: ${missing.join(", ")}`,
      });
    }

    if (!lastInboundAt) {
      issues.push({
        level: "warn",
        code: "no_inbound_messages",
        message: "No inbound WhatsApp messages were recorded yet.",
      });
    } else if ((lastInboundAgeMinutes ?? 0) > 120) {
      issues.push({
        level: "warn",
        code: "inbound_stale",
        message: `Last inbound message was ${lastInboundAgeMinutes} minutes ago.`,
      });
    }

    if (s.phone_number_id && phoneSummary?.id && s.phone_number_id !== phoneSummary.id) {
      issues.push({
        level: "warn",
        code: "phone_id_mismatch",
        message: "Configured PHONE_NUMBER_ID does not match Graph API-resolved phone id.",
      });
    }

    const templateBlocked = serializedTemplates.items.filter(
      (item) => !item.readiness.can_send
    );
    if (templateBlocked.length > 0) {
      issues.push({
        level: "warn",
        code: "template_readiness_blockers",
        message: `${templateBlocked.length} WhatsApp template mapping(s) are not currently send-ready.`,
      });
    }

    return res.json({
      ok: true,
      diagnostics: {
        setup: {
          missing_required: missing,
          configured_phone_number_id: s.phone_number_id ?? null,
          configured_graph_version: s.graph_api_version ?? null,
        },
        graph: {
          phone_summary: phoneSummary,
        },
        inbox: {
          conversations: Number(convAgg?.count ?? 0),
          messages_total: Number((msgAgg as any)?.total ?? 0),
          messages_inbound: Number((msgAgg as any)?.inbound ?? 0),
          messages_outbound: Number((msgAgg as any)?.outbound ?? 0),
          last_inbound: lastInbound
            ? {
                at: lastInboundAt,
                age_minutes: lastInboundAgeMinutes,
                from_wa_id: lastInbound.wa_id ?? null,
                from_phone: lastInbound.phone ?? null,
                phone_number_id: lastInbound.phone_number_id ?? null,
                body_preview: String(lastInbound.body ?? "").slice(0, 120),
              }
            : null,
        },
        templates: {
          ...serializedTemplates.summary,
          event_table_present: templateEventsTablePresent,
          audit: {
            total_events: Number((templateAuditAgg as any)?.total ?? 0),
            last_24h_total: Number((templateAuditAgg as any)?.last_24h_total ?? 0),
            last_24h_failed: Number((templateAuditAgg as any)?.last_24h_failed ?? 0),
            last_event_at:
              (templateAuditAgg as any)?.last_event_at != null
                ? new Date((templateAuditAgg as any).last_event_at).toISOString()
                : null,
            last_failure: templateRecentFailure
              ? {
                  template_key: String(templateRecentFailure.template_key ?? ""),
                  template_name: templateRecentFailure.template_name ?? null,
                  template_language: templateRecentFailure.template_language ?? null,
                  error_code: templateRecentFailure.error_code ?? null,
                  error_title: templateRecentFailure.error_title ?? null,
                  created_at: new Date(templateRecentFailure.created_at).toISOString(),
                }
              : null,
          },
          items: serializedTemplates.items.map((item) => ({
            key: item.key,
            displayName: item.displayName,
            category: item.category,
            enabled: item.enabled,
            deprecated: item.deprecated,
            readiness: item.readiness,
          })),
        },
        issues,
      },
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: "diagnostics_failed",
      message: e?.message ?? "Failed to build diagnostics.",
    });
  }
});

companyRoutes.get("/setup/catalog-diagnostics", async (_req, res) => {
  try {
    const s = await loadCompanySettingsToCache().catch(() => getCompanySettingsCached());
    const catalogEnabled = getCatalogEnabledEffective();
    const configuredWabaId = getWabaIdEffective();
    const configuredPhoneId = getPhoneNumberIdEffective();

    const [phoneSummary, catalogLookup, linkSummary] = await Promise.all([
      getPhoneNumberSummary().catch(() => null),
      getConnectedCatalogInfo(configuredWabaId ?? null).catch(() => null),
      listProductCatalogLinksSummary().catch(() => ({
        totalProducts: 0,
        linkedProducts: 0,
        byStatus: {},
      })),
    ]);
    const resolvedCatalog = await resolveCatalogId({
      wabaId: configuredWabaId ?? null,
    }).catch(() => null);
    const catalogId = resolvedCatalog?.catalogId ?? null;
    const inboxSendUsable = catalogEnabled && !!catalogId && !!configuredPhoneId;
    const configuredCatalogId = getConfiguredCatalogIdEffective();
    const webhookCatalogId = getWebhookCatalogIdEffective();
    const detectedCatalogFromWaba = catalogLookup?.catalogId ?? null;

    const issues: Array<{ level: "error" | "warn"; code: string; message: string }> = [];
    if (!catalogEnabled) {
      issues.push({
        level: "warn",
        code: "catalog_disabled",
        message: "Catalog mode is disabled in settings.",
      });
    }
    if (!configuredPhoneId) {
      issues.push({
        level: "error",
        code: "missing_phone_number_id",
        message: "PHONE_NUMBER_ID is missing.",
      });
    }
    if (!configuredWabaId) {
      issues.push({
        level: "warn",
        code: "missing_waba_id",
        message: "WABA_ID is missing; using auto-discovery from PHONE_NUMBER_ID.",
      });
    }
    if (!catalogId) {
      issues.push({
        level: "error",
        code: "catalog_id_unresolved",
        message:
          "No catalog_id could be resolved from company settings, webhook discovery, or WABA lookup.",
      });
    }
    if (catalogEnabled && linkSummary.totalProducts > 0 && linkSummary.linkedProducts === 0) {
      issues.push({
        level: "warn",
        code: "no_local_catalog_links",
        message: "Catalog is connected, but no local products have durable catalog linkage yet.",
      });
    }

    return res.json({
      ok: true,
      diagnostics: {
        catalog_enabled: catalogEnabled,
        configured_phone_number_id: s.phone_number_id ?? null,
        configured_waba_id: s.waba_id ?? null,
        configured_catalog_id: configuredCatalogId,
        webhook_catalog_id: webhookCatalogId,
        catalog_initialized: getCatalogInitializedEffective(),
        graph_phone_summary: phoneSummary,
        connected_catalog_id: catalogId,
        detected_catalog_from_waba: detectedCatalogFromWaba,
        catalog_lookup:
          catalogLookup == null
            ? null
            : {
                token_source: catalogLookup.context.tokenSource,
                effective_phone_number_id: catalogLookup.context.effectivePhoneNumberId,
                effective_phone_number_id_source:
                  catalogLookup.context.effectivePhoneNumberIdSource,
                effective_waba_id: catalogLookup.context.effectiveWabaId,
                effective_waba_id_source: catalogLookup.context.effectiveWabaIdSource,
                candidates: catalogLookup.candidates,
                raw_product_catalogs_responses: catalogLookup.rawProductCatalogsResponses,
              },
        catalog_resolution:
          resolvedCatalog == null
            ? null
            : {
                source: resolvedCatalog.source,
                configured_catalog_id: resolvedCatalog.configuredCatalogId,
                requested_catalog_id: resolvedCatalog.requestedCatalogId,
                webhook_catalog_id: resolvedCatalog.webhookCatalogId,
                detected_catalog_from_waba: resolvedCatalog.detectedCatalogFromWaba,
              },
        inbox_send_usable: inboxSendUsable,
        product_link_summary: linkSummary,
        healthy: inboxSendUsable,
        issues,
      },
    });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: "catalog_diagnostics_failed",
      message: e?.message ?? "Failed to run catalog diagnostics.",
    });
  }
});

companyRoutes.post("/setup/reconcile-contacts", async (_req, res) => {
  try {
    const stats = await reconcileCustomersAndConversations();
    return res.json({ ok: true, stats });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: "reconcile_failed",
      message: e?.message ?? "Failed to reconcile customer conversations.",
    });
  }
});


companyRoutes.post("/setup/complete", async (_req, res) => {
  const current = await loadCompanySettingsToCache().catch(() => getCompanySettingsCached());
  const next = { ...current, is_setup_complete: true };
  await saveCompanySettings(next);
  return res.json({ ok: true, settings: next });
});
