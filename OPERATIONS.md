# Operations Guide

This repo is intended for:
- `Neon` for Postgres
- `Render` for the backend API/webhook runtime
- `Vercel` for the Next.js frontend

## Deployment model

- Backend state that matters must live in Postgres.
- Chatbot session state is already durable in `chat_sessions`.
- File uploads use memory-first processing and public URL persistence. Do not depend on local disk surviving deploys or restarts.
- The frontend expects `NEXT_PUBLIC_*` values to be present at build time on Vercel.

## Backend envs

Required:
- `DATABASE_URL`
- `INBOX_ACCESS_KEY`
- `BASE_LAT`
- `BASE_LNG`

Required for production deploys:
- `PUBLIC_BASE_URL`
- `FRONTEND_ORIGIN`

Required for live WhatsApp traffic:
- `VERIFY_TOKEN`
- `WHATSAPP_TOKEN`
- `PHONE_NUMBER_ID`

Strongly recommended:
- `APP_SECRET`
- `LOG_LEVEL`
- `WA_CHAT_SESSION_TTL_HOURS`

Neon note:
- Use a Neon connection string with `sslmode=require`.
- The backend now treats Neon connections as SSL-backed by default.

Render note:
- Set `NODE_ENV=production`.
- Point health checks to `/healthz`.
- Use `/readyz` for deeper readiness verification during manual checks.

## Frontend envs

Required on Vercel:
- `NEXT_PUBLIC_API_BASE`
- `NEXT_PUBLIC_INBOX_ACCESS_KEY`

Important:
- `NEXT_PUBLIC_*` values are inlined at build time. If you change them, trigger a rebuild.
- `NEXT_PUBLIC_API_BASE` must point to the public Render backend URL, not an internal hostname.

## Health and readiness

Backend endpoints:
- `/` basic identity response
- `/healthz` lightweight liveness check
- `/readyz` readiness check with database ping and config warning output

Use:
- Render health check: `/healthz`
- Operator or deployment verification: `/readyz`

## Logging and tracing

- Backend requests now emit a request id through `x-request-id`.
- Structured backend logging is available through the shared logger.
- When debugging webhook, payment, or order issues, capture:
  - request id
  - customer phone / wa_id
  - order id / order code
  - payment id

## Safe deploy sequence

1. Apply backend code.
2. Run database migrations.
3. Verify `/healthz`.
4. Verify `/readyz`.
5. Verify frontend build has the correct `NEXT_PUBLIC_API_BASE`.
6. Run the QA checklist before pointing production traffic at the release.

## Operational risks still worth watching

- `backend/src/routes/webhook.ts` and chat orchestration remain sensitive.
- `backend/src/routes/inbox.ts` is still a broad API surface.
- WhatsApp credentials can come from both DB-backed settings and env fallback, so mismatched values can create confusing behavior.
- Frontend cache is intentionally lightweight and in-memory. It improves revisit speed, but does not replace backend truth.
