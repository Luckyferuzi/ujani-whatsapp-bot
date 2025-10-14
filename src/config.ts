import 'dotenv/config';
import { z } from 'zod';

const Schema = z.object({
  // Server / Meta (kept lenient so dev doesn’t crash if not set yet)
  PORT: z.coerce.number().default(3000),
  VERIFY_TOKEN: z.string().default(''),
  WHATSAPP_TOKEN: z.string().default(''),
  PHONE_NUMBER_ID: z.string().default(''),
  APP_SECRET: z.string().default(''),
  PUBLIC_BASE_URL: z.string().default(''),
  BUSINESS_WA_NUMBER_E164: z.string().default(''),

  // Delivery knobs (tiny + defaults)
  DELIVERY_RATE_PER_KM: z.coerce.number().default(1000), // TZS per km
  DELIVERY_ROUND_TO: z.coerce.number().default(500),     // round to nearest 500
  DEFAULT_DISTANCE_KM: z.coerce.number().default(8),     // fallback if district not found

  // Manual payment numbers (optional; shown only if present)
  LIPA_NAMBA_TILL: z.string().default(''),   // Tigo Lipa Namba
  VODA_LNM_TILL: z.string().default(''),     // Voda Lipa Namba
  VODA_P2P_MSISDN: z.string().default(''),   // Voda Normal (msisdn)
});

export const env = Schema.parse(process.env);
