import db from "../db/knex.js";
import { getJsonSetting, setJsonSetting } from "../db/settings.js";

export type FollowupQueueKey = "unpaid_orders" | "order_action_needed" | "restock_reengagement";

export type FollowupRow = {
  queue: FollowupQueueKey;
  item_key: string;
  customer_id: number;
  customer_name: string | null;
  customer_phone: string | null;
  conversation_id: number | null;
  order_id?: number | null;
  order_code?: string | null;
  payment_status?: string | null;
  amount_due_tzs?: number | null;
  amount_paid_tzs?: number | null;
  status?: string | null;
  reason: string;
  last_interaction_at: string | null;
  product_name?: string | null;
  stock_qty?: number | null;
  template_key: string;
};

type DismissalStore = Record<FollowupQueueKey, string[]>;

const EMPTY_DISMISSALS: DismissalStore = {
  unpaid_orders: [],
  order_action_needed: [],
  restock_reengagement: [],
};

export function isUnpaidOrderCandidate(row: {
  total_tzs?: number | null;
  paid_amount?: number | null;
}) {
  const total = Number(row.total_tzs ?? 0) || 0;
  const paid = Number(row.paid_amount ?? 0) || 0;
  return total > paid;
}

export function describeOrderActionReason(status: string) {
  if (status === "pending") {
    return "Order is still pending and likely needs customer confirmation or payment progress.";
  }
  if (status === "preparing") {
    return "Order is preparing and may need customer coordination or expectation setting.";
  }
  return "Order is out for delivery and may need a delivery follow-up.";
}

export function describeRestockFollowupReason(stockQty: number) {
  return stockQty > 0
    ? "Customer asked for this product and it is now back in stock."
    : "Customer showed product interest and is eligible for a careful re-engagement follow-up.";
}

export function buildBroadcastAudienceFilterLabel(audience: BroadcastAudienceKey) {
  switch (audience) {
    case "marketing_eligible":
      return "Marketing eligible";
    case "previous_buyers":
      return "Previous buyers";
    case "recent_customers":
      return "Recent customers";
    default:
      return "All previous chatters";
  }
}

export type BroadcastAudienceKey =
  | "marketing_eligible"
  | "previous_buyers"
  | "recent_customers"
  | "all_previous_chatters";

async function getDismissals(): Promise<DismissalStore> {
  const stored = await getJsonSetting<Partial<DismissalStore> | null>("followup_dismissals", null);
  return {
    unpaid_orders: Array.isArray(stored?.unpaid_orders) ? stored!.unpaid_orders : [],
    order_action_needed: Array.isArray(stored?.order_action_needed) ? stored!.order_action_needed : [],
    restock_reengagement: Array.isArray(stored?.restock_reengagement) ? stored!.restock_reengagement : [],
  };
}

export async function dismissFollowupItem(queue: FollowupQueueKey, itemKey: string) {
  const current = await getDismissals();
  const next = new Set(current[queue] ?? []);
  next.add(String(itemKey));
  await setJsonSetting("followup_dismissals", {
    ...current,
    [queue]: [...next],
  } satisfies DismissalStore);
}

function mapCustomerName(row: any) {
  return String(row.customer_name ?? "").trim() || null;
}

function mapLastInteraction(row: any) {
  return row.last_interaction_at ? new Date(row.last_interaction_at).toISOString() : null;
}

async function listLatestConversationContext(customerIds: number[]) {
  if (customerIds.length === 0) return new Map<number, { conversation_id: number | null; last_interaction_at: string | null }>();

  const latestIds = db("conversations")
    .select("customer_id")
    .max("id as conversation_id")
    .whereIn("customer_id", customerIds)
    .groupBy("customer_id")
    .as("lc");

  const rows = await db("conversations as c")
    .join(latestIds, "lc.conversation_id", "c.id")
    .whereIn("c.customer_id", customerIds)
    .select(
      "c.customer_id",
      "c.id as conversation_id",
      db.raw("COALESCE(c.last_user_message_at, c.created_at) as last_interaction_at")
    );

  const map = new Map<number, { conversation_id: number | null; last_interaction_at: string | null }>();
  for (const row of rows as any[]) {
    map.set(Number(row.customer_id), {
      conversation_id: Number(row.conversation_id),
      last_interaction_at: row.last_interaction_at ? String(row.last_interaction_at) : null,
    });
  }
  return map;
}

export async function listFollowupQueues() {
  const dismissals = await getDismissals();

  const unpaidRows = await db("orders as o")
    .join("customers as u", "u.id", "o.customer_id")
    .leftJoin("payments as p", "p.order_id", "o.id")
    .whereNotIn("o.status", ["cancelled", "delivered"])
    .select(
      "o.id as order_id",
      "o.order_code",
      "o.status",
      "o.customer_id",
      "u.name as customer_name",
      "u.phone as customer_phone",
      "p.status as payment_status",
      "o.total_tzs",
      "p.amount_tzs as paid_amount"
    )
    .orderBy("o.created_at", "desc");

  const unpaidCandidateRows = (unpaidRows as any[]).filter((row) => isUnpaidOrderCandidate(row));

  const orderActionRows = await db("orders as o")
    .join("customers as u", "u.id", "o.customer_id")
    .whereIn("o.status", ["pending", "preparing", "out_for_delivery"])
    .select(
      "o.id as order_id",
      "o.order_code",
      "o.status",
      "o.customer_id",
      "u.name as customer_name",
      "u.phone as customer_phone"
    )
    .orderBy("o.created_at", "desc");

  const restockRows = await db("restock_subscriptions as rs")
    .join("customers as u", "u.id", "rs.customer_id")
    .join("products as p", "p.id", "rs.product_id")
    .where("rs.status", "subscribed")
    .select(
      "rs.id as subscription_id",
      "rs.customer_id",
      "u.name as customer_name",
      "u.phone as customer_phone",
      "p.name as product_name",
      "p.stock_qty"
    )
    .orderBy("rs.updated_at", "desc");

  const customerIds = Array.from(
    new Set(
      [...unpaidCandidateRows, ...(orderActionRows as any[]), ...(restockRows as any[])]
        .map((row) => Number(row.customer_id))
        .filter((value) => Number.isFinite(value))
    )
  );
  const convoMap = await listLatestConversationContext(customerIds);

  const unpaidOrders: FollowupRow[] = unpaidCandidateRows
    .map((row) => {
      const customerId = Number(row.customer_id);
      const convo = convoMap.get(customerId);
      const itemKey = `order:${row.order_id}`;
      return {
        queue: "unpaid_orders" as const,
        item_key: itemKey,
        customer_id: customerId,
        customer_name: mapCustomerName(row),
        customer_phone: String(row.customer_phone ?? "").trim() || null,
        conversation_id: convo?.conversation_id ?? null,
        order_id: Number(row.order_id),
        order_code: String(row.order_code ?? `UJ-${row.order_id}`),
        payment_status: String(row.payment_status ?? "awaiting"),
        amount_due_tzs: Math.max(0, (Number(row.total_tzs ?? 0) || 0) - (Number(row.paid_amount ?? 0) || 0)),
        amount_paid_tzs: Number(row.paid_amount ?? 0) || 0,
        status: String(row.status ?? ""),
        reason: "Order still has an unpaid balance and needs customer payment follow-up.",
        last_interaction_at: mapLastInteraction(convo),
        template_key: "payment_reminder_sw",
      };
    })
    .filter((row) => !dismissals.unpaid_orders.includes(row.item_key));

  const orderActionNeeded: FollowupRow[] = (orderActionRows as any[])
    .map((row) => {
      const customerId = Number(row.customer_id);
      const convo = convoMap.get(customerId);
      const status = String(row.status ?? "");
      const reason = describeOrderActionReason(status);
      return {
        queue: "order_action_needed" as const,
        item_key: `order:${row.order_id}`,
        customer_id: customerId,
        customer_name: mapCustomerName(row),
        customer_phone: String(row.customer_phone ?? "").trim() || null,
        conversation_id: convo?.conversation_id ?? null,
        order_id: Number(row.order_id),
        order_code: String(row.order_code ?? `UJ-${row.order_id}`),
        status,
        reason,
        last_interaction_at: mapLastInteraction(convo),
        template_key: "order_followup_sw",
      };
    })
    .filter((row) => !dismissals.order_action_needed.includes(row.item_key));

  const restockReengagement: FollowupRow[] = (restockRows as any[])
    .map((row) => {
      const customerId = Number(row.customer_id);
      const convo = convoMap.get(customerId);
      const stockQty = Number(row.stock_qty ?? 0) || 0;
      return {
        queue: "restock_reengagement" as const,
        item_key: `restock:${row.subscription_id}`,
        customer_id: customerId,
        customer_name: mapCustomerName(row),
        customer_phone: String(row.customer_phone ?? "").trim() || null,
        conversation_id: convo?.conversation_id ?? null,
        product_name: String(row.product_name ?? "").trim() || null,
        stock_qty: stockQty,
        reason: describeRestockFollowupReason(stockQty),
        last_interaction_at: mapLastInteraction(convo),
        template_key: "restock_reengagement_sw",
      };
    })
    .filter((row) => !dismissals.restock_reengagement.includes(row.item_key));

  return {
    unpaid_orders: unpaidOrders,
    order_action_needed: orderActionNeeded,
    restock_reengagement: restockReengagement,
  };
}

export async function listBroadcastAudiencePreview(audience: BroadcastAudienceKey) {
  const totalChattersRow = await db("customers as u")
    .join("conversations as c", "c.customer_id", "u.id")
    .whereNotNull("u.wa_id")
    .whereNotNull("c.last_user_message_at")
    .countDistinct<{ total: string }[]>("u.id as total")
    .first();

  const latestConvo = db("conversations")
    .select("customer_id")
    .max("id as conversation_id")
    .groupBy("customer_id")
    .as("lc");

  let base = db("customers as u")
    .leftJoin(latestConvo, "lc.customer_id", "u.id")
    .leftJoin("conversations as c", "c.id", "lc.conversation_id")
    .leftJoin("orders as o", "o.customer_id", "u.id")
    .leftJoin("opt_ins as oi", "oi.customer_id", "u.id")
    .whereNotNull("u.wa_id")
    .whereNotNull("c.id");

  if (audience === "marketing_eligible") {
    base = base.whereNotNull("oi.id");
  } else if (audience === "previous_buyers") {
    base = base.whereNotNull("o.id");
  } else if (audience === "recent_customers") {
    base = base.andWhere("c.last_user_message_at", ">=", db.raw("now() - interval '30 days'"));
  } else {
    base = base.whereNotNull("c.last_user_message_at");
  }

  const rows = await base
    .groupBy("u.id", "u.name", "u.phone", "u.wa_id", "c.id", "c.last_user_message_at")
    .select(
      "u.id as customer_id",
      "u.name as customer_name",
      "u.phone as customer_phone",
      "u.wa_id",
      "c.id as conversation_id",
      "c.last_user_message_at"
    )
    .orderBy("c.last_user_message_at", "desc");

  const uniqueRecipients = (rows as any[]).map((row) => ({
    customer_id: Number(row.customer_id),
    customer_name: mapCustomerName(row),
    customer_phone: String(row.customer_phone ?? "").trim() || null,
    wa_id: String(row.wa_id ?? "").trim() || null,
    conversation_id: Number(row.conversation_id),
    last_interaction_at: row.last_user_message_at ? new Date(row.last_user_message_at).toISOString() : null,
  }));

  return {
    audience,
    label: buildBroadcastAudienceFilterLabel(audience),
    recipients: uniqueRecipients,
    recipient_count: uniqueRecipients.length,
    excluded_count: Math.max(0, Number(totalChattersRow?.total ?? 0) - uniqueRecipients.length),
  };
}
