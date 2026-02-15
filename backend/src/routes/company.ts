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
  DEFAULT_COMPANY_SETTINGS,
  getPhoneNumberIdEffective,
  getCompanySettingsCached,
  loadCompanySettingsToCache,
  saveCompanySettings,
} from "../runtime/companySettings.js";
import { getBusinessProfile, getPhoneNumberSummary, sendText } from "../whatsapp.js";
import { setJsonSetting } from "../db/settings.js";
import {
  getOrCreateConversationForPhone,
  insertOutboundMessage,
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

    whatsapp_embedded_config_id: z.string().nullable().optional(),
    whatsapp_solution_id: z.string().nullable().optional(),
    coexistence_enabled: z.boolean().optional(),

    is_setup_complete: z.boolean().optional(),
  })
  .strict();

function mergeSettings(
  current: typeof DEFAULT_COMPANY_SETTINGS,
  patch: z.infer<typeof patchSchema>
) {
  const next: typeof DEFAULT_COMPANY_SETTINGS = {
    ...current,
    ...patch,
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
      company_name: s.company_name || "Ujani",
      enabled_modules: Array.isArray(s.enabled_modules) ? s.enabled_modules : ["inbox"],
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
    await sendText(parsed.data.to, parsed.data.text);

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
      parsed.data.text
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

companyRoutes.get("/setup/diagnostics", async (_req, res) => {
  try {
    const s = await loadCompanySettingsToCache().catch(() => getCompanySettingsCached());

    const missing: string[] = [];
    if (!s.whatsapp_token) missing.push("whatsapp_token");
    if (!s.phone_number_id) missing.push("phone_number_id");
    if (!s.verify_token) missing.push("verify_token");
    if (!s.app_secret) missing.push("app_secret");

    const [convAgg, msgAgg, lastInbound, phoneSummary] = await Promise.all([
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
