# Environment Variables

Below are the keys recognized by the app. Values marked *(optional)* can be left empty.

## Core (Meta / Server)
- `PORT` — Web server port (default `3000`)
- `VERIFY_TOKEN` — Webhook verify token you set in Meta
- `WHATSAPP_TOKEN` — Permanent access token
- `PHONE_NUMBER_ID` — WABA phone number ID
- `APP_SECRET` — App secret for webhook signature verification *(optional but recommended)*
- `PUBLIC_BASE_URL` — Public HTTPS base URL (e.g. Render URL)
- `BUSINESS_WA_NUMBER_E164` — Public business WhatsApp number shown to users (e.g. `+2557...`)

## Delivery (Pricing)
- `PRICING_MODE` — `per_km` (default) or `tier`
- `DELIVERY_RATE_PER_KM` — TZS per km (default `1000`)
- `DELIVERY_ROUND_TO` — Round fee to nearest TZS (default `500`)
- `DELIVERY_MIN_FEE` — Minimum fee (default `0`)
- `DELIVERY_MAX_FEE` — Maximum fee clamp (default `15000`)
- `DEFAULT_DISTANCE_KM` — Fallback distance when address is unknown (default `8`)
- `ORIGIN_LAT`, `ORIGIN_LON` — Store hub coordinates (default Keko Magurumbasi)

## Payments (Manual)
- `LIPA_NAMBA_TILL` *(optional)*
- `VODA_LNM_TILL` *(optional)*
- `VODA_P2P_MSISDN` *(optional)*

## Realtime / Agent Console
- `AGENT_UI_ORIGIN` — Allowed origin for the console UI (CORS/SSE). Use `*` on free-tier for testing.

## Rate Limit
- `RATE_LIMIT_WINDOW_MS` — Window in ms (default `60000`)
- `RATE_LIMIT_MAX` — Requests per IP per window (default `120`)
