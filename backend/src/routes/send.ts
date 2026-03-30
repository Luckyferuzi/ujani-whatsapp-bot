// backend/src/routes/send.ts
import { Router } from "express";
import db from "../db/knex.js";
import multer from "multer";
import {
  getInboxTemplateByKey,
  getInboxTemplateRegistry,
  type InboxTemplateConfig,
  type TemplateParameterMeta,
} from "../runtime/companySettings.js";
import { resolveInboxTemplateReadiness } from "../runtime/inboxTemplateReadiness.js";
import {
  getWhatsAppMessageId,
  sendMediaById,
  sendTemplateMessage,
  sendText,
  uploadMedia,
  type WhatsAppSendResponse,
} from "../whatsapp.js";
import {
  createTemplateSendEvent,
  getConversationWindowState,
  insertOutboundMessage,
  resolveConversationWindowStateFromLastInbound,
  updateTemplateSendEvent,
  updateMessageTransportState,
} from "../db/queries.js";

export { FREE_REPLY_WINDOW_MS } from "../db/queries.js";

export const sendRoutes = Router();
const upload = multer();

export function getFreeReplyWindowState(
  lastInboundAt: string | null | undefined,
  now = Date.now()
) {
  const state = resolveConversationWindowStateFromLastInbound(lastInboundAt, now);
  const expiresAtMs = state.expiresAt ? new Date(state.expiresAt).getTime() : null;
  const remainingMs =
    state.remainingSeconds != null ? Math.max(0, state.remainingSeconds * 1000) : 0;

  return {
    allowed: state.mode === "freeform",
    state: state.mode === "freeform" ? ("free_reply_open" as const) : ("template_required" as const),
    expiresAt:
      expiresAtMs != null && Number.isFinite(expiresAtMs)
        ? new Date(expiresAtMs).toISOString()
        : null,
    remainingMs,
  };
}

export function parseWhatsAppApiError(err: any) {
  const rawMessage = String(err?.message ?? "");
  const payloadMatch = rawMessage.match(/WhatsApp API error \d+:\s+(.+)$/);
  let payload: any = err?.payload;

  if (!payload && payloadMatch?.[1]) {
    try {
      payload = JSON.parse(payloadMatch[1]);
    } catch {
      payload = null;
    }
  }

  const waError = payload?.error ?? null;
  const details = waError?.error_data?.details;

  return {
    code: waError?.code != null ? String(waError.code) : null,
    title: typeof waError?.title === "string" ? waError.title : null,
    details: typeof details === "string" ? details : rawMessage || null,
  };
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

export function classifyTemplateProviderError(parsed: {
  code: string | null;
  title: string | null;
  details: string | null;
}) {
  const haystack = `${parsed.title ?? ""} ${parsed.details ?? ""}`.toLowerCase();

  if (
    includesAny(haystack, [
      "translation",
      "language",
      "locale",
      "does not exist in",
      "no translation",
    ])
  ) {
    return {
      status: 409,
      code: "template_language_unavailable",
      statusReason: "template_language_unavailable",
      message:
        "The configured WhatsApp template language is not available for this approved template.",
    };
  }

  if (
    includesAny(haystack, [
      "template name",
      "template does not exist",
      "no template named",
      "could not be found",
      "does not exist",
      "not found",
    ])
  ) {
    return {
      status: 409,
      code: "template_not_available",
      statusReason: "template_not_available",
      message:
        "The configured WhatsApp template name is not available in this business account.",
    };
  }

  return {
    status: 502,
    code: "template_provider_rejected",
    statusReason: "template_provider_rejected",
    message: parsed.details ?? "Failed to send template message",
  };
}

export function validateTemplateParams(
  parameterMeta: TemplateParameterMeta[],
  params: Record<string, unknown>
) {
  const normalized: Record<string, string> = {};
  const missing: string[] = [];

  for (const field of parameterMeta) {
    const value = String(params?.[field.key] ?? "").trim();
    if (field.required && !value) {
      missing.push(field.key);
      continue;
    }
    if (value) {
      normalized[field.key] = value;
    }
  }

  return {
    ok: missing.length === 0,
    missing,
    normalized,
  };
}

function normalizeTemplateParams(
  parameterMeta: TemplateParameterMeta[],
  params: Record<string, unknown>
) {
  const normalized: Record<string, string> = {};
  for (const field of parameterMeta) {
    const value = String(params?.[field.key] ?? "").trim();
    if (value) {
      normalized[field.key] = value;
    }
  }
  return normalized;
}

export function buildTemplatePreview(
  template: Pick<InboxTemplateConfig, "key" | "category">,
  params: Record<string, string>
) {
  const customerName = params.customer_name || "customer";
  const orderCode = params.order_code || "your order";
  const amountDue = params.amount_due || "the outstanding balance";
  const productName = params.product_name || "your requested item";

  if (template.key === "payment_reminder") {
    return `Payment reminder for ${customerName} on ${orderCode}. Outstanding amount: ${amountDue}.`;
  }
  if (template.key === "order_followup") {
    return `Order follow-up for ${customerName} about ${orderCode}.`;
  }
  if (template.key === "restock_reengagement") {
    return `Restock / re-engagement for ${customerName} about ${productName}.`;
  }

  return `${template.category} template for ${customerName}.`;
}

function buildTemplateUiLabel(template: InboxTemplateConfig) {
  if (String(template.displayName ?? "").trim()) {
    return String(template.displayName).trim();
  }
  if (template.category === "payment_reminder") return "Payment reminder";
  if (template.category === "order_followup") return "Order follow-up";
  return "Restock / re-engagement";
}

export function resolveTemplateTransportMapping(
  template: InboxTemplateConfig
): { metaTemplateName: string; languageCode: string } {
  const readiness = resolveInboxTemplateReadiness(template);
  return {
    metaTemplateName: String(readiness.meta_template_name ?? "").trim(),
    languageCode: String(readiness.language_code ?? "").trim(),
  };
}

function encodeMediaBody(args: {
  kind: "image" | "video" | "audio" | "document";
  mediaId: string;
  filename?: string | null;
  caption?: string | null;
}) {
  const extras = [
    encodeURIComponent(args.filename?.trim() ?? ""),
    encodeURIComponent(args.caption?.trim() ?? ""),
  ];
  return `MEDIA:${args.kind}:${args.mediaId}|${extras.join("|")}`;
}

function canMediaCarryCaption(kind: "image" | "video" | "audio" | "document") {
  return kind === "image" || kind === "video" || kind === "document";
}

async function finalizeOutboundMessage(args: {
  messageId: number;
  waResponse?: WhatsAppSendResponse | null;
  status: "sent" | "failed";
  messageKind?: "freeform" | "template";
  statusReason?: string | null;
  errorCode?: string | null;
  errorTitle?: string | null;
  errorDetails?: string | null;
  templateKey?: string | null;
  templateName?: string | null;
  templateLanguage?: string | null;
}) {
  return updateMessageTransportState(args.messageId, {
    waMessageId:
      args.status === "sent" ? getWhatsAppMessageId(args.waResponse) : undefined,
    status: args.status,
    messageKind: args.messageKind ?? "freeform",
    statusReason: args.statusReason ?? null,
    errorCode: args.errorCode ?? null,
    errorTitle: args.errorTitle ?? null,
    errorDetails: args.errorDetails ?? null,
    templateKey: args.templateKey ?? null,
    templateName: args.templateName ?? null,
    templateLanguage: args.templateLanguage ?? null,
  });
}

function sendTemplateRequired(res: any, transport: any) {
  return res.status(409).json({
    ok: false,
    code: "template_required",
    message: "Customer is outside the free reply window",
    error: "Customer is outside the free reply window",
    transport,
  });
}

async function loadConversation(id: number) {
  return db("conversations as c")
    .leftJoin("customers as u", "u.id", "c.customer_id")
    .where("c.id", id)
    .select("c.id", "c.agent_allowed", "c.phone_number_id", "c.customer_id", "u.wa_id", "u.name", "u.lang")
    .first();
}

type TemplateSendTriggerSource = "inbox" | "broadcast" | "followups" | "api";

export async function sendConfiguredTemplateForConversation(args: {
  conversationId: number;
  templateKey: string;
  params: Record<string, unknown>;
  app?: { get?: (name: string) => any } | null;
  triggerSource?: TemplateSendTriggerSource;
  actorUserId?: number | null;
}) {
  const id = Number(args.conversationId);
  const convo = await loadConversation(id);
  if (!convo) {
    return { ok: false as const, status: 404, body: { error: "Conversation not found", code: "conversation_not_found" } };
  }

  if (!convo.wa_id) {
    return { ok: false as const, status: 400, body: { error: "Customer wa_id missing; cannot send", code: "missing_customer_wa_id" } };
  }

  const templateKey = String(args.templateKey ?? "").trim();
  const template = await getInboxTemplateByKey(templateKey);
  if (!template) {
    const windowState = await getConversationWindowState(id);
    await createTemplateSendEvent({
      conversationId: id,
      customerId: Number(convo.customer_id ?? 0) || null,
      templateKey: templateKey || null,
      windowModeAtSend: windowState.mode,
      sendStatus: "failed",
      errorCode: "template_not_found",
      errorTitle: "Template unavailable",
      errorDetails: "Template is not available for this conversation.",
      triggerSource: args.triggerSource ?? "api",
      actorUserId: args.actorUserId ?? null,
    });
    return {
      ok: false as const,
      status: 404,
      body: { error: "Template is not available for this conversation", code: "template_not_found" },
    };
  }

  const windowState = await getConversationWindowState(id);
  const readiness = resolveInboxTemplateReadiness(template);
  const draftParams = normalizeTemplateParams(template.params, args.params ?? {});
  const preview = buildTemplatePreview(template, draftParams);

  if (!readiness.can_send) {
    const failedMessage = await insertOutboundMessage(id, "text", preview, {
      status: "failed",
      messageKind: "template",
      statusReason: readiness.reason_code,
      errorTitle: readiness.status_label,
      errorDetails:
        readiness.status === "disabled"
          ? "This template is disabled in setup and cannot be sent."
          : readiness.status === "language_missing"
          ? "This template is missing the exact WhatsApp language code needed for sending."
          : "This internal template key is not mapped to an approved WhatsApp template name yet.",
      templateKey: template.key,
      templateName: readiness.meta_template_name,
      templateLanguage: readiness.language_code,
    });

    await createTemplateSendEvent({
      conversationId: id,
      messageId: Number(failedMessage.id),
      customerId: Number(convo.customer_id ?? 0) || null,
      templateKey: template.key,
      templateName: readiness.meta_template_name,
      templateLanguage: readiness.language_code,
      templateCategory: template.category,
      windowModeAtSend: windowState.mode,
      sendStatus: "failed",
      errorCode: readiness.reason_code,
      errorTitle: readiness.status_label,
      errorDetails:
        readiness.status === "disabled"
          ? "This template is disabled in setup and cannot be sent."
          : readiness.status === "language_missing"
          ? "This template is missing the exact WhatsApp language code needed for sending."
          : "This internal template key is not mapped to an approved WhatsApp template name yet.",
      triggerSource: args.triggerSource ?? "api",
      actorUserId: args.actorUserId ?? null,
    });

    args.app?.get?.("io")?.emit("message.created", {
      conversation_id: id,
      message: failedMessage,
    });

    return {
      ok: false as const,
      status: 409,
      body: {
        error: readiness.status_label,
        code: readiness.reason_code,
        message:
          readiness.status === "disabled"
            ? "This template is disabled in setup and cannot be sent."
            : readiness.status === "language_missing"
            ? "This template is missing the exact WhatsApp language code needed for sending."
            : "This internal template key is not mapped to an approved WhatsApp template name yet.",
        transport: failedMessage,
      },
    };
  }

  const validation = validateTemplateParams(template.params, args.params ?? {});
  if (!validation.ok) {
    await createTemplateSendEvent({
      conversationId: id,
      customerId: Number(convo.customer_id ?? 0) || null,
      templateKey: template.key,
      templateName: readiness.meta_template_name,
      templateLanguage: readiness.language_code,
      templateCategory: template.category,
      windowModeAtSend: windowState.mode,
      sendStatus: "failed",
      errorCode: "template_params_missing",
      errorTitle: "Missing required template parameters",
      errorDetails: `Missing required template parameters: ${validation.missing.join(", ")}`,
      triggerSource: args.triggerSource ?? "api",
      actorUserId: args.actorUserId ?? null,
    });
    return {
      ok: false as const,
      status: 400,
      body: {
        error: "Missing required template parameters",
        code: "template_params_missing",
        missing: validation.missing,
      },
    };
  }
  const validatedPreview = buildTemplatePreview(template, validation.normalized);

  const parameterValues = template.params
    .map((item) => validation.normalized[item.key] ?? "")
    .filter((value, index) => {
      const field = template.params[index];
      return field.required || value.length > 0;
    });
  const { metaTemplateName, languageCode } = resolveTemplateTransportMapping(template);

  const pendingMessage = await insertOutboundMessage(id, "text", validatedPreview, {
    status: "pending",
    messageKind: "template",
    templateKey: template.key,
      templateName: metaTemplateName,
      templateLanguage: languageCode,
    });

  const auditRow = await createTemplateSendEvent({
    conversationId: id,
    messageId: Number(pendingMessage.id),
    customerId: Number(convo.customer_id ?? 0) || null,
    templateKey: template.key,
    templateName: metaTemplateName,
    templateLanguage: languageCode,
    templateCategory: template.category,
    windowModeAtSend: windowState.mode,
    sendStatus: "attempted",
    triggerSource: args.triggerSource ?? "api",
    actorUserId: args.actorUserId ?? null,
  });

  args.app?.get?.("io")?.emit("message.created", {
    conversation_id: id,
    message: pendingMessage,
  });

  try {
    const waResponse = await sendTemplateMessage({
      to: String(convo.wa_id),
      metaTemplateName,
      languageCode,
      bodyParameters: parameterValues,
      phoneNumberId: (convo as any).phone_number_id ?? null,
    });

    const message = await finalizeOutboundMessage({
      messageId: Number(pendingMessage.id),
      waResponse,
      status: "sent",
      messageKind: "template",
      templateKey: template.key,
      templateName: metaTemplateName,
      templateLanguage: languageCode,
    });

    if (auditRow?.id) {
      await updateTemplateSendEvent(auditRow.id, {
        messageId: Number(message?.id ?? pendingMessage.id),
        sendStatus: "accepted",
        waMessageId: getWhatsAppMessageId(waResponse),
      });
    }

    args.app?.get?.("io")?.emit("message.created", {
      conversation_id: id,
      message: message ?? pendingMessage,
    });

    return {
      ok: true as const,
      status: 200,
      body: {
        ok: true,
        message: message ?? pendingMessage,
        template: {
          key: template.key,
          metaTemplateName,
          languageCode,
        },
        transport: waResponse,
      },
    };
  } catch (err: any) {
    const parsed = parseWhatsAppApiError(err);
    const classified = classifyTemplateProviderError(parsed);
    const message = await finalizeOutboundMessage({
      messageId: Number(pendingMessage.id),
      status: "failed",
      messageKind: "template",
      statusReason: classified.statusReason,
      errorCode: parsed.code,
      errorTitle: parsed.title,
      errorDetails: parsed.details ?? classified.message,
      templateKey: template.key,
      templateName: metaTemplateName,
      templateLanguage: languageCode,
    });

    if (auditRow?.id) {
      await updateTemplateSendEvent(auditRow.id, {
        messageId: Number(message?.id ?? pendingMessage.id),
        sendStatus: "failed",
        errorCode: parsed.code ?? classified.code,
        errorTitle: parsed.title ?? classified.code,
        errorDetails: parsed.details ?? classified.message,
      });
    }

    args.app?.get?.("io")?.emit("message.created", {
      conversation_id: id,
      message: message ?? pendingMessage,
    });

    return {
      ok: false as const,
      status: classified.status,
      body: {
        error: classified.message,
        code: classified.code,
        transport: message ?? pendingMessage,
      },
    };
  }
}

async function loadConversationTemplateContext(conversationId: number) {
  const convo = await db("conversations as c")
    .leftJoin("customers as u", "u.id", "c.customer_id")
    .where("c.id", conversationId)
    .select(
      "c.id",
      "c.customer_id",
      "c.phone_number_id",
      "u.wa_id",
      "u.name",
      "u.lang",
      "u.phone"
    )
    .first();

  if (!convo?.customer_id) {
    return null;
  }

  const order = await db("orders as o")
    .leftJoin("payments as p", "p.order_id", "o.id")
    .where("o.customer_id", convo.customer_id)
    .select(
      "o.id",
      "o.order_code",
      "o.status",
      "o.total_tzs",
      "p.amount_tzs as paid_amount",
      "p.status as payment_status"
    )
    .orderBy("o.created_at", "desc")
    .first();

  const restockItems = await db("restock_subscriptions as rs")
    .join("products as p", "p.id", "rs.product_id")
    .where("rs.customer_id", convo.customer_id)
    .andWhere("rs.status", "subscribed")
    .select("p.name")
    .orderBy("rs.updated_at", "desc")
    .limit(3);

  return {
    convo,
    latestOrder: order
      ? {
          id: Number(order.id),
          orderCode: String(order.order_code ?? `UJ-${order.id}`),
          status: String(order.status ?? ""),
          totalTzs: Number(order.total_tzs ?? 0) || 0,
          paidAmount: Number(order.paid_amount ?? 0) || 0,
          paymentStatus: String(order.payment_status ?? "awaiting"),
        }
      : null,
    restockItems: (restockItems as any[]).map((row) => String(row.name ?? "")).filter(Boolean),
  };
}

export function buildTemplateSuggestionCategory(context: {
  latestOrder: {
    status: string;
    totalTzs: number;
    paidAmount: number;
    paymentStatus: string;
  } | null;
  restockItems: string[];
}) {
  if (
    context.latestOrder &&
    context.latestOrder.totalTzs > context.latestOrder.paidAmount &&
    context.latestOrder.paymentStatus !== "paid"
  ) {
    return "payment_reminder";
  }

  if (
    context.latestOrder &&
    ["pending", "preparing", "out_for_delivery"].includes(context.latestOrder.status)
  ) {
    return "order_followup";
  }

  if (context.restockItems.length > 0) {
    return "restock_reengagement";
  }

  return null;
}

function buildTemplateDefaults(
  template: InboxTemplateConfig,
  context: Awaited<ReturnType<typeof loadConversationTemplateContext>>
) {
  const customerName = String(context?.convo?.name ?? "").trim() || "Customer";
  const defaults: Record<string, string> = {
    customer_name: customerName,
  };

  if (context?.latestOrder) {
    defaults.order_code = context.latestOrder.orderCode;
    defaults.amount_due = `${Math.max(
      0,
      context.latestOrder.totalTzs - context.latestOrder.paidAmount
    ).toLocaleString("sw-TZ")} TZS`;
  }

  if (context?.restockItems?.[0]) {
    defaults.product_name = context.restockItems[0];
  }

  return {
    defaults,
    preview: buildTemplatePreview(template, defaults),
  };
}

sendRoutes.get("/conversations/:id/template-options", async (req, res) => {
  try {
    const conversationId = Number(req.params.id);
    if (!Number.isFinite(conversationId)) {
      return res.status(400).json({ error: "Invalid conversation id", code: "invalid_conversation_id" });
    }

    const context = await loadConversationTemplateContext(conversationId);
    if (!context) {
      return res.status(404).json({ error: "Conversation not found", code: "conversation_not_found" });
    }

    const registry = await getInboxTemplateRegistry();
    const templateEntries = registry.map((template) => ({
      template,
      readiness: resolveInboxTemplateReadiness(template),
    }));
    const suggestedCategory = buildTemplateSuggestionCategory({
      latestOrder: context.latestOrder,
      restockItems: context.restockItems,
    });

    const items = templateEntries.map(({ template, readiness }) => {
      const { defaults, preview } = buildTemplateDefaults(template, context);
      return {
        key: template.key,
        meta_template_name: readiness.meta_template_name,
        language_code: readiness.language_code,
        category: template.category,
        label: buildTemplateUiLabel(template),
        enabled: template.enabled,
        can_send: readiness.can_send,
        template_status: readiness.status,
        template_status_label: readiness.status_label,
        template_reason_code: readiness.reason_code,
        params: template.params,
        default_params: defaults,
        preview,
        suggested: suggestedCategory != null && template.category === suggestedCategory,
      };
    });

    return res.json({
      items,
      suggested_category: suggestedCategory,
      context: {
        latest_order: context.latestOrder,
        restock_items: context.restockItems,
      },
    });
  } catch (err: any) {
    console.error("GET /api/conversations/:id/template-options failed", err);
    return res.status(500).json({ error: err?.message ?? "Failed to load template options" });
  }
});

sendRoutes.post("/send", async (req, res) => {
  try {
    const { conversationId, text } = req.body ?? {};
    const id = Number(conversationId);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "conversationId required" });
    }

    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: "text required" });
    }

    const convo = await loadConversation(id);

    if (!convo) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    if (!convo.agent_allowed) {
      return res.status(403).json({
        error:
          "Agent is not allowed for this conversation (customer has not chosen Ongea na mhudumu).",
      });
    }

    if (!convo.wa_id) {
      return res.status(400).json({ error: "Customer wa_id missing; cannot send" });
    }

    const trimmed = String(text).trim();
    const windowState = await getConversationWindowState(id);

    if (windowState.mode !== "freeform") {
      const failedMessage = await insertOutboundMessage(id, "text", trimmed, {
        status: "failed",
        messageKind: "freeform",
        statusReason: "template_required",
        errorTitle: "Template required",
        errorDetails:
          "Customer is outside the free reply window. Send a WhatsApp template before another manual free-text reply.",
      });

      req.app.get("io")?.emit("message.created", {
        conversation_id: id,
        message: failedMessage,
      });

      return sendTemplateRequired(res, failedMessage);
    }

    const pendingMessage = await insertOutboundMessage(id, "text", trimmed, {
      status: "pending",
      messageKind: "freeform",
    });

    req.app.get("io")?.emit("message.created", {
      conversation_id: id,
      message: pendingMessage,
    });

    try {
      const waResponse = await sendText(convo.wa_id, trimmed, {
        phoneNumberId: (convo as any).phone_number_id ?? null,
      });

      const message = await finalizeOutboundMessage({
        messageId: Number(pendingMessage.id),
        waResponse,
        status: "sent",
      });

      req.app.get("io")?.emit("message.created", {
        conversation_id: id,
        message: message ?? pendingMessage,
      });

      return res.json({ ok: true, message: message ?? pendingMessage, transport: waResponse });
    } catch (err: any) {
      const parsed = parseWhatsAppApiError(err);
      const message = await finalizeOutboundMessage({
        messageId: Number(pendingMessage.id),
        status: "failed",
        statusReason: "transport_failed",
        errorCode: parsed.code,
        errorTitle: parsed.title,
        errorDetails: parsed.details,
      });

      req.app.get("io")?.emit("message.created", {
        conversation_id: id,
        message: message ?? pendingMessage,
      });

      throw err;
    }
  } catch (e: any) {
    console.error("POST /api/send failed", e);
    return res.status(500).json({
      error: e?.message ?? "send failed (WhatsApp error)",
      code: "send_failed",
    });
  }
});

sendRoutes.post("/send-template", async (req, res) => {
  try {
    const { conversationId, templateKey, params } = req.body ?? {};
    const result = await sendConfiguredTemplateForConversation({
      conversationId: Number(conversationId),
      templateKey: String(templateKey ?? ""),
      params: (params ?? {}) as Record<string, unknown>,
      app: req.app,
      triggerSource: "inbox",
      actorUserId: Number((req as any).user?.id ?? 0) || null,
    });
    return res.status(result.status).json(result.body);
  } catch (err: any) {
    console.error("POST /api/send-template failed", err);
    return res.status(500).json({
      error: err?.message ?? "Failed to send template",
      code: "template_send_failed",
    });
  }
});

sendRoutes.post("/upload-media", upload.single("file"), async (req, res) => {
  try {
    const { conversationId, kind } = req.body ?? {};
    const id = Number(conversationId);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "Missing file" });
    }

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid conversationId" });
    }

    const convo = await db("conversations")
      .where({ "conversations.id": id })
      .join("customers as cu", "cu.id", "conversations.customer_id")
      .select("conversations.agent_allowed", "conversations.phone_number_id", "cu.wa_id")
      .first();

    if (!convo) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    if (!convo.agent_allowed) {
      return res.status(403).json({ error: "Agent is not allowed for this conversation" });
    }

    const waId = (convo as any).wa_id as string | null;
    if (!waId) {
      return res.status(400).json({ error: "Customer wa_id missing; cannot send media" });
    }

    const mime = file.mimetype || "application/octet-stream";
    const filename = file.originalname || "file";

    let type: "image" | "video" | "audio" | "document" = "document";

    if (kind === "image" || kind === "video" || kind === "audio" || kind === "document") {
      type = kind;
    } else if (mime.startsWith("image/")) {
      type = mime === "image/svg+xml" ? "document" : "image";
    } else if (mime.startsWith("video/")) {
      type = "video";
    } else if (mime.startsWith("audio/")) {
      type = "audio";
    }

    const mediaId = await uploadMedia(file.buffer, filename, mime, {
      phoneNumberId: (convo as any).phone_number_id ?? null,
    });

    return res.json({
      ok: true,
      mediaId,
      mediaKind: type,
      filename,
      mimeType: mime,
    });
  } catch (e: any) {
    console.error("POST /api/upload-media failed", e);
    return res.status(500).json({ error: e?.message ?? "Failed to upload media" });
  }
});

sendRoutes.post("/send-media", async (req, res) => {
  try {
    const { conversationId, kind, mediaId, caption, filename } = req.body ?? {};
    const id = Number(conversationId);

    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: "Invalid conversationId" });
    }

    if (!mediaId || typeof mediaId !== "string") {
      return res.status(400).json({ error: "Missing mediaId" });
    }

    const convo = await loadConversation(id);

    if (!convo) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    if (!convo.agent_allowed) {
      return res.status(403).json({
        error:
          "Agent is not allowed for this conversation (customer has not chosen Ongea na mhudumu).",
      });
    }

    const waId = (convo as any).wa_id as string | null;
    if (!waId) {
      return res.status(400).json({ error: "Customer wa_id missing; cannot send media" });
    }

    let type: "image" | "video" | "audio" | "document" = "document";
    if (kind === "image" || kind === "video" || kind === "audio" || kind === "document") {
      type = kind;
    }

    const trimmedCaption = String(caption ?? "").trim();
    if (trimmedCaption && !canMediaCarryCaption(type)) {
      return res.status(400).json({
        error: "Captions are not supported for this media type yet",
        code: "media_caption_not_supported",
      });
    }

    const safeFilename = String(filename ?? "").trim() || "file";
    const windowState = await getConversationWindowState(id);
    if (windowState.mode !== "freeform") {
      const failedMessage = await insertOutboundMessage(
        id,
        type,
        encodeMediaBody({
          kind: type,
          mediaId,
          filename: safeFilename,
          caption: trimmedCaption,
        }),
        {
          status: "failed",
          messageKind: "freeform",
          statusReason: "template_required",
          errorTitle: "Template required",
          errorDetails:
            "Customer is outside the free reply window. Send a WhatsApp template before another manual media reply.",
        }
      );

      req.app.get("io")?.emit("message.created", {
        conversation_id: id,
        message: failedMessage,
      });

      return sendTemplateRequired(res, failedMessage);
    }

    const pendingMessage = await insertOutboundMessage(
      id,
      type,
      encodeMediaBody({
        kind: type,
        mediaId,
        filename: safeFilename,
        caption: trimmedCaption,
      }),
      {
      status: "pending",
      messageKind: "freeform",
      }
    );

    req.app.get("io")?.emit("message.created", {
      conversation_id: id,
      message: pendingMessage,
    });

    try {
      const waResponse = await sendMediaById(waId, type, mediaId, trimmedCaption || undefined, {
        phoneNumberId: (convo as any).phone_number_id ?? null,
      });

      const message = await finalizeOutboundMessage({
        messageId: Number(pendingMessage.id),
        waResponse,
        status: "sent",
      });

      req.app.get("io")?.emit("message.created", {
        conversation_id: id,
        message: message ?? pendingMessage,
      });

      return res.json({ ok: true, message: message ?? pendingMessage, transport: waResponse });
    } catch (err: any) {
      const parsed = parseWhatsAppApiError(err);
      const message = await finalizeOutboundMessage({
        messageId: Number(pendingMessage.id),
        status: "failed",
        statusReason: "transport_failed",
        errorCode: parsed.code,
        errorTitle: parsed.title,
        errorDetails: parsed.details,
      });

      req.app.get("io")?.emit("message.created", {
        conversation_id: id,
        message: message ?? pendingMessage,
      });

      throw err;
    }
  } catch (e: any) {
    console.error("POST /api/send-media failed", e);
    return res.status(500).json({ error: e?.message ?? "Failed to resend media" });
  }
});
