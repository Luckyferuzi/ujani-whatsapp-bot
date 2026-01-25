// backend/src/server.ts

import express from "express";
import cors from "cors";
import { createServer } from "http";

import { webhook } from "./routes/webhook.js";
import { inboxRoutes } from "./routes/inbox.js";
import { sendRoutes } from "./routes/send.js";
import { attachSockets } from "./sockets.js";
import { requireInboxAuth } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { settingsRoutes } from "./routes/settings.js";
import path from "path";
import { filesRoutes, publicMediaRoutes } from "./routes/files.js";
import { whatsappProfilePhotoRoutes } from "./routes/whatsappProfilePhoto.js";
import { companyRoutes } from "./routes/company.js";
import { embeddedSignupRoutes } from "./routes/embeddedSignup.js";
import { loadCompanySettingsToCache } from "./runtime/companySettings.js";

const app = express();

// Warm the company settings cache on startup so WhatsApp config can be read
// synchronously from src/whatsapp.ts.
await loadCompanySettingsToCache().catch((err) => {
  console.warn("[startup] failed to load company_settings; using env/defaults", err);
});

/**
 * Capture raw body for ALL JSON requests so verifySignature(req)
 * in routes/webhook.ts can read req.rawBody.
 */
app.use(
  express.json({
    limit: "5mb",
    verify: (req, _res, buf) => {
      // store raw body buffer on the request object
      (req as any).rawBody = buf;
    },
  })
);

/**
 * CORS
 * - In production, replace `true` with your frontend origin(s),
 *   e.g. ["https://ujani-admin.vercel.app"]
 */
app.use(
  cors({
    origin: process.env.FRONTEND_ORIGIN || true,
  })
);

/**
 * Routes
 *
 * webhook router defines:
 *   GET  /webhook  (verification from Meta dashboard)
 *   POST /webhook  (incoming messages)
 *
 * inboxRoutes + sendRoutes go under /api/*
 */
// Serve uploaded files
app.use(
  "/uploads",
  express.static(path.resolve(process.cwd(), "uploads"))
);

app.use(webhook);
app.use("/auth", authRoutes);
app.use("/files", filesRoutes);
app.use("/settings", whatsappProfilePhotoRoutes);
app.use("/public", publicMediaRoutes);
app.use("/settings", settingsRoutes);
app.use("/api", requireInboxAuth, companyRoutes);
app.use("/api", requireInboxAuth, embeddedSignupRoutes);
app.use("/api",requireInboxAuth, inboxRoutes);
app.use("/api",requireInboxAuth, sendRoutes);

/**
 * HTTP server + Socket.IO
 * Socket server is attached via attachSockets, which sets up the
 * internal `io` used by emit(...) from src/sockets.ts.
 */
const httpServer = createServer(app);
attachSockets(httpServer, [
  process.env.FRONTEND_ORIGIN || "*",
]);

const port = Number(process.env.PORT || 3000);
httpServer.listen(port, () => {
  console.log(`API listening on ${port}`);
});
