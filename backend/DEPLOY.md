# Deploy (Render Free Tier)

1) **Create Web Service**
   - Repo: this project
   - Build command: `npm run build`
   - Start command: `npm start`
   - Instance: free

2) **Environment**
   - Add variables from `.env.example` / `ENV.md`.
   - Ensure `PUBLIC_BASE_URL` matches the Render URL.
   - Set `VERIFY_TOKEN`, `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `APP_SECRET`.
   - (Optional) Tune `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`.

3) **Webhook Setup (Meta)**
   - Callback URL: `https://<PUBLIC_BASE_URL>/webhook`
   - Verify Token: value of `VERIFY_TOKEN`
   - Subscribe to: messages, message template status, message status

4) **Logs & Health**
   - Health: GET `https://<PUBLIC_BASE_URL>/` should return `{ ok: true }`.
   - Logs: use Render dashboard; app logs with pino JSON.

5) **Next Steps**
   - Batch 1: delivery calculation + fallback
   - Batch 2: persistence
   - Batch 3: agent console
