import 'dotenv/config';
import { z } from 'zod';

/**
 * Centralized environment validation.
 * - BASE_LAT / BASE_LNG are REQUIRED (your Keko base pin).
 * - SERVICE_RADIUS_KM: 0 disables the radius gate.
 * - REQUIRE_LOCATION_PIN: if true, flows should enforce sending a WhatsApp location.
 * - DELIVERY_RATE_PER_KM and DELIVERY_ROUND_TO control fee math.
 */
const Schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default(""),
  // Server / Meta (WhatsApp Cloud)
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  INBOX_ACCESS_KEY: z.string().default(""),
  VERIFY_TOKEN: z.string().default(''),
  WHATSAPP_TOKEN: z.string().default(''),
  PHONE_NUMBER_ID: z.string().default(''),
  APP_SECRET: z.string().default(''), // when set, X-Hub-Signature-256 will be verified
  PUBLIC_BASE_URL: z.string().default(''),
  FRONTEND_ORIGIN: z.string().default(''),
  BUSINESS_WA_NUMBER_E164: z.string().default(''),
  WA_CHAT_SESSION_TTL_HOURS: z.coerce.number().default(24),
  DATABASE_SSL_REJECT_UNAUTHORIZED: z.coerce.boolean().default(false),

  // Delivery knobs
  DELIVERY_RATE_PER_KM: z.coerce.number().default(1000), // TZS per km
  DELIVERY_ROUND_TO: z.coerce.number().default(500),     // round to nearest 500
  DEFAULT_DISTANCE_KM: z.coerce.number().default(8),     // legacy fallback (still useful just in case)

  // === GPS base + options (REQUIRED: set your Keko pin in .env) ===
  BASE_LAT: z.coerce.number({
    required_error: 'BASE_LAT is required (Keko base latitude)',
    invalid_type_error: 'BASE_LAT must be a number',
  }),
  BASE_LNG: z.coerce.number({
    required_error: 'BASE_LNG is required (Keko base longitude)',
    invalid_type_error: 'BASE_LNG must be a number',
  }),
  SERVICE_RADIUS_KM: z.coerce.number().default(0),       // 0 = disabled; if > 0 we block beyond this distance
  REQUIRE_LOCATION_PIN: z.coerce.boolean().default(false),

  // Payments (optional informational fields for instructions message)
  LIPA_NAMBA_TILL: z.string().default(''),
  VODA_LNM_TILL: z.string().default(''),
  VODA_P2P_MSISDN: z.string().default(''),
});

export const env = Schema.parse(process.env);

export type AppEnv = z.infer<typeof Schema>;

function isTruthy(value: string | undefined) {
  return value === "1" || value === "true" || value === "yes";
}

export function getConfigDiagnostics(config: AppEnv = env) {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.DATABASE_URL) {
    errors.push("DATABASE_URL is required.");
  }

  if (!config.INBOX_ACCESS_KEY) {
    errors.push("INBOX_ACCESS_KEY is required to protect admin APIs.");
  }

  if (config.NODE_ENV === "production") {
    if (!config.PUBLIC_BASE_URL) {
      errors.push("PUBLIC_BASE_URL is required in production for webhook/profile/media URLs.");
    }

    if (!config.FRONTEND_ORIGIN) {
      errors.push("FRONTEND_ORIGIN is required in production for CORS and socket origin allowlist.");
    }

    if (!config.APP_SECRET) {
      warnings.push("APP_SECRET is not set; webhook signature verification will be skipped.");
    }

    if (!config.WHATSAPP_TOKEN || !config.PHONE_NUMBER_ID) {
      warnings.push("WhatsApp credentials are incomplete; live message sending will fail until Setup or env is completed.");
    }
  }

  if (!/^https?:\/\//i.test(config.PUBLIC_BASE_URL) && config.PUBLIC_BASE_URL) {
    warnings.push("PUBLIC_BASE_URL should include http/https.");
  }

  if (config.FRONTEND_ORIGIN && !/^https?:\/\//i.test(config.FRONTEND_ORIGIN)) {
    warnings.push("FRONTEND_ORIGIN should include http/https.");
  }

  if (config.DATABASE_URL.includes("neon.tech") && !/sslmode=require/i.test(config.DATABASE_URL)) {
    warnings.push("Neon DATABASE_URL should usually include sslmode=require.");
  }

  if (isTruthy(process.env.RENDER) && config.NODE_ENV !== "production") {
    warnings.push("Render deploy detected but NODE_ENV is not production.");
  }

  if (isTruthy(process.env.VERCEL) && !process.env.NEXT_PUBLIC_API_BASE) {
    warnings.push("Vercel deploy detected without NEXT_PUBLIC_API_BASE configured for the frontend.");
  }

  return { errors, warnings };
}

/**
 * Small helper to assert critical env at startup with nicer logs,
 * without crashing the process (useful for containerized deploys).
 * Use it in server bootstrap if you want:
 *
 *   assertCriticalEnv(['WHATSAPP_TOKEN','PHONE_NUMBER_ID']);
 */
export function assertCriticalEnv(keys: Array<keyof z.infer<typeof Schema>>) {
  const missing = keys.filter((k) => {
    const v = (env as any)[k];
    return v === undefined || v === null || v === '';
  });
  if (missing.length) {
    // eslint-disable-next-line no-console
    console.warn('[config] Missing recommended env:', missing.join(', '));
  }
}

export function ensureProductionReadiness(config: AppEnv = env) {
  const diagnostics = getConfigDiagnostics(config);
  if (diagnostics.errors.length) {
    throw new Error(`[config] Startup validation failed: ${diagnostics.errors.join(" | ")}`);
  }
  return diagnostics;
}
