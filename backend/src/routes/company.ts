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
import {
  DEFAULT_COMPANY_SETTINGS,
  getCompanySettingsCached,
  loadCompanySettingsToCache,
  saveCompanySettings,
} from "../runtime/companySettings.js";
import { getBusinessProfile, sendText } from "../whatsapp.js";
import { setJsonSetting } from "../db/settings.js";
import {
  listWhatsAppPhoneNumbers,
  setDefaultWhatsAppPhoneNumber,
  upsertWhatsAppPhoneNumber,
} from "../db/queries.js";

export const companyRoutes = Router();
const SETUP_DISABLED_ENV_ONLY = true;

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

companyRoutes.put("/company/settings", async (req, res) => {
  if (SETUP_DISABLED_ENV_ONLY) {
  return res.status(400).json({
    ok: false,
    error: "setup_disabled_env_only",
    message: "Setup is disabled. Configure WhatsApp only via backend/.env and restart the server.",
  });
}

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
  if (SETUP_DISABLED_ENV_ONLY) {
  return res.status(400).json({
    ok: false,
    error: "setup_disabled_env_only",
    message: "Setup is disabled. Configure WhatsApp only via backend/.env and restart the server.",
  });
}
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


companyRoutes.post("/setup/complete", async (_req, res) => {
  if (SETUP_DISABLED_ENV_ONLY) {
  return res.status(400).json({
    ok: false,
    error: "setup_disabled_env_only",
    message: "Setup is disabled. Configure WhatsApp only via backend/.env and restart the server.",
  });
}
  const current = await loadCompanySettingsToCache().catch(() => getCompanySettingsCached());
  const next = { ...current, is_setup_complete: true };
  await saveCompanySettings(next);
  return res.json({ ok: true, settings: next });
});
