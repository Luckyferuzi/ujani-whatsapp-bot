export type TimelineKind = "event" | "note";

export type TimelineItem = {
  id: string;
  kind: TimelineKind;
  event_type: string;
  title: string;
  description: string | null;
  created_at: string;
  actor_label: string | null;
  actor_type: string | null;
  conversation_id?: number | null;
  order_id?: number | null;
  payment_id?: number | null;
  customer_id?: number | null;
  scope?: "conversation" | "order" | "customer" | null;
};

export type TimelineMessage = {
  id?: number | null;
  direction?: string | null;
  type?: string | null;
  body?: string | null;
  created_at: string | Date;
};

const CONVERSATION_RESUME_GAP_MS = 6 * 60 * 60 * 1000;

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date(0).toISOString();
  }
  return date.toISOString();
}

function summarizeInboundMessage(message: TimelineMessage): string | null {
  if (message.type && message.type !== "text") {
    return `Customer sent ${message.type}`;
  }

  const text = String(message.body ?? "").trim();
  if (!text) return null;
  if (text.length <= 90) return text;
  return `${text.slice(0, 87)}...`;
}

export function buildConversationLifecycleTimeline(args: {
  conversationId: number;
  customerId?: number | null;
  createdAt: string | Date;
  messages: TimelineMessage[];
}): TimelineItem[] {
  const items: TimelineItem[] = [
    {
      id: `conversation-started:${args.conversationId}`,
      kind: "event",
      event_type: "conversation.started",
      title: "Chat started",
      description: "Conversation thread opened in the inbox",
      created_at: toIso(args.createdAt),
      actor_label: "Customer",
      actor_type: "customer",
      conversation_id: args.conversationId,
      customer_id: args.customerId ?? null,
    },
  ];

  let previousMessageAt: number | null = null;

  for (const message of [...args.messages].sort((a, b) => {
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  })) {
    const createdAt = new Date(message.created_at).getTime();
    if (Number.isNaN(createdAt)) continue;

    const isInbound = String(message.direction ?? "").toLowerCase() === "inbound";
    const shouldMarkResume =
      isInbound &&
      previousMessageAt != null &&
      createdAt - previousMessageAt >= CONVERSATION_RESUME_GAP_MS;

    if (shouldMarkResume) {
      items.push({
        id: `conversation-resumed:${args.conversationId}:${message.id ?? createdAt}`,
        kind: "event",
        event_type: "conversation.resumed",
        title: "Chat resumed",
        description: summarizeInboundMessage(message),
        created_at: toIso(message.created_at),
        actor_label: "Customer",
        actor_type: "customer",
        conversation_id: args.conversationId,
        customer_id: args.customerId ?? null,
      });
    }

    previousMessageAt = createdAt;
  }

  return items;
}

export function describeBusinessEvent(args: {
  eventType: string;
  payload?: any;
  scope?: string | null;
}): { title: string; description: string | null } {
  const payload = args.payload ?? {};

  switch (args.eventType) {
    case "conversation.started":
      return { title: "Chat started", description: "Conversation thread opened in the inbox" };
    case "conversation.resumed":
      return { title: "Chat resumed", description: payload?.body_preview ?? null };
    case "order.created":
      return {
        title: "Order created",
        description:
          payload?.order_code
            ? `Order ${payload.order_code} created for ${Number(payload?.total_tzs ?? 0).toLocaleString("en-US")} TZS`
            : "Order created from the current conversation",
      };
    case "payment.proof_submitted":
      return {
        title: "Payment proof submitted",
        description:
          payload?.proof_type === "image"
            ? "Customer sent an image or document as payment proof"
            : payload?.proof_text_preview
            ? `Customer shared proof details: ${String(payload.proof_text_preview)}`
            : "Customer submitted payment proof",
      };
    case "payment.status_changed":
      return {
        title: "Payment status changed",
        description: payload?.next_status
          ? `Payment moved from ${payload?.previous_status ?? "unknown"} to ${payload.next_status}`
          : "Payment status updated",
      };
    case "order.status_changed":
      return {
        title: "Order status changed",
        description: payload?.next_status
          ? `Order moved from ${payload?.previous_status ?? "unknown"} to ${payload.next_status}`
          : "Order status updated",
      };
    case "order.payment_mode_updated":
      return {
        title: "Payment mode updated",
        description: payload?.payment_mode ? `Checkout mode set to ${payload.payment_mode}` : null,
      };
    case "internal.note_added":
      return {
        title: "Internal note added",
        description:
          args.scope === "customer"
            ? "Customer note added for operators"
            : args.scope === "order"
            ? "Order note added for operators"
            : "Conversation note added for operators",
      };
    default:
      return {
        title: args.eventType.replace(/[._]/g, " "),
        description: null,
      };
  }
}
