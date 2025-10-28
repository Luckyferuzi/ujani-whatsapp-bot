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
  // Server / Meta (WhatsApp Cloud)
  PORT: z.coerce.number().default(3000),
  VERIFY_TOKEN: z.string().default(''),
  WHATSAPP_TOKEN: z.string().default(''),
  PHONE_NUMBER_ID: z.string().default(''),
  APP_SECRET: z.string().default(''), // when set, X-Hub-Signature-256 will be verified
  PUBLIC_BASE_URL: z.string().default(''),
  BUSINESS_WA_NUMBER_E164: z.string().default(''),

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
