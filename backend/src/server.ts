// backend/src/server.ts

import express from "express";
import cors from "cors";
import { createServer } from "http";

import { webhook } from "./routes/webhook.js";
import { inboxRoutes } from "./routes/inbox.js";
import { sendRoutes } from "./routes/send.js";
import { attachSockets } from "./sockets.js";

const app = express();

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
app.use(webhook);
app.use("/api", inboxRoutes);
app.use("/api", sendRoutes);

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
