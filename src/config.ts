import 'dotenv/config';
import { z } from 'zod';

const Base = z.object({
  PORT: z.coerce.number().default(3000),
  VERIFY_TOKEN: z.string().min(6, 'VERIFY_TOKEN is required'),
  WHATSAPP_TOKEN: z.string().min(20, 'WHATSAPP_TOKEN is required'),
  PHONE_NUMBER_ID: z.string().min(5, 'PHONE_NUMBER_ID is required'),
  APP_SECRET: z.string().optional().default(''),
  PUBLIC_BASE_URL: z.string().url('PUBLIC_BASE_URL must be a valid URL'),
  BUSINESS_WA_NUMBER_E164: z.string().min(8, 'Provide business WhatsApp number in E.164, e.g., +2557...'),
});

const OptionalPSP = z.object({
  LIPA_NAMBA_TILL: z.string().optional(),
  LIPA_NAMBA_NAME: z.string().optional(),
  VODA_LNM_TILL: z.string().optional(),
  VODA_LNM_NAME: z.string().optional(),
  VODA_P2P_MSISDN: z.string().optional(),
  VODA_P2P_NAME: z.string().optional(),
  CLICKPESA_BASE: z.string().url().default('https://api.clickpesa.com/third-parties'),
  CLICKPESA_CLIENT_ID: z.string().optional(),
  CLICKPESA_API_KEY: z.string().optional(),
  CLICKPESA_CHECKSUM_SECRET: z.string().optional(),
});

export const env = Base.merge(OptionalPSP).parse(process.env);
export const CLICKPESA_ENABLED = Boolean(env.CLICKPESA_CLIENT_ID && env.CLICKPESA_API_KEY);
