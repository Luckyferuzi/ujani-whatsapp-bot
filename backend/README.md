# Ujani WhatsApp Bot — Milestone 1 (Scaffold)

TypeScript Express server with WhatsApp Cloud API webhook verification, inbound message handling, and a simple reply.
Includes optional signature verification (X-Hub-Signature-256) if you set `APP_SECRET`.

## Prerequisites
- Node.js 20+ (or 18+ with undici available)
- A WhatsApp Business Cloud API app with:
  - A phone number connected
  - A **Permanent Token** (`WHATSAPP_TOKEN`)
  - A **Phone Number ID** (`PHONE_NUMBER_ID`)
  - A **Verify Token** you choose (used only for webhook handshake)

## Quick start
```bash
cp .env.example .env
# fill VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID, (optional) APP_SECRET

npm install
npm run dev
```

Expose your server publicly (e.g. `ngrok http 3000`) and set the webhook URL in Meta (Callback URL: `https://<your-public-host>/webhook`, Verify Token: the same `VERIFY_TOKEN` as in your `.env`).

### Files
- `src/server.ts` — Express app bootstrap, raw body capture, routes.
- `src/routes/webhook.ts` — GET verify & POST receive; simple reply logic.
- `src/whatsapp.ts` — `sendText()` helper to call Graph API.
- `src/config.ts` — env parsing & validation (Zod).

## Test the flow
1. Send a WhatsApp message to your Business number from a test number.
2. The bot replies to "menu", "hi", "mambo", "habari", etc.
3. Use "agent" to see a different response.

## Next milestones
- FSM + bilingual content & persistence
- Orders + totals + OrderID + "order_created" message
- Pay-by-Link + PSP webhook + payments tables
- Jobs (reminders, morning fulfillment)
- Minimal admin dashboard
