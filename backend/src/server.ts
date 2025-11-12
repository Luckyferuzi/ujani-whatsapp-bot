import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server } from "socket.io";

// keep your original exports and mount points:
import { webhook } from "./routes/webhook.js";     // exported as 'webhook' in your ZIP
import { inboxRoutes } from "./routes/inbox.js";   // export name preserved
import { sendRoutes } from "./routes/send.js";     // export name preserved

const app = express();
app.use(express.json({ limit: "5mb" }));

// if you want to restrict, replace 'true' with your frontend origin(s)
app.use(cors({ origin: true }));

// healthcheck
app.get("/health", (_req, res) => res.json({ ok: true }));

// mount webhook EXACTLY at '/', per your original setup
app.use("/", webhook);

// mount API routers (unchanged base)
app.use("/api", inboxRoutes);
app.use("/api", sendRoutes);

// socket.io
const http = createServer(app);
const io = new Server(http, { cors: { origin: true } });

// make io available to routes for emits (payment.updated, message.created, etc.)
app.set("io", io);

const port = process.env.PORT ?? 3000;
http.listen(port, () => {
  console.log(`API listening on ${port}`);
});
