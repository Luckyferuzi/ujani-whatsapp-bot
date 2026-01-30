# OmniFlow WhatsApp Inbox (Single-Company Deployment) — Runbook

This repo is a **WhatsApp Cloud API bot + team inbox + admin dashboard** (orders/products/payments/etc).

✅ **Current mode:** **Single-tenant** (one company per deployment + one database).  
✅ **Fast client delivery:** clone repo → new DB → new WhatsApp creds → new branding/catalog.  
🧠 Later, we can refactor to multi-tenant (one platform for many companies).

---

## Folder structure

- `backend/` — Node/TS API, WhatsApp webhook, DB, Socket.IO
- `web/` — Next.js admin dashboard (inbox, products, orders, payments, settings)
- `docker-compose.yml` — local stack (db + backend + web)

---

## Requirements

### For local dev (recommended)
- Node.js **20+**
- Postgres **16+**
- (Optional) Docker (for running Postgres easily)

### For production
- Public HTTPS domain for backend webhook
- Postgres database (Neon, RDS, VPS, etc.)

---

# NEW COMPANY RUNBOOK (copy/paste checklist ✅)

## 0) Create a new deployment
1. Copy this repo into a new folder (e.g. `client-acme-whatsapp/`)
2. Decide: separate deployment + separate DB **(recommended)**

## 1) Create fresh database (per client)
- Create a new Postgres DB (example: `omniflow_acme`)
- Keep credentials for `DATABASE_URL`

## 2) Generate secrets (per client)
Generate **INBOX_ACCESS_KEY** and **VERIFY_TOKEN** (do not reuse across clients):

```bash
# INBOX key (dashboard -> backend API protection)
openssl rand -hex 24

# Verify token (Meta webhook verification)
openssl rand -hex 16
```

## 3) Configure environment variables
Do either:
- **Option A (recommended): run backend+web locally, and use Docker only for DB**
- **Option B: run everything in Docker Compose**

Then proceed to migrations + admin setup.

## 4) Run DB migrations (required for new DB)
This project uses Knex migrations (TypeScript) located in `backend/migrations/`.

From `backend/`:
```bash
npm install
npm run migrate
```

## 5) Start services
- Backend: `npm run dev` (or `npm start` after build)
- Web: `npm install && npm run dev -- -p 3001`

## 6) Create first admin account (one-time)
Open:
- `http://localhost:3001/register-admin`

## 7) Setup Wizard (company + WhatsApp)
Open:
- `http://localhost:3001/setup`

Fill:
1) Company identity  
2) WhatsApp setup (Embedded Signup recommended, or manual token)  
3) Enable modules → Finish setup

## 8) Configure Meta Webhook (WhatsApp Cloud API)
- Callback URL: `https://YOUR_BACKEND_DOMAIN/webhook`
- Verify Token: must match your `VERIFY_TOKEN` (or the value saved in Setup Wizard)
- Subscribe events: **messages**, **message_status** (at least)

## 9) Configure bot menu + branding + catalog
In dashboard:
- **Settings**: WhatsApp Presence (menu intro/footer/button)
- **Products**: add/ import products and prices
- **Payments**: set payment labels / instructions (env-driven currently)

---

# OPTION A — Local dev (DB in Docker, app on host) ✅

## 1) Start Postgres in Docker
From repo root:
```bash
docker compose up -d db
```

This exposes Postgres on `localhost:${DB_PORT:-5432}`.

## 2) Backend env
Create: `backend/.env`

Start from:
- `backend/.env.example`

Minimum required keys:
```env
# Required
DATABASE_URL=postgres://USER:PASSWORD@localhost:5432/DBNAME
INBOX_ACCESS_KEY=change-me-long-random
PUBLIC_BASE_URL=http://localhost:3000
FRONTEND_ORIGIN=http://localhost:3001

# Delivery base pin (REQUIRED by backend config)
BASE_LAT=-6.8394
BASE_LNG=39.2744

# WhatsApp (required only when going live)
VERIFY_TOKEN=change-me
WHATSAPP_TOKEN=
PHONE_NUMBER_ID=
APP_SECRET=
```

Run:
```bash
cd backend
npm install
npm run migrate
npm run dev
```

Backend runs at:
- `http://localhost:3000`
- Health: `GET /` → `{ ok: true }`

## 3) Web env
Create: `web/.env.local` (or `web/.env`)

Start from:
- `web/.env.example`

```env
NEXT_PUBLIC_API_BASE=http://localhost:3000
NEXT_PUBLIC_INBOX_ACCESS_KEY=change-me-long-random
```

Run:
```bash
cd web
npm install
npm run dev -- -p 3001
```

Dashboard:
- `http://localhost:3001`

---

# OPTION B — Docker Compose (db + backend + web) ⚠️

Docker Compose is great for quick local preview, BUT:

**Important:** migrations are TypeScript and must be run from the host (Option A) or you must extend the docker setup to run migrations.

### Recommended Docker approach
1) Bring services up:
```bash
docker compose up -d --build
```

2) Run migrations from host (preferred):
```bash
cd backend
export DATABASE_URL="postgres://omniflow:omniflow_password@localhost:5432/omniflow"
npm install
npm run migrate
```

Then reload backend container if needed:
```bash
docker compose restart backend
```

---

# WhatsApp Cloud API setup (Manual)

You need:
- `WHATSAPP_TOKEN` (permanent access token recommended)
- `PHONE_NUMBER_ID`
- `APP_SECRET` (recommended for signature validation)
- `VERIFY_TOKEN` (you choose)

## Where to get values
### A) Permanent access token (recommended for production)
In Meta Business settings:
- Create **System User**
- Assign assets + permissions:
  - `whatsapp_business_messaging`
  - `whatsapp_business_management`
- Generate a **permanent access token** (store securely)

### B) Phone Number ID
In Meta Developer Dashboard:
- WhatsApp → API Setup → "From" section shows **Phone Number ID**

### C) App Secret (for webhook signature validation)
Meta App Dashboard:
- Settings → Basic → **App Secret**
Set it as `APP_SECRET`

## Webhook endpoint
Set in Meta Webhooks:
- Callback: `https://YOUR_BACKEND_DOMAIN/webhook`
- Verify Token: `VERIFY_TOKEN`
When Meta verifies, it calls:
- `GET /webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...`

---

# WhatsApp Embedded Signup (Coexistence linking) (Recommended)
If the client uses WhatsApp Business App and wants to link that number safely, use **Embedded Signup** from `/setup`.

High-level:
1) Create/Configure Meta App for Embedded Signup
2) Add OAuth Redirect URI:
   - `https://YOUR_WEB_DASHBOARD_DOMAIN/setup`
3) Get **Embedded Signup Configuration ID**
4) Put **App ID**, **App Secret**, **Verify Token**, **Config ID** into `/setup`
5) Click **Start Coexistence linking**

---

# Environment Variables (full reference)

## Root / docker-compose (optional)
```env
# Database container
POSTGRES_DB=omniflow
POSTGRES_USER=omniflow
POSTGRES_PASSWORD=omniflow_password
DB_PORT=5432

# Ports
BACKEND_PORT=3000
WEB_PORT=3001

# CORS / origins
FRONTEND_ORIGIN=http://localhost:3001

# Security (required)
INBOX_ACCESS_KEY=change-me-long-random
```

## Backend (`backend/.env`)
### Required for app to run
```env
DATABASE_URL=postgres://USER:PASSWORD@HOST/DB
INBOX_ACCESS_KEY=change-me-long-random
PUBLIC_BASE_URL=https://your-backend-domain
FRONTEND_ORIGIN=https://your-web-domain

# Delivery base pin (REQUIRED)
BASE_LAT=-6.8394
BASE_LNG=39.2744
```

### WhatsApp (required for going live)
```env
VERIFY_TOKEN=change-me
WHATSAPP_TOKEN=EAAG...
PHONE_NUMBER_ID=1234567890
APP_SECRET=your_meta_app_secret

# Optional overrides (if not stored in DB)
APP_ID=
GRAPH_API_VERSION=v19.0
WABA_ID=
WHATSAPP_EMBEDDED_CONFIG_ID=
WHATSAPP_SOLUTION_ID=
BUSINESS_WA_NUMBER_E164=+2557...
```

### Payments (optional)
```env
LIPA_NAMBA_TILL=
LIPA_NAMBA_NAME=

VODA_LNM_TILL=
VODA_LNM_NAME=

VODA_P2P_MSISDN=
VODA_P2P_NAME=
```

### Delivery controls (optional)
```env
SERVICE_RADIUS_KM=0
REQUIRE_LOCATION_PIN=false
DELIVERY_RATE_PER_KM=1000
DELIVERY_ROUND_TO=500
DEFAULT_DISTANCE_KM=8
```

## Web (`web/.env.local`)
```env
NEXT_PUBLIC_API_BASE=https://your-backend-domain
NEXT_PUBLIC_INBOX_ACCESS_KEY=change-me-long-random
```

⚠️ Note: `NEXT_PUBLIC_*` is inlined at build time for Docker builds. If you change `NEXT_PUBLIC_INBOX_ACCESS_KEY`, rebuild the web container.

---

# Branding / content changes (quick notes)

✅ Can be changed from dashboard:
- Company name
- WhatsApp Presence (menu intro/footer/button text)
- Products + pricing + stock
- Modules enabled

⚠️ Some conversation/product copy is hard-coded in backend:
- `backend/src/i18n.ts`
- `backend/src/routes/webhook.ts`
If you want **everything** editable from DB, refactor those to read product fields and settings.

---

# Troubleshooting

## Webhook verification fails
- Ensure `PUBLIC_BASE_URL` is correct and HTTPS in production
- Ensure Meta Verify Token matches `VERIFY_TOKEN` (or value saved in Setup Wizard)

## Dashboard shows 401 unauthorized
- Backend `INBOX_ACCESS_KEY` must match web `NEXT_PUBLIC_INBOX_ACCESS_KEY`
- If running web in Docker: rebuild web after changing key

## Bot not replying
- Wrong `WHATSAPP_TOKEN` or `PHONE_NUMBER_ID`
- Ensure Meta app subscribed to WABA events and webhook is reachable

---

# Security notes
- Never commit `.env` files
- Each client must have separate:
  - `DATABASE_URL` / DB
  - `INBOX_ACCESS_KEY`
  - `VERIFY_TOKEN`
  - WhatsApp token / phone number
