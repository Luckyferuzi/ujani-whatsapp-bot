// backend/src/server.ts

import express from "express";
import cors from "cors";
import { createServer } from "http";
import helmet from "helmet";

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
import { auditEventsRoutes } from "./routes/auditEvents.js";
import { adminGovernanceRoutes } from "./routes/adminGovernance.js";
import { requireAdmin, requireSession } from "./middleware/sessionAuth.js";
import db from "./db/knex.js";
import { env, ensureProductionReadiness, getConfigDiagnostics } from "./config.js";
import { httpLogger, logger } from "./logger.js";

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

const startupDiagnostics = ensureProductionReadiness();
for (const warning of startupDiagnostics.warnings) {
  logger.warn({ warning }, "[startup] configuration warning");
}

// Warm the company settings cache on startup so WhatsApp config can be read
// synchronously from src/whatsapp.ts.
await loadCompanySettingsToCache().catch((err) => {
  logger.warn({ err }, "[startup] failed to load company_settings; using env/defaults");
});

await db.raw("select 1 as ok");

app.use(httpLogger);
app.use((req, res, next) => {
  res.setHeader("x-request-id", String((req as any).id ?? ""));
  next();
});

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

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
    origin: env.FRONTEND_ORIGIN || true,
    credentials: true,
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

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "ujani-backend" });
});

app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "ujani-backend",
    environment: env.NODE_ENV,
    platform: {
      render: Boolean(process.env.RENDER),
    },
  });
});

app.get("/readyz", async (_req, res) => {
  try {
    await db.raw("select 1 as ok");
    const diagnostics = getConfigDiagnostics();
    res.json({
      ok: diagnostics.errors.length === 0,
      database: "ok",
      config: {
        warnings: diagnostics.warnings,
      },
    });
  } catch (err) {
    logger.error({ err }, "[readyz] readiness probe failed");
    res.status(503).json({
      ok: false,
      database: "unavailable",
    });
  }
});

app.use(webhook);
app.use("/auth", authRoutes);
app.use("/auth/admin", requireSession, requireAdmin, adminGovernanceRoutes);
app.use("/files", filesRoutes);
app.use("/settings", whatsappProfilePhotoRoutes);
app.use("/public", publicMediaRoutes);
app.use("/settings", settingsRoutes);
app.use("/api", requireInboxAuth, companyRoutes);
app.use("/api", requireInboxAuth, auditEventsRoutes);
app.use("/api", requireInboxAuth, embeddedSignupRoutes);
app.use("/api",requireInboxAuth, inboxRoutes);
app.use("/api",requireInboxAuth, sendRoutes);

app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log?.error?.({ err }, "unhandled request error");
  if (res.headersSent) return;
  res.status(500).json({
    error: "internal_server_error",
    request_id: req.id,
  });
});

/**
 * HTTP server + Socket.IO
 * Socket server is attached via attachSockets, which sets up the
 * internal `io` used by emit(...) from src/sockets.ts.
 */
const httpServer = createServer(app);
attachSockets(httpServer, [
  env.FRONTEND_ORIGIN || "*",
]);

const port = env.PORT;
httpServer.listen(port, () => {
  logger.info(
    {
      port,
      frontendOrigin: env.FRONTEND_ORIGIN || null,
      publicBaseUrl: env.PUBLIC_BASE_URL || null,
      neon: env.DATABASE_URL.includes("neon.tech"),
      render: Boolean(process.env.RENDER),
    },
    "API listening"
  );
});
