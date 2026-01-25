// backend/src/routes/embeddedSignup.ts
//
// Implements Embedded Signup (OAuth) callback handling for WhatsApp Cloud API.
// This enables:
//   - Onboarding via Meta's WhatsApp Embedded Signup (FB.login -> auth code)
//   - Persisting WABA + phone_number_id + access token to Postgres (app_settings)
//   - Subscribing the app to the WABA's webhooks
//   - Enabling WhatsApp Business App Coexistence safely (echo handling is in webhook.ts)
//
// Endpoints (mounted under /api):
//   POST /api/whatsapp/embedded/exchange
//   POST /api/whatsapp/embedded/subscribe

import { Router, Request } from "express";
import { z } from "zod";
import { env } from "../config.js";
import {
  getCompanySettingsCached,
  loadCompanySettingsToCache,
  saveCompanySettings,
} from "../runtime/companySettings.js";
import { getBusinessProfile } from "../whatsapp.js";
import { setJsonSetting } from "../db/settings.js";
import {
  upsertWhatsAppPhoneNumber,
  setDefaultWhatsAppPhoneNumber,
} from "../db/queries.js";

export const embeddedSignupRoutes = Router();

const GRAPH_BASE = "https://graph.facebook.com";

function bestEffortPublicWebhookUrl(req: Request): string {
  if (env.PUBLIC_BASE_URL) {
    return `${env.PUBLIC_BASE_URL.replace(/\/$/, "")}/webhook`;
  }

  // Behind Render/Proxies, trust x-forwarded-proto if present.
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
  const host = req.get("host") ?? "";
  return `${proto}://${host}/webhook`;
}

async function graphGetJson(url: string): Promise<any> {
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    throw new Error(`Graph GET failed ${res.status}: ${typeof json === "string" ? json : JSON.stringify(json)}`);
  }
  return json;
}

async function graphPostForm(
  url: string,
  token: string,
  params: Record<string, string>
): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(params).toString(),
  });

  const text = await res.text().catch(() => "");
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!res.ok) {
    throw new Error(`Graph POST failed ${res.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`);
  }
  return payload;
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

async function exchangeCodeForToken(args: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): Promise<{ access_token: string; expires_in?: number }> {
  // Exchange auth code for a short-lived user access token.
  const base = `${GRAPH_BASE}/oauth/access_token`;
  const q = new URLSearchParams({
    client_id: args.appId,
    client_secret: args.appSecret,
    redirect_uri: args.redirectUri,
    code: args.code,
  });
  const short = await graphGetJson(`${base}?${q.toString()}`);

  const shortToken = short?.access_token as string | undefined;
  if (!shortToken) {
    throw new Error("oauth_exchange_missing_access_token");
  }

  // Best effort: exchange for long-lived token.
  const q2 = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: args.appId,
    client_secret: args.appSecret,
    fb_exchange_token: shortToken,
  });

  try {
    const long = await graphGetJson(`${base}?${q2.toString()}`);
    const longToken = long?.access_token as string | undefined;
    if (longToken) {
      return { access_token: longToken, expires_in: long?.expires_in };
    }
  } catch (e) {
    // fall back to short token
    console.warn("[embedded-signup] long-lived exchange failed; using short token");
  }

  return { access_token: shortToken, expires_in: short?.expires_in };
}

async function subscribeAppToWaba(args: {
  graphApiVersion: string;
  wabaId: string;
  token: string;
  callbackUrl: string;
  verifyToken: string;
}): Promise<any> {
  // POST /{waba_id}/subscribed_apps
  const url = `${GRAPH_BASE}/${args.graphApiVersion}/${args.wabaId}/subscribed_apps`;
  return graphPostForm(url, args.token, {
    override_callback_uri: args.callbackUrl,
    verify_token: args.verifyToken,
  });
}

embeddedSignupRoutes.post("/whatsapp/embedded/exchange", async (req, res) => {
  const schema = z
    .object({
      code: z.string().min(5),
      redirect_uri: z.string().min(8),
      waba_id: z.string().min(5),
      phone_number_id: z.string().min(5),
      // Optional: set this newly onboarded number as the default sender.
      // If omitted, we keep the current default unless none exists.
      make_default: z.boolean().optional(),
      // Optional override (rarely needed; usually comes from company settings)
      verify_token: z.string().nullable().optional(),
      graph_api_version: z.string().nullable().optional(),
    })
    .strict();

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_payload", details: parsed.error.flatten() });
  }

  const current = await loadCompanySettingsToCache().catch(() => getCompanySettingsCached());
  const appId = current.app_id || process.env.APP_ID || "";
  const appSecret = current.app_secret || process.env.APP_SECRET || "";

  if (!appId || !appSecret) {
    return res.status(400).json({
      error: "missing_app_credentials",
      message: "App ID and App Secret are required to exchange the Embedded Signup auth code.",
    });
  }

  const verifyToken =
    (parsed.data.verify_token ?? null) ||
    current.verify_token ||
    process.env.VERIFY_TOKEN ||
    "";
  if (!verifyToken) {
    return res.status(400).json({
      error: "missing_verify_token",
      message: "Verify token is required to subscribe the app to WABA webhooks.",
    });
  }

  const graphVer =
    parsed.data.graph_api_version || current.graph_api_version || process.env.GRAPH_API_VERSION || "v19.0";

  // 1) Exchange auth code for access token
  const token = await exchangeCodeForToken({
    appId,
    appSecret,
    redirectUri: parsed.data.redirect_uri,
    code: parsed.data.code,
  });

  // Persist token metadata for debugging
  await setJsonSetting("whatsapp_oauth_token_meta", {
    obtained_at: new Date().toISOString(),
    expires_in: token.expires_in ?? null,
    graph_api_version: graphVer,
  });

  // 2) Save to company settings (DB-backed)
  // Upsert the connected phone number into the DB table (multi-number).
  await upsertWhatsAppPhoneNumber({
    phone_number_id: parsed.data.phone_number_id,
  });

  // Decide whether to switch default sender.
  const shouldMakeDefault =
    parsed.data.make_default === true ||
    !current.phone_number_id ||
    current.phone_number_id === parsed.data.phone_number_id;

  if (shouldMakeDefault) {
    await setDefaultWhatsAppPhoneNumber(parsed.data.phone_number_id).catch(() => {});
  }

  const next = {
    ...current,
    whatsapp_token: token.access_token,
    // Preserve existing default number unless explicitly changing it.
    phone_number_id: shouldMakeDefault ? parsed.data.phone_number_id : current.phone_number_id,
    waba_id: parsed.data.waba_id,
    verify_token: verifyToken,
    graph_api_version: graphVer,
    coexistence_enabled: true,
  };

  await saveCompanySettings(next);

  // 3) Subscribe app to WABA webhooks (required for reliable delivery)
  const callbackUrl = bestEffortPublicWebhookUrl(req);
  try {
    const sub = await subscribeAppToWaba({
      graphApiVersion: graphVer,
      wabaId: parsed.data.waba_id,
      token: token.access_token,
      callbackUrl,
      verifyToken,
    });
    await setJsonSetting("whatsapp_waba_subscription", {
      ok: true,
      response: sub,
      at: new Date().toISOString(),
      callbackUrl,
    });
  } catch (e: any) {
    await setJsonSetting("whatsapp_waba_subscription", {
      ok: false,
      error: e?.message ?? "subscribe_failed",
      at: new Date().toISOString(),
      callbackUrl,
    });
    // Don't fail the whole exchange; token + ids are still valuable.
  }

  // 4) Fetch business profile (priority requirement)
  await refreshBusinessInfoBestEffort();

  return res.json({
    ok: true,
    settings: next,
    token_expires_in: token.expires_in ?? null,
  });
});

embeddedSignupRoutes.post("/whatsapp/embedded/subscribe", async (req, res) => {
  const schema = z
    .object({
      override_callback_url: z.string().nullable().optional(),
    })
    .strict();

  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "invalid_payload" });
  }

  const current = await loadCompanySettingsToCache().catch(() => getCompanySettingsCached());

  if (!current.whatsapp_token || !current.waba_id || !current.verify_token) {
    return res.status(400).json({
      error: "missing_required_settings",
      message: "Need whatsapp_token, waba_id, and verify_token to subscribe.",
    });
  }

  const graphVer = current.graph_api_version || process.env.GRAPH_API_VERSION || "v19.0";
  const callbackUrl = parsed.data.override_callback_url || bestEffortPublicWebhookUrl(req);

  const sub = await subscribeAppToWaba({
    graphApiVersion: graphVer,
    wabaId: current.waba_id,
    token: current.whatsapp_token,
    callbackUrl,
    verifyToken: current.verify_token,
  });

  await setJsonSetting("whatsapp_waba_subscription", {
    ok: true,
    response: sub,
    at: new Date().toISOString(),
    callbackUrl,
  });

  return res.json({ ok: true, subscription: sub, callbackUrl });
});
