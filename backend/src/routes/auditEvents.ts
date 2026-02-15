import { Router } from "express";
import { getJsonSetting } from "../db/settings.js";

export const auditEventsRoutes = Router();

export type AuditEventRow = {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_user_id: number | null;
  actor_email: string | null;
  metadata_json: any;
  created_at: string;
};

const AUDIT_KEY = "audit_events";

export async function appendAuditEvent(event: Omit<AuditEventRow, "id" | "created_at">) {
  const items = await getJsonSetting<AuditEventRow[]>(AUDIT_KEY, []);
  const maxId = items.reduce((m, x) => (x.id > m ? x.id : m), 0);
  const next: AuditEventRow = {
    id: maxId + 1,
    created_at: new Date().toISOString(),
    ...event,
  };

  const out = [...items, next].slice(-2000);
  // lazy import avoids circular coupling in tests
  const { setJsonSetting } = await import("../db/settings.js");
  await setJsonSetting(AUDIT_KEY, out);
  return next;
}

auditEventsRoutes.get("/audit-events", async (req, res) => {
  const action = String(req.query.action ?? "").trim();
  const entityType = String(req.query.entity_type ?? "").trim();
  const limitRaw = Number(req.query.limit ?? 100);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 100;

  const items = await getJsonSetting<AuditEventRow[]>(AUDIT_KEY, []);

  const filtered = items
    .filter((e) => (action ? e.action === action : true))
    .filter((e) => (entityType ? e.entity_type === entityType : true))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, limit);

  return res.json({ ok: true, events: filtered });
});

