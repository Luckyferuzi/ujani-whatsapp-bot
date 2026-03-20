# Final QA Checklist

Use this checklist before production deploys or after any risky change.

## Platform checks

- Backend `/healthz` returns `200`.
- Backend `/readyz` returns `200` and database is `ok`.
- Frontend points to the correct backend via `NEXT_PUBLIC_API_BASE`.
- Render backend and Vercel frontend are using the same `INBOX_ACCESS_KEY` pair (`backend` and `NEXT_PUBLIC_INBOX_ACCESS_KEY`).
- Latest migrations have been applied to Neon.

## Core chatbot flow

- Send a WhatsApp greeting and confirm the bot replies normally.
- Open menu/catalog navigation and confirm product actions still work.
- Confirm interactive list/button replies still route correctly.
- Confirm agent handoff still suppresses bot replies.
- Confirm return-to-bot flow still resumes chatbot behavior.

## Order flow

- Create an order from chatbot flow.
- Confirm order row is created with order items.
- Confirm order appears in inbox context and orders console.
- Confirm delivery fee behavior still matches within-radius / outside-radius expectations.

## Payment flow

- Choose a payment option from chatbot flow.
- Submit payment proof by supported method.
- Verify operator can mark payment as verifying and then paid.
- Confirm payment and order statuses stay aligned after review.

## Inbox and operator workflow

- New inbound message appears in inbox.
- Conversation thread loads correctly.
- Right-side order/payment context loads correctly.
- Internal note can be added and stays internal only.
- Timeline entries still appear for recent business activity.

## Setup and business settings

- Setup page loads current company settings.
- Save settings and confirm they persist.
- Run diagnostics and confirm results render.
- Test-send succeeds when WhatsApp credentials are configured.

## Reporting and admin pages

- Dashboard loads without blank/error state.
- Orders, products, incomes, expenses, and stats pages load correctly.
- Page revisits show warm data and then refresh cleanly.

## Sensitive regressions to watch

- Webhook signature validation failures
- Duplicate inbound processing
- Missing order/payment socket updates
- Product catalog import/update mismatches
- Wrong frontend API base after Vercel build
