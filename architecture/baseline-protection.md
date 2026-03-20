# Ujani Baseline Protection

This document is the baseline protection layer for controlled upgrades. It describes the current architecture, the flows that must not break, the highest-risk modules, and the boundaries for safe refactor work.

## Current app layers

### Backend
- `backend/src/server.ts`
  Boots Express, captures raw JSON bodies for webhook signature verification, mounts the public WhatsApp webhook, then mounts authenticated admin APIs and Socket.IO.
- `backend/src/routes/webhook.ts`
  Thin webhook transport/controller. It verifies Meta requests, handles top-level webhook payload iteration, and delegates business flow decisions to chat orchestration helpers.
- `backend/src/services/chat/webhookProcessor.ts`
  Conversation orchestration entry point. Handles inbound persistence, light idempotency, agent handoff gating, interactive selection routing, quantity prompts, and flow/session dispatch.
- `backend/src/services/chat/transport.ts`
  WhatsApp-safe outbound transport helpers that send messages and keep inbox logging/socket side effects aligned.
- `backend/src/services/chat/sessionState.ts`
  Small chat-state adapter over the durable Postgres session store for flow, cart, contact, and pending-item helpers.
- `backend/src/db/queries.ts`
  Persistence helpers for customers, conversations, messages, orders, payments, incomes, and WhatsApp number tracking. This file also consolidates duplicate customers/conversations.
- `backend/src/whatsapp.ts`
  WhatsApp Cloud API adapter. Handles send operations, media access, runtime credential lookup, signature verification, and multi-number reply routing.
- `backend/src/menu.ts`
  Product/menu composition. Mixes DB-backed product catalog behavior with fallback/static product assumptions and product action IDs used by the webhook.
- `backend/src/session.ts`
  Durable Postgres-backed session state used by chatbot checkout/payment proof steps.
- `backend/src/delivery.ts`
  Delivery fee and service-radius math driven by environment/runtime config.
- `backend/src/routes/inbox.ts`
  Authenticated admin API for conversations, orders, payments, products, and stats.
- `backend/src/routes/company.ts`
  Setup/runtime configuration surface used by the web `/setup` page.
- `backend/src/runtime/companySettings.ts`
  Single-business configuration cache for company identity, business-owned chatbot copy, WhatsApp credentials, and editable payment rails.

### Frontend
- `web/app/inbox/page.tsx`
  Conversation shell for the live inbox. Depends on `/api/conversations`, `/api/conversations/:id/messages`, summary endpoints, and socket events.
- `web/app/orders/page.tsx`
  Order operations UI over `/api/orders`, `/api/orders/:id/items`, `/api/orders/manual`, and order status mutation routes.
- `web/app/products/page.tsx`
  Product CRUD and stock management over `/api/products` plus `products.updated` socket refresh.
- `web/app/setup/page.tsx`
  Setup/control plane over `/api/company/settings`, `/api/company/runtime-config`, setup diagnostics, test-send, complete, and reconciliation routes.
- `web/app/stats/page.tsx`
  Read-only dashboard over `/api/stats/*`.

## Business-critical flows that must not break

### 1. Inbound WhatsApp message handling
- Entry point: `POST /webhook` in `backend/src/routes/webhook.ts`
- Depends on raw request body capture in `backend/src/server.ts`
- Required invariants:
  - Signature verification must keep working when `APP_SECRET` is configured.
  - Inbound messages must still be persisted to `customers`, `conversations`, and `messages`.
  - Replies must continue using the correct `phone_number_id` for multi-number setups.
  - Admin inbox realtime events must still emit on message create and conversation update.

### 2. Menu/product navigation
- Primary modules: `backend/src/menu.ts`, `backend/src/routes/webhook.ts`
- Required invariants:
  - Existing action IDs must remain stable.
  - DB-backed products and discount formatting must still render into WhatsApp-safe lists/buttons.
  - Product details and variant navigation must preserve current IDs and response ordering.

### 3. Order creation
- Primary modules: `backend/src/routes/webhook.ts`, `backend/src/db/queries.ts`
- Required invariants:
  - Checkout still creates one `orders` row, related `order_items`, an initial `payments` row, and an `incomes` row through `createOrderWithPayment`.
  - Session/cart context must remain aligned with the just-created order id for later payment selection and proof submission.
  - Customer-facing order code messaging must remain intact.

### 4. Delivery fee / fulfillment flow
- Primary modules: `backend/src/delivery.ts`, `backend/src/routes/webhook.ts`, `backend/src/routes/inbox.ts`
- Required invariants:
  - Dar delivery fee math and service radius checks must stay stable unless intentionally repriced.
  - GPS/location path and outside-Dar flat-fee path must continue to produce valid order totals.
  - Admin-side status changes must keep emitting updates and customer notifications.

### 5. Payment proof submission and verification
- Primary modules: `backend/src/routes/webhook.ts`, `backend/src/payments.ts`, `backend/src/routes/inbox.ts`
- Required invariants:
  - Manual payment selection must still route to `WAIT_PROOF`.
  - Proof-by-text acceptance remains restricted to two or three names.
  - Admin payment verification via `/api/payments/:id/status` must continue updating payments and customer notifications.

### 6. Conversation/inbox workflow
- Primary modules: `backend/src/routes/inbox.ts`, `backend/src/routes/webhook.ts`, `web/app/inbox/page.tsx`
- Required invariants:
  - Messages logged by bot and humans must remain visible in one thread.
  - `agent_allowed` handoff between bot and human must keep suppressing/resuming bot responses.
  - Reconciliation must not duplicate or orphan conversations for the same customer number.

### 7. Setup and business settings flow
- Primary modules: `backend/src/routes/company.ts`, `backend/src/runtime/companySettings.ts`, `web/app/setup/page.tsx`
- Required invariants:
  - Setup page must continue saving company settings and runtime values without requiring code edits.
  - Test-send, diagnostics, and contact reconciliation must remain available to operators.
  - Legacy env fallback behavior must continue working when DB settings are incomplete.

## High-risk files

### Very high risk
- `backend/src/routes/webhook.ts`
  Single-file state machine and orchestration center for chatbot, order, payment, agent handoff, and inbox side effects.
- `backend/src/db/queries.ts`
  Central write path for orders/messages/customers plus duplicate reconciliation logic.
- `backend/src/routes/inbox.ts`
  Large mixed-responsibility admin API covering conversations, payments, orders, products, and stats.

### High risk
- `backend/src/whatsapp.ts`
  Multi-number behavior, token resolution, and all outbound WhatsApp API calls live here.
- `backend/src/routes/company.ts`
  Runtime configuration affects almost every live flow.
- `web/app/inbox/page.tsx`
  Sensitive to API shape and socket event timing.

## Current technical debt

- `webhook.ts` is thinner now, but the flow helpers it depends on still contain dense branching and coupled business rules.
- `inbox.ts` is also oversized and mixes multiple admin domains in one route file.
- Chatbot session state is durable now, but expiry/reset behavior is still sensitive around in-progress checkout/proof flows.
- Some business rules are duplicated in route-level code instead of isolated domain helpers.
- Static/fallback product assumptions still coexist with DB-backed catalog behavior.
- Setup/runtime values are partly DB-backed and partly env-backed, which increases edge-case surface area.
- Business-specific copy is cleaner than before, but product descriptions, fallback catalog products, and some status/tracking wording still live in code or base i18n entries.

## Safe refactor boundaries

### Safe now
- Add tests around pure helpers and route-adjacent validation logic.
- Add documentation and comments clarifying invariants.
- Extract pure formatting/validation helpers out of `webhook.ts` if behavior is preserved exactly.
- Add non-invasive runtime guards that fail early on clearly invalid configuration or payloads.

### Use caution
- Splitting `webhook.ts` into smaller modules is reasonable, but only behind behavior-preserving helper extraction with regression coverage first.
- Keep the route layer limited to verification, payload iteration, and dispatch into `backend/src/services/chat/webhookProcessor.ts`.
- New chat-domain extraction should prefer service modules under `backend/src/services/chat/*` rather than pushing more logic back into route files.
- Splitting `inbox.ts` by domain is reasonable, but keep response shapes, route paths, and socket event names stable.
- Cleaning up customer/conversation reconciliation requires DB fixture coverage before any algorithm change.

### Do not change without explicit flow testing
- WhatsApp action IDs, button/list payload composition, and proof-step transitions.
- Order creation side effects in `createOrderWithPayment`.
- `agent_allowed` semantics.
- Payment status vocabulary used by both customer-facing messages and admin UI.
- Setup/runtime config key names consumed by the web app.

## Do-not-break checklist

- Before changing `server.ts`, confirm raw-body capture still works for webhook signature validation.
- Before changing `webhook.ts`, trace inbound message -> persistence -> reply -> socket emit.
- Keep WhatsApp interactive payloads within platform limits.
- Preserve all action IDs and session state transitions unless a migration plan exists.
- Confirm order creation still writes `orders`, `order_items`, `payments`, and `incomes`.
- Confirm payment proof still supports both media proof and 2-3 name text proof.
- Confirm `agent_allowed` still blocks bot replies during human takeover.
- Confirm `/api/conversations`, `/api/orders`, `/api/products`, `/api/company/settings`, and `/api/setup/*` response shapes remain compatible with the current frontend.
- Confirm multi-number reply routing still uses the correct `phone_number_id`.
- Confirm order/payment/customer status changes still emit the socket events consumed by the web app.

## Added baseline regression protection

- Backend tests now cover:
  - session lifecycle safeguards
  - in-memory order math and proof status behavior
  - delivery fee rounding and service radius checks
  - payment instruction rendering
  - WhatsApp message/list/button safety normalization
  - manual proof text validation

These tests are not full integration coverage, but they establish a baseline around the pure business rules that are easiest to accidentally break during refactor.

## Production readiness note

- Production deployment assumptions now target Neon + Render + Vercel explicitly.
- Backend startup should fail early on missing critical configuration rather than booting into a half-working state.
- Health endpoints and request ids should be treated as part of normal operations and incident debugging.
- See `OPERATIONS.md` and `architecture/final-qa-checklist.md` before production deploys.

## Durable chat session note

- Chatbot conversational state is now intended to live in Postgres via a dedicated `chat_sessions` table, not in process memory.
- This state should stay temporary and thin: flow step, language preference, cart/pending item context, contact prompt progress, and proof/checkout context.
- Orders, payments, customers, conversations, and inbox messages remain the business source of truth and should not be migrated into chat session payloads.

## Operator context note

- Business timeline visibility now builds on `order_events` plus synthetic conversation lifecycle markers and internal notes.
- Internal notes are stored in `internal_notes` and are operator-only by design. They are never sent through WhatsApp transport.
- The intended operator surfaces are the inbox right panel and order detail sidebar; this is not a CRM expansion and should stay operationally focused.
- Historical timeline coverage is best for records created after the new event hardening work. Older rows may appear with thinner history until new activity happens.
