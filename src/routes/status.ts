// src/routes/status.ts
import { Router, Request, Response, NextFunction } from "express";
import pino from "pino";
import {
  getOrdersSnapshot,
  getOrderById,
  listOrders,
  updateOrderStatus,
  setOrderNotes,
  __seedOrder,
  OrderStatus,
} from "../orders";

const log = pino({ name: "status" });
const router = Router();

/**
 * Optional Basic Auth for /status/* endpoints.
 * Enable by setting: STATUS_BASIC_AUTH="username:password"
 */
const BASIC = process.env.STATUS_BASIC_AUTH || "";
function requireStatusAuth(req: Request, res: Response, next: NextFunction) {
  if (!BASIC) return next(); // auth disabled
  const hdr = req.headers.authorization || "";
  if (!hdr.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="status"');
    return res.status(401).json({ ok: false, error: "auth_required" });
  }
  const creds = Buffer.from(hdr.slice(6), "base64").toString("utf8");
  if (creds !== BASIC) {
    return res.status(403).json({ ok: false, error: "forbidden" });
  }
  next();
}

router.use(requireStatusAuth);

// ---------------------------------------------------------------------------
// GET /status/health
router.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "ujani-status", ts: Date.now() });
});

// ---------------------------------------------------------------------------
// GET /status/orders
// Query params:
//   userId   - filter by customer phone (normalized wa_id)
//   status   - one of OrderStatus
//   since    - epoch ms or ISO date
//   until    - epoch ms or ISO date
//   detail=1 - return full orders (filtered) instead of a compact snapshot
router.get("/orders", (req: Request, res: Response) => {
  try {
    const { userId } = req.query as Record<string, string | undefined>;
    const statusStr = (req.query.status as string | undefined) || undefined;
    const detail = (req.query.detail as string | undefined) === "1";

    const since = parseDateLike(req.query.since as string | undefined);
    const until = parseDateLike(req.query.until as string | undefined);

    if (detail) {
      const filtered = listOrders({
        userId: userId || undefined,
        status: statusStr ? parseOrderStatus(statusStr) : undefined,
        since: since ?? undefined,
        until: until ?? undefined,
      });
      return res.json({ ok: true, count: filtered.length, orders: filtered });
    }

    // Snapshot view (fast, concise)
    const snap = getOrdersSnapshot();
    const filtered = snap.filter((o) => {
      if (userId && o.userId !== userId) return false;
      if (statusStr && o.status !== parseOrderStatus(statusStr)) return false;
      if (since != null && o.createdAt < since) return false;
      if (until != null && o.createdAt > until) return false;
      return true;
    });

    return res.json({ ok: true, count: filtered.length, orders: filtered });
  } catch (err: any) {
    log.error({ err }, "GET /status/orders failed");
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// ---------------------------------------------------------------------------
// GET /status/orders/:orderId
router.get("/orders/:orderId", (req: Request, res: Response) => {
  const { orderId } = req.params;
  const order = getOrderById(orderId);
  if (!order) return res.status(404).json({ ok: false, error: "not_found" });
  return res.json({ ok: true, order });
});

// ---------------------------------------------------------------------------
// PATCH /status/orders/:orderId/status   body: { status: "confirmed" | ... }
router.patch("/orders/:orderId/status", (req: Request, res: Response) => {
  const { orderId } = req.params;
  const { status } = (req.body || {}) as { status?: string };
  if (!status) return res.status(400).json({ ok: false, error: "missing_status" });

  const next = parseOrderStatus(status);
  if (!next) return res.status(400).json({ ok: false, error: "invalid_status" });

  const updated = updateOrderStatus(orderId, next);
  if (!updated) return res.status(404).json({ ok: false, error: "not_found" });

  return res.json({ ok: true, order: updated });
});

// ---------------------------------------------------------------------------
// PATCH /status/orders/:orderId/notes   body: { notes: string }
router.patch("/orders/:orderId/notes", (req: Request, res: Response) => {
  const { orderId } = req.params;
  const { notes } = (req.body || {}) as { notes?: string };
  if (typeof notes !== "string") {
    return res.status(400).json({ ok: false, error: "invalid_notes" });
  }
  const updated = setOrderNotes(orderId, notes);
  if (!updated) return res.status(404).json({ ok: false, error: "not_found" });

  return res.json({ ok: true, order: updated });
});

// ---------------------------------------------------------------------------
// (DEV only) POST /status/seed  -> create a fake order for testing UI
// Enable with STATUS_ENABLE_SEED=1
router.post("/seed", (req: Request, res: Response) => {
  if (process.env.STATUS_ENABLE_SEED !== "1") {
    return res.status(403).json({ ok: false, error: "seed_disabled" });
  }
  const order = __seedOrder(req.body || {});
  return res.json({ ok: true, order });
});

// ---------------------------------------------------------------------------
// helpers

function parseDateLike(v?: string): number | null {
  if (!v) return null;
  // epoch ms
  if (/^\d{10,13}$/.test(v)) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  // ISO
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function parseOrderStatus(s?: string): OrderStatus | undefined {
  if (!s) return undefined;
  const v = s.toLowerCase();
  switch (v) {
    case "created":
    case "confirmed":
    case "packed":
    case "dispatched":
    case "delivered":
    case "closed":
    case "cancelled":
      return v as OrderStatus;
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------

export const status = router;
export default router;
