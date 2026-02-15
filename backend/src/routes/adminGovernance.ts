import { Router } from "express";
import db from "../db/knex.js";
import { getJsonSetting, setJsonSetting } from "../db/settings.js";
import { appendAuditEvent } from "./auditEvents.js";

export const adminGovernanceRoutes = Router();

type ApprovalStatus = "pending" | "approved" | "rejected" | "failed";

type ApprovalRow = {
  id: number;
  action_key: string;
  status: ApprovalStatus;
  note: string | null;
  payload_json: any;
  requested_at: string;
  requested_by_email: string | null;
  approved_by_email: string | null;
  rejected_by_email: string | null;
  execution_error: string | null;
};

type RetentionState = {
  message_retention_days: number | null;
  retention_mode: "redact" | "delete";
  retention_last_run_at: string | null;
};

const APPROVALS_KEY = "admin_approvals";
const RETENTION_KEY = "retention_settings";

const DEFAULT_RETENTION: RetentionState = {
  message_retention_days: null,
  retention_mode: "redact",
  retention_last_run_at: null,
};

function csvEscape(v: unknown): string {
  const s = String(v ?? "");
  return `"${s.replace(/"/g, '""')}"`;
}

async function getApprovals() {
  return getJsonSetting<ApprovalRow[]>(APPROVALS_KEY, []);
}

async function saveApprovals(items: ApprovalRow[]) {
  await setJsonSetting(APPROVALS_KEY, items.slice(-2000));
}

async function createApproval(args: {
  action_key: string;
  payload_json: any;
  note?: string | null;
  requested_by_email?: string | null;
}) {
  const items = await getApprovals();
  const maxId = items.reduce((m, x) => (x.id > m ? x.id : m), 0);

  const row: ApprovalRow = {
    id: maxId + 1,
    action_key: args.action_key,
    status: "pending",
    note: args.note ?? null,
    payload_json: args.payload_json ?? {},
    requested_at: new Date().toISOString(),
    requested_by_email: args.requested_by_email ?? null,
    approved_by_email: null,
    rejected_by_email: null,
    execution_error: null,
  };

  await saveApprovals([...items, row]);
  return row;
}

async function runRetention(mode: "redact" | "delete", days: number) {
  const now = Date.now();
  const cutoff = new Date(now - days * 24 * 60 * 60 * 1000).toISOString();

  if (mode === "delete") {
    const affected = await db("messages").where("created_at", "<", cutoff).del();
    return affected;
  }

  const affected = await db("messages")
    .where("created_at", "<", cutoff)
    .whereNotNull("body")
    .update({ body: "[REDACTED]" });
  return affected;
}

async function executeApproval(actionKey: string, payload: any) {
  if (actionKey === "inventory.adjust_available") {
    const productId = Number(payload?.product_id);
    const available = Number(payload?.available);
    if (!Number.isFinite(productId) || !Number.isFinite(available)) {
      throw new Error("invalid_inventory_adjust_payload");
    }

    await db("products")
      .where({ id: productId })
      .update({ stock_qty: Math.max(0, Math.floor(available)), updated_at: db.fn.now() });
    return;
  }

  if (actionKey === "retention.enable_delete") {
    const current = await getJsonSetting<RetentionState>(RETENTION_KEY, DEFAULT_RETENTION);
    await setJsonSetting(RETENTION_KEY, { ...current, retention_mode: "delete" });
    return;
  }

  if (actionKey === "retention.run_delete") {
    const current = await getJsonSetting<RetentionState>(RETENTION_KEY, DEFAULT_RETENTION);
    const days = Number(current.message_retention_days ?? 0);
    if (!Number.isFinite(days) || days <= 0) {
      throw new Error("retention_days_not_configured");
    }
    const affected = await runRetention("delete", days);
    await setJsonSetting(RETENTION_KEY, {
      ...current,
      retention_last_run_at: new Date().toISOString(),
    });
    await appendAuditEvent({
      action: "retention.run_delete",
      entity_type: "retention",
      entity_id: null,
      actor_user_id: null,
      actor_email: null,
      metadata_json: { affected, days },
    });
    return;
  }
}

adminGovernanceRoutes.get("/approvals", async (req, res) => {
  const status = String(req.query.status ?? "").trim();
  const limitRaw = Number(req.query.limit ?? 100);
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.floor(limitRaw))) : 100;

  const items = await getApprovals();
  const filtered = items
    .filter((x) => (status ? x.status === status : true))
    .sort((a, b) => (a.requested_at < b.requested_at ? 1 : -1))
    .slice(0, limit);

  return res.json({ ok: true, approvals: filtered });
});

adminGovernanceRoutes.post("/approvals", async (req, res) => {
  const actionKey = String(req.body?.action_key ?? "").trim();
  const payload = req.body?.payload ?? {};
  const note = typeof req.body?.note === "string" ? req.body.note : null;
  const actor = (req as any).user?.email ?? null;

  if (!actionKey) {
    return res.status(400).json({ error: "action_key_required" });
  }

  const approval = await createApproval({
    action_key: actionKey,
    payload_json: payload,
    note,
    requested_by_email: actor,
  });

  await appendAuditEvent({
    action: "approval.created",
    entity_type: "approval",
    entity_id: String(approval.id),
    actor_user_id: (req as any).user?.id ?? null,
    actor_email: actor,
    metadata_json: { action_key: actionKey },
  });

  return res.status(201).json({ ok: true, approval });
});

adminGovernanceRoutes.post("/approvals/:id/approve", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

  const items = await getApprovals();
  const idx = items.findIndex((x) => x.id === id);
  if (idx < 0) return res.status(404).json({ error: "approval_not_found" });

  const row = items[idx];
  if (row.status !== "pending") {
    return res.status(400).json({ error: "approval_not_pending" });
  }

  try {
    await executeApproval(row.action_key, row.payload_json);
    row.status = "approved";
    row.approved_by_email = (req as any).user?.email ?? null;
    row.execution_error = null;
  } catch (e: any) {
    row.status = "failed";
    row.execution_error = e?.message ?? "execution_failed";
  }

  items[idx] = row;
  await saveApprovals(items);

  await appendAuditEvent({
    action: "approval.approved",
    entity_type: "approval",
    entity_id: String(row.id),
    actor_user_id: (req as any).user?.id ?? null,
    actor_email: (req as any).user?.email ?? null,
    metadata_json: { status: row.status, action_key: row.action_key, execution_error: row.execution_error },
  });

  return res.json({ ok: true, approval: row });
});

adminGovernanceRoutes.post("/approvals/:id/reject", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid_id" });

  const items = await getApprovals();
  const idx = items.findIndex((x) => x.id === id);
  if (idx < 0) return res.status(404).json({ error: "approval_not_found" });

  const row = items[idx];
  if (row.status !== "pending") {
    return res.status(400).json({ error: "approval_not_pending" });
  }

  row.status = "rejected";
  row.rejected_by_email = (req as any).user?.email ?? null;
  if (typeof req.body?.note === "string") row.note = req.body.note;
  items[idx] = row;
  await saveApprovals(items);

  await appendAuditEvent({
    action: "approval.rejected",
    entity_type: "approval",
    entity_id: String(row.id),
    actor_user_id: (req as any).user?.id ?? null,
    actor_email: (req as any).user?.email ?? null,
    metadata_json: { action_key: row.action_key },
  });

  return res.json({ ok: true, approval: row });
});

adminGovernanceRoutes.get("/retention", async (_req, res) => {
  const settings = await getJsonSetting<RetentionState>(RETENTION_KEY, DEFAULT_RETENTION);
  return res.json(settings);
});

adminGovernanceRoutes.put("/retention", async (req, res) => {
  const daysRaw = req.body?.message_retention_days;
  const modeRaw = String(req.body?.retention_mode ?? "redact").trim();
  const mode = modeRaw === "delete" ? "delete" : "redact";

  const days =
    daysRaw === null || daysRaw === undefined || daysRaw === ""
      ? null
      : Math.max(1, Math.min(3650, Math.floor(Number(daysRaw))));

  const current = await getJsonSetting<RetentionState>(RETENTION_KEY, DEFAULT_RETENTION);

  if (mode === "delete" && current.retention_mode !== "delete") {
    const approval = await createApproval({
      action_key: "retention.enable_delete",
      payload_json: {},
      note: "Enable delete retention mode",
      requested_by_email: (req as any).user?.email ?? null,
    });
    return res.status(409).json({ error: "approval_required", approval_id: approval.id });
  }

  const next: RetentionState = {
    message_retention_days: days,
    retention_mode: mode,
    retention_last_run_at: current.retention_last_run_at ?? null,
  };
  await setJsonSetting(RETENTION_KEY, next);

  await appendAuditEvent({
    action: "retention.saved",
    entity_type: "retention",
    entity_id: null,
    actor_user_id: (req as any).user?.id ?? null,
    actor_email: (req as any).user?.email ?? null,
    metadata_json: next,
  });

  return res.json({ ok: true, settings: next });
});

adminGovernanceRoutes.post("/retention/run", async (req, res) => {
  const current = await getJsonSetting<RetentionState>(RETENTION_KEY, DEFAULT_RETENTION);
  const days = Number(current.message_retention_days ?? 0);
  if (!Number.isFinite(days) || days <= 0) {
    return res.status(400).json({ error: "retention_days_not_configured" });
  }

  if (current.retention_mode === "delete") {
    const approval = await createApproval({
      action_key: "retention.run_delete",
      payload_json: {},
      note: "Run retention delete now",
      requested_by_email: (req as any).user?.email ?? null,
    });
    return res.status(409).json({ error: "approval_required", approval_id: approval.id });
  }

  const affected = await runRetention("redact", days);
  const next: RetentionState = {
    ...current,
    retention_last_run_at: new Date().toISOString(),
  };
  await setJsonSetting(RETENTION_KEY, next);

  await appendAuditEvent({
    action: "retention.run_redact",
    entity_type: "retention",
    entity_id: null,
    actor_user_id: (req as any).user?.id ?? null,
    actor_email: (req as any).user?.email ?? null,
    metadata_json: { affected, days },
  });

  return res.json({ ok: true, affected, mode: "redact" });
});

adminGovernanceRoutes.get("/exports/:kind.csv", async (req, res) => {
  const kind = String(req.params.kind ?? "").trim();
  let header: string[] = [];
  let rows: Array<Record<string, any>> = [];

  if (kind === "contacts") {
    header = ["id", "wa_id", "name", "phone", "lang", "created_at"];
    rows = await db("customers").select(header);
  } else if (kind === "conversations") {
    header = ["id", "customer_id", "phone_number_id", "agent_allowed", "last_user_message_at", "created_at"];
    rows = await db("conversations").select(header);
  } else if (kind === "orders") {
    header = ["id", "order_code", "customer_id", "status", "delivery_mode", "total_tzs", "created_at"];
    rows = await db("orders").select(header);
  } else if (kind === "inventory_history") {
    // Fallback snapshot export until a dedicated stock movement table exists.
    header = ["id", "sku", "name", "stock_qty", "updated_at"];
    rows = await db("products").select(header);
  } else if (kind === "audit") {
    header = ["id", "created_at", "action", "entity_type", "entity_id", "actor_email", "metadata_json"];
    rows = await getJsonSetting<any[]>("audit_events", []);
  } else {
    return res.status(404).json({ error: "unknown_export_kind" });
  }

  const lines = [
    header.join(","),
    ...rows.map((row) => header.map((k) => csvEscape(row?.[k])).join(",")),
  ];

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${kind}.csv"`);
  return res.status(200).send(lines.join("\n"));
});
