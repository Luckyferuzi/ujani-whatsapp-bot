"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type FormEvent,
} from "react";
import { api, API, type ApiError } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";
import { socket } from "@/lib/socket";
import type { Convo } from "./ConversationList";
import TemplateSendModal from "./TemplateSendModal";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { EmptyState, ThreadSkeleton } from "@/components/ui";

type ThreadProps = {
  convo: Convo;
  onOpenContext?: () => void;
  onToggleContext?: () => void;
  contextOpen?: boolean;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("sw-TZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function minutesBetween(aIso: string, bIso: string): number {
  const a = new Date(aIso).getTime();
  const b = new Date(bIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Number.POSITIVE_INFINITY;
  return Math.abs(b - a) / (1000 * 60);
}

function formatDayLabel(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("sw-TZ", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

const GROUP_GAP_MINUTES = 6;
const FREE_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

type Msg = {
  id: string | number;
  conversation_id: string | number;
  wa_message_id?: string | null;
  direction: "in" | "inbound" | "out" | "outbound";
  type: string;
  body: string | null;
  status?: string | null;
  message_kind?: string | null;
  status_reason?: string | null;
  error_code?: string | null;
  error_title?: string | null;
  error_details?: string | null;
  template_key?: string | null;
  template_name?: string | null;
  template_language?: string | null;
  created_at: string;
};

type ProductSummary = {
  id: number;
  sku: string;
  name: string;
};

type ProductsResponse = {
  items: ProductSummary[];
};

type ParsedMenu = {
  introLines: string[];
  sections: { title: string; options: string[] }[];
};

const PLAIN_MENU_BULLET_PATTERN = /^(?:•|â€¢)\s*/;

function parseMenuFromJsonBody(body: string): ParsedMenu | null {
  const match = body.match(/^\[MENU\](.+)$/);
  if (!match) return null;

  try {
    const payload = JSON.parse(match[1]);
    if (!payload || payload.kind !== "menu") return null;

    const introLines: string[] = [];
    const header = typeof payload.header === "string" ? payload.header.trim() : "";
    const text = typeof payload.body === "string" ? payload.body.trim() : "";

    if (header) introLines.push(header);
    if (text && text !== header) introLines.push(text);

    const sections: ParsedMenu["sections"] = [];

    if (payload.subtype === "buttons" && Array.isArray(payload.buttons)) {
      const opts = (payload.buttons as unknown[])
        .filter((v): v is string => typeof v === "string")
        .map((s) => s.trim())
        .filter(Boolean);

      if (opts.length) {
        sections.push({
          title: text || header || "",
          options: opts,
        });
      }
    }

    if (payload.subtype === "list" && Array.isArray(payload.sections)) {
      for (const sec of payload.sections as any[]) {
        const secTitle = typeof sec?.title === "string" ? sec.title.trim() : "";
        const rows = Array.isArray(sec?.rows) ? sec.rows : [];
        const opts = rows
          .map((r: any) =>
            typeof r === "string" ? r : typeof r?.title === "string" ? r.title : ""
          )
          .map((s: string) => s.trim())
          .filter(Boolean);

        if (opts.length) {
          sections.push({
            title: secTitle || text || header || "",
            options: opts,
          });
        }
      }
    }

    if (!sections.length) return null;

    return { introLines, sections };
  } catch (err) {
    console.error("Failed to parse [MENU] JSON", err);
    return null;
  }
}

function parseMenuFromPlainBody(body: string): ParsedMenu | null {
  if (!body) return null;

  const rawLines = body.split("\n");
  const trimmed = rawLines.map((l) => l.trim());
  const hasBullet = trimmed.some((l) => PLAIN_MENU_BULLET_PATTERN.test(l));
  if (!hasBullet) return null;

  let firstHeaderIndex = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const line = trimmed[i];
    if (!line) continue;
    if (line.endsWith(":")) {
      firstHeaderIndex = i;
      break;
    }
  }
  if (firstHeaderIndex === -1) return null;

  const introLines = trimmed.slice(0, firstHeaderIndex).filter(Boolean);
  const sections: ParsedMenu["sections"] = [];

  let i = firstHeaderIndex;
  while (i < trimmed.length) {
    while (i < trimmed.length && !trimmed[i]) i++;
    if (i >= trimmed.length) break;

    const headerLine = trimmed[i];
    if (!headerLine.endsWith(":")) break;

    const title = headerLine.slice(0, -1);
    i++;

    const options: string[] = [];

    while (i < trimmed.length) {
      const line = trimmed[i];

      if (!line) {
        i++;
        continue;
      }

      if (line.endsWith(":")) break;

      if (PLAIN_MENU_BULLET_PATTERN.test(line)) {
        options.push(line.replace(PLAIN_MENU_BULLET_PATTERN, "").trim());
      }

      i++;
    }

    if (options.length) {
      sections.push({ title, options });
    }
  }

  if (!sections.length) return null;

  return { introLines, sections };
}

function renderMenuBlock(parsed: ParsedMenu) {
  return (
    <div className="thread-menu">
      {parsed.introLines.length > 0 && (
        <div className="thread-menu-intro">
          {parsed.introLines.map((line, idx) => (
            <div key={idx}>{line}</div>
          ))}
        </div>
      )}

      {parsed.sections.map((section, idx) => (
        <div key={idx} className="thread-menu-section">
          {section.title && (
            <div className="thread-menu-section-title">{section.title}</div>
          )}
          <div className="thread-menu-options">
            {section.options.map((opt, j) => (
              <div key={j} className="thread-menu-option">
                {opt}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatInteractiveDisplay(id: string, products: Record<string, string>): string {
  if (!id) return "";

  const nameForSku = (sku: string) => products[sku] ?? sku;

  if (id.startsWith("PRODUCT_")) {
    const sku = id.slice("PRODUCT_".length);
    const name = nameForSku(sku);
    return `Customer selected product: ${name}`;
  }

  if (id.startsWith("DETAILS_") && !id.startsWith("DETAILS2_")) {
    const sku = id.slice("DETAILS_".length);
    const name = nameForSku(sku);
    return `Customer requested more details about ${name}`;
  }

  if (id.startsWith("DETAILS2_")) {
    const rest = id.slice("DETAILS2_".length);
    const [sku, section] = rest.split("_");
    const name = nameForSku(sku);
    if (section === "ABOUT") return `Customer requested an overview of ${name}`;
    if (section === "USAGE") return `Customer requested usage guidance for ${name}`;
    if (section === "WARN") return `Customer requested warnings for ${name}`;
  }

  if (id.startsWith("ADD_")) {
    const sku = id.slice("ADD_".length);
    const name = nameForSku(sku);
    return `Customer added to cart: ${name}`;
  }

  if (id.startsWith("BUY_")) {
    const sku = id.slice("BUY_".length);
    const name = nameForSku(sku);
    return `Customer chose Buy now for ${name}`;
  }

  if (id === "ACTION_VIEW_CART") return "Customer viewed cart";
  if (id === "ACTION_CHECKOUT") return "Customer started checkout";
  if (id === "ACTION_TRACK_BY_NAME") return "Customer is tracking an order by name";
  if (id === "ACTION_TALK_TO_AGENT") return "Customer requested an agent";
  if (id === "ACTION_FAQ") return "Customer opened FAQ";
  if (id === "ACTION_BACK") return "Customer returned to the main menu";

  return `Interactive action: ${id}`;
}

type Role = "customer" | "agent" | "bot";

function isInboundMessage(msg: Pick<Msg, "direction">) {
  return msg.direction === "in" || msg.direction === "inbound";
}

function isOutboundMessage(msg: Pick<Msg, "direction">) {
  return !isInboundMessage(msg);
}

function getFreeReplyState(lastInboundAt?: string | null, now = Date.now()) {
  if (!lastInboundAt) {
    return {
      label: "Template required",
      className: "thread-state-badge thread-state-badge--closed",
      allowed: false,
      expiresAt: null as string | null,
    };
  }

  const openedAt = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(openedAt)) {
    return {
      label: "Template required",
      className: "thread-state-badge thread-state-badge--closed",
      allowed: false,
      expiresAt: null as string | null,
    };
  }

  const expiresAtMs = openedAt + FREE_REPLY_WINDOW_MS;
  if (expiresAtMs > now) {
    return {
      label: "Free reply open",
      className: "thread-state-badge thread-state-badge--open",
      allowed: true,
      expiresAt: new Date(expiresAtMs).toISOString(),
    };
  }

  return {
    label: "Template required",
    className: "thread-state-badge thread-state-badge--closed",
    allowed: false,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

function describeMessageTransport(msg: Msg) {
  const status = String(msg.status ?? "").toLowerCase();

  if (status === "failed") {
    return { label: "Failed", className: "thread-ticks thread-ticks--failed" };
  }
  if (status === "read") {
    return { label: "Read", className: "thread-ticks" };
  }
  if (status === "delivered") {
    return { label: "Delivered", className: "thread-ticks thread-ticks--delivered" };
  }
  if (status === "sent") {
    return { label: "Sent", className: "thread-ticks thread-ticks--sent" };
  }

  return { label: "Sending", className: "thread-ticks thread-ticks--pending" };
}

function describeFailure(msg: Msg) {
  if ((msg.status_reason ?? "").toLowerCase() === "template_required") {
    return "Customer is outside WhatsApp's free reply window. A template message is required before another manual text can be sent.";
  }

  if ((msg.status_reason ?? "").toLowerCase() === "template_config_missing") {
    return "This template is not configured yet. Map the approved WhatsApp template name in Setup before sending.";
  }

  if ((msg.status_reason ?? "").toLowerCase() === "template_language_unavailable") {
    return "This template is missing the exact approved WhatsApp language code. Update it in Setup before sending.";
  }

  if (msg.error_details) return msg.error_details;
  if (msg.error_title) return msg.error_title;
  return "WhatsApp could not deliver this message.";
}

function formatTemplateDisplayName(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return "Template";
  return raw
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getTemplateHistoryLabel(msg: Msg) {
  return msg.template_name || msg.template_key || null;
}

function getRole(msg: Msg): Role {
  const inbound = isInboundMessage(msg);
  if (inbound) return "customer";

  const body = msg.body ?? "";

  if (parseMenuFromJsonBody(body)) return "bot";
  if (parseMenuFromPlainBody(body)) return "bot";
  if (/^\[interactive:(.+)\]$/.test(body)) return "bot";

  return "agent";
}

function renderBody(
  msg: Msg,
  products: Record<string, string>,
  onResendMedia?: (kind: string, mediaId: string) => void,
  onDeleteMedia?: (messageId: string | number) => void,
  activeMediaActionsId?: string | number | null,
  onToggleMediaActions?: (messageId: string | number) => void
) {
  const body = msg.body ?? "";
  const inbound = msg.direction === "in" || msg.direction === "inbound";
  const outbound = !inbound;

  const jsonMenu = parseMenuFromJsonBody(body);
  if (jsonMenu) return renderMenuBlock(jsonMenu);

  if (outbound) {
    const plainMenu = parseMenuFromPlainBody(body);
    if (plainMenu) return renderMenuBlock(plainMenu);
  }

  const interactiveMatch = body.match(/^\[interactive:(.+)\]$/);
  if (interactiveMatch) {
    const id = interactiveMatch[1];
    const pretty = formatInteractiveDisplay(id, products);
    return <div className="thread-text">{pretty}</div>;
  }

  if (body.startsWith("LOCATION ")) {
    const raw = body.substring("LOCATION ".length).trim();
    const [latStr, lngStr] = raw.split(",").map((p) => p.trim());
    const lat = Number(latStr);
    const lng = Number(lngStr);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return <div className="thread-text">{body}</div>;
    }

    const url = `https://www.google.com/maps?q=${lat},${lng}`;

    return (
      <div className="thread-location">
        <div className="thread-text">Customer shared a location</div>
        <div className="thread-location-coords">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </div>
        <a href={url} target="_blank" rel="noreferrer" className="thread-location-link">
          Open in maps
        </a>
      </div>
    );
  }

  const mediaMatch = body.match(/^MEDIA:([a-z]+):(.+)$/);
  if (mediaMatch) {
    const kind = mediaMatch[1] as "image" | "video" | "audio" | "document";
    const mediaId = mediaMatch[2];
    const src = `${API}/api/media/${encodeURIComponent(mediaId)}`;

    const showActions =
      activeMediaActionsId != null &&
      String(activeMediaActionsId) === String(msg.id);

    const editIcon =
      typeof onToggleMediaActions === "function" ? (
        <button
          type="button"
          className="thread-media-edit"
          onClick={() => onToggleMediaActions(msg.id)}
          title="Manage media actions"
        >
          Edit
        </button>
      ) : null;

    const resendButton =
      typeof onResendMedia === "function" ? (
        <button
          type="button"
          className="thread-media-resend"
          onClick={() => onResendMedia(kind, mediaId)}
        >
          Resend media
        </button>
      ) : null;

    const deleteButton =
      typeof onDeleteMedia === "function" ? (
        <button
          type="button"
          className="thread-media-delete"
          onClick={() => onDeleteMedia(msg.id)}
        >
          Delete media
        </button>
      ) : null;

    if (kind === "image") {
      return (
        <div className="thread-media">
          <img src={src} className="thread-image" alt="Media sent in conversation" />
          <a href={src} target="_blank" rel="noreferrer" className="thread-media-link">
            Open image
          </a>
          {showActions && (resendButton || deleteButton) && (
            <div className="thread-media-actions">
              {resendButton}
              {deleteButton}
            </div>
          )}
          {editIcon}
        </div>
      );
    }

    if (kind === "video") {
      return (
        <div className="thread-media">
          <video src={src} controls className="thread-video" />
          <a href={src} target="_blank" rel="noreferrer" className="thread-media-link">
            Open video
          </a>
          {showActions && (resendButton || deleteButton) && (
            <div className="thread-media-actions">
              {resendButton}
              {deleteButton}
            </div>
          )}
          {editIcon}
        </div>
      );
    }

    if (kind === "audio") {
      return (
        <div className="thread-media">
          <audio src={src} controls className="thread-audio" />
          {showActions && (resendButton || deleteButton) && (
            <div className="thread-media-actions">
              {resendButton}
              {deleteButton}
            </div>
          )}
          {editIcon}
        </div>
      );
    }

    if (kind === "document") {
      return (
        <div className="thread-media">
          <a href={src} target="_blank" rel="noreferrer" className="thread-media-link">
            Open file
          </a>
          {showActions && (resendButton || deleteButton) && (
            <div className="thread-media-actions">
              {resendButton}
              {deleteButton}
            </div>
          )}
          {editIcon}
        </div>
      );
    }
  }

  return <div className="thread-text">{body}</div>;
}

export default function Thread({
  convo,
  onOpenContext,
  onToggleContext,
  contextOpen = false,
}: ThreadProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [agentAllowed, setAgentAllowed] = useState<boolean>(convo.agent_allowed);
  const [text, setText] = useState("");
  const [toggling, setToggling] = useState(false);
  const [sending, setSending] = useState(false);
  const [showBotModeHint, setShowBotModeHint] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [dismissedHeaderFailureId, setDismissedHeaderFailureId] = useState<string | number | null>(null);
  const [dismissedComposerNoticeKey, setDismissedComposerNoticeKey] = useState<string | null>(null);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [activeMediaActionsId, setActiveMediaActionsId] = useState<string | number | null>(null);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const firstUnreadRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const initialScrolledRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleToggleMediaActions(messageId: string | number) {
    setActiveMediaActionsId((prev) =>
      prev != null && String(prev) === String(messageId) ? null : messageId
    );
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!agentAllowed && e.key !== "Tab") {
      e.preventDefault();
      revealBotModeHint();
      return;
    }

    if (composerBlockedByWindow && e.key !== "Tab") {
      e.preventDefault();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as FormEvent);
    }
  }

  async function handleResendMedia(kind: string, mediaId: string) {
    try {
      const data = await api<{ ok: boolean; message: Msg }>("/api/send-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convo.id,
          kind,
          mediaId,
        }),
      });

      if (data?.message) {
        setMessages((prev) => [...prev, data.message]);
        scrollToBottom("smooth");
      }
    } catch (err: any) {
      console.error("Failed to resend media", err);
      toast.error(err?.message ?? "Unable to resend media right now.");
    }
  }

  async function handleDeleteMedia(messageId: string | number) {
    const confirmDelete = window.confirm("Delete this media message?");
    if (!confirmDelete) return;

    try {
      await api(`/api/messages/${messageId}`, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => String(m.id) !== String(messageId)));
    } catch (err: any) {
      console.error("Failed to delete media", err);
      toast.error(err?.message ?? "Unable to delete media right now.");
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const form = new FormData();
      form.append("conversationId", String(convo.id));
      form.append("file", file);

      const data = await api<{ ok: boolean; message: Msg }>("/api/upload-media", {
        method: "POST",
        body: form,
      });

      if (data?.message) {
        setMessages((prev) => [...prev, data.message]);
        scrollToBottom("smooth");
      }
    } catch (err: any) {
      console.error("Failed to send media", err);
      toast.error(err?.message ?? "Unable to send media right now.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleAttachClick() {
    if (!agentAllowed) {
      revealBotModeHint();
      return;
    }

    if (composerBlockedByWindow) {
      return;
    }
    fileInputRef.current?.click();
  }

  function revealBotModeHint() {
    setShowBotModeHint(true);
  }

  async function handleTemplateSent() {
    await loadMessages({ preserveExisting: true });
  }

  useEffect(() => {
    async function loadProducts() {
      try {
        const data = await api<ProductsResponse>("/api/products");
        const map: Record<string, string> = {};
        for (const p of data.items ?? []) {
          map[p.sku] = p.name;
        }
        setProductNames(map);
      } catch (err) {
        console.error("Failed to load products for thread display", err);
      }
    }
    void loadProducts();
  }, []);

  const oldestUnreadIndex = (() => {
    if (!messages.length) return -1;
    return messages.findIndex(
      (m) => (m.direction === "in" || m.direction === "inbound") && m.status !== "read"
    );
  })();

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    const el = messagesRef.current;
    if (!el) return;

    if (behavior === "smooth") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      return;
    }

    el.scrollTop = el.scrollHeight;
  };

  const scrollToOldestUnread = () => {
    if (oldestUnreadIndex < 0) return false;
    const container = messagesRef.current;
    const target = firstUnreadRef.current;
    if (!container || !target) return false;

    const offset = Math.max(0, target.offsetTop - 12);
    container.scrollTop = offset;
    return true;
  };

  const handleScroll = () => {
    const el = messagesRef.current;
    if (!el) return;

    const threshold = 50;
    const distFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setIsAtBottom(distFromBottom <= threshold);
  };

  async function loadMessages(options?: { preserveExisting?: boolean }) {
    const preserveExisting = options?.preserveExisting ?? messages.length > 0;

    if (preserveExisting) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const { items } = await api<{ items: Msg[] }>(`/api/conversations/${convo.id}/messages`);
      setMessages(items ?? []);
      setActiveMediaActionsId(null);
    } catch (err) {
      console.error("Failed to load messages", err);
      setMessages([]);
      setActiveMediaActionsId(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setAgentAllowed(convo.agent_allowed);
    setMessages([]);
    setText("");
    setActiveMediaActionsId(null);
    setShowBotModeHint(false);
    setTemplateModalOpen(false);
    setDismissedHeaderFailureId(null);
    setDismissedComposerNoticeKey(null);
    initialScrolledRef.current = false;
    setIsAtBottom(true);
    void loadMessages({ preserveExisting: false });
  }, [convo.id, convo.agent_allowed]);

  useEffect(() => {
    if (agentAllowed) {
      setShowBotModeHint(false);
    }
  }, [agentAllowed]);

  useEffect(() => {
    if (!messages.length) return;

    if (!initialScrolledRef.current) {
      const didScrollToUnread = scrollToOldestUnread();
      if (!didScrollToUnread) scrollToBottom("auto");
      initialScrolledRef.current = true;
      setIsAtBottom(true);
      return;
    }

    if (isAtBottom) {
      scrollToBottom("smooth");
    }
  }, [messages, oldestUnreadIndex, isAtBottom]);

  useEffect(() => {
    const s = socket();
    if (!s) return;

    const handler = (payload: any) => {
      if (!payload || !payload.message) return;
      if (String(payload.conversation_id) !== String(convo.id)) return;

      const msg = payload.message as Msg;

      setMessages((prev) => {
        if (!prev.some((m) => String(m.id) === String(msg.id))) {
          return [...prev, msg];
        }

        return prev.map((existing) =>
          String(existing.id) === String(msg.id) ? msg : existing
        );
      });
    };

    s.on("message.created", handler);
    return () => {
      s.off("message.created", handler);
    };
  }, [convo.id]);

  async function toggleAgentMode() {
    const next = !agentAllowed;
    setToggling(true);
    setAgentAllowed(next);

    try {
      await api(`/api/conversations/${convo.id}/agent-allow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_allowed: next, allowed: next }),
      });
    } catch (err) {
      console.error("Failed to toggle agent mode", err);
      setAgentAllowed(!next);
      toast.error("Unable to update handover mode right now.");
    } finally {
      setToggling(false);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;

    if (!agentAllowed) {
      revealBotModeHint();
      return;
    }

    const optimisticId = `temp-${Date.now()}`;
    const optimisticMessage: Msg = {
      id: optimisticId,
      conversation_id: convo.id,
      direction: "outbound",
      type: "text",
      body: value,
      status: "sending",
      created_at: new Date().toISOString(),
    };

    setSending(true);
    setText("");
    setMessages((prev) => [...prev, optimisticMessage]);
    scrollToBottom("smooth");

    try {
      await api("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convo.id,
          text: value,
        }),
      });

      await loadMessages({ preserveExisting: true });
    } catch (err) {
      console.error("Failed to send message", err);
      setMessages((prev) => prev.filter((m) => String(m.id) !== optimisticId));
      setText(value);
      const apiErr = err as ApiError;
      if (apiErr.code === "template_required") {
        await loadMessages({ preserveExisting: true });
      } else {
        await loadMessages({ preserveExisting: true });
        toast.error("Unable to send the message right now.");
      }
    } finally {
      setSending(false);
    }
  }

  const title = convo.name || formatPhonePretty(convo.phone);
  const freeReplyState = useMemo(
    () => getFreeReplyState(convo.last_user_message_at),
    [convo.last_user_message_at]
  );
  const latestOutbound = useMemo(
    () => [...messages].reverse().find((msg) => isOutboundMessage(msg)) ?? null,
    [messages]
  );
  const composerBlockedByWindow = agentAllowed && !freeReplyState.allowed;
  const latestFailedOutbound =
    latestOutbound && String(latestOutbound.status ?? "").toLowerCase() === "failed"
      ? latestOutbound
      : null;
  const shouldShowHeaderFailure =
    !!latestFailedOutbound &&
    String(latestFailedOutbound.status_reason ?? "").toLowerCase() !== "template_required" &&
    String(dismissedHeaderFailureId ?? "") !== String(latestFailedOutbound.id);
  const rawComposerNotice = showBotModeHint && !agentAllowed
    ? {
        key: "bot_mode",
        message: "Bot mode is active. Switch to Agent Mode to send a manual reply.",
        actionLabel: null as string | null,
      }
    : composerBlockedByWindow
      ? {
          key: "template_required",
          message:
            "Manual free-text is paused because the conversation is outside WhatsApp's free reply window.",
          actionLabel: "Use template",
        }
      : null;
  const composerNotice =
    rawComposerNotice && dismissedComposerNoticeKey !== rawComposerNotice.key
      ? rawComposerNotice
      : null;

  return (
    <div className="thread">
      <div className="thread-header">
        <div className="thread-lane thread-lane--header">
          <div className="thread-header-main">
            <div className="thread-title-row">
              <div
                className="thread-identity"
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (onToggleContext) {
                    onToggleContext();
                    return;
                  }
                  onOpenContext?.();
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (onToggleContext) {
                      onToggleContext();
                      return;
                    }
                    onOpenContext?.();
                  }
                }}
              >
              <div className="thread-title" title={title}>
                {title}
              </div>
              <div className="thread-title-badges">
              <span
                className={
                  "thread-mode-chip" +
                  (agentAllowed ? " thread-mode-chip--agent" : " thread-mode-chip--bot")
                }
              >
                {agentAllowed ? "Human" : "Bot"}
              </span>
              {freeReplyState.allowed ? (
                <span className={freeReplyState.className}>{freeReplyState.label}</span>
              ) : (
                <span
                  className={freeReplyState.className + " thread-state-badge--button"}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    setTemplateModalOpen(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      setTemplateModalOpen(true);
                    }
                  }}
                >
                  {freeReplyState.label}
                </span>
              )}
              </div>
              <div className="thread-subtitle">
              {formatPhonePretty(convo.phone)}
              {convo.lang && (
                <span className="thread-lang"> · {convo.lang.toUpperCase()}</span>
              )}
              {(convo.restock_subscribed_count ?? 0) > 0 && (
                <span className="badge badge--restock thread-restock-badge">
                  Stock Alert
                  {(convo.restock_subscribed_count ?? 0) > 1
                    ? ` ${convo.restock_subscribed_count}`
                    : ""}
                </span>
              )}
              </div>
              </div>
            </div>
            <div className="thread-header-actions">
              <button
                type="button"
                className="thread-header-action"
                onClick={() => router.push(`/orders?phone=${encodeURIComponent(convo.phone)}`)}
              >
                Open orders
              </button>
              {onOpenContext || onToggleContext ? (
                <button
                  type="button"
                  className="thread-header-action"
                  onClick={() => {
                    if (onToggleContext) {
                      onToggleContext();
                      return;
                    }
                    onOpenContext?.();
                  }}
                >
                  {contextOpen ? "Hide summary" : "Summary"}
                </button>
              ) : null}
              {composerBlockedByWindow ? (
                <button
                  type="button"
                  className="thread-header-action"
                  onClick={() => setTemplateModalOpen(true)}
                >
                  Use template
                </button>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className={"thread-agent-toggle" + (agentAllowed ? " thread-agent-toggle--on" : "")}
            onClick={toggleAgentMode}
            disabled={toggling}
            title={agentAllowed ? "Agent mode is active" : "Bot mode is active"}
            aria-label={agentAllowed ? "Switch to Bot Mode" : "Switch to Agent Mode"}
          >
            <span className="thread-agent-toggle-left">
              <span className="thread-agent-toggle-icon" aria-hidden="true">
                {agentAllowed ? "A" : "B"}
              </span>
              <span className="thread-agent-toggle-text">
                {agentAllowed ? "Agent Mode" : "Bot Mode"}
              </span>
            </span>
          </button>
        </div>
      </div>

      {shouldShowHeaderFailure ? (
        <div className="thread-failure-wrap">
          <div className="thread-lane">
            <div className="thread-failure-banner" role="status" aria-live="polite">
              <div className="thread-failure-banner-main">
                <div className="thread-failure-banner-title">Latest outbound message failed</div>
                <div className="thread-failure-banner-copy">
                  {describeFailure(latestFailedOutbound)}
                </div>
              </div>
              <button
                type="button"
                className="thread-banner-close"
                onClick={() => setDismissedHeaderFailureId(latestFailedOutbound.id)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="thread-body">
        {loading && messages.length === 0 ? (
          <div className="thread-loading-state">
            <ThreadSkeleton rows={8} />
          </div>
        ) : messages.length === 0 ? (
          <div className="thread-loading-state">
            <EmptyState
              eyebrow="Conversation"
              title="No messages yet."
              description="This thread will populate as the customer and operators exchange messages."
            />
          </div>
        ) : (
          <div className="thread-messages" ref={messagesRef} onScroll={handleScroll}>
            <div className="thread-lane thread-lane--messages">
              {messages.map((m, idx) => {
                const prevByDate = idx > 0 ? messages[idx - 1] : null;
                const currentDay = m.created_at?.slice(0, 10);
                const previousDay = prevByDate?.created_at?.slice(0, 10);
                const showDayDivider = idx === 0 || currentDay !== previousDay;

                const role = getRole(m);
                const inbound = role === "customer";
                const outbound = !inbound;

                const prev = idx > 0 ? messages[idx - 1] : null;
                const next = idx < messages.length - 1 ? messages[idx + 1] : null;

                const prevRole = prev ? getRole(prev) : null;
                const nextRole = next ? getRole(next) : null;

                const gapPrev =
                  prev && prev.created_at && m.created_at
                    ? minutesBetween(prev.created_at, m.created_at)
                    : Number.POSITIVE_INFINITY;

                const gapNext =
                  next && next.created_at && m.created_at
                    ? minutesBetween(m.created_at, next.created_at)
                    : Number.POSITIVE_INFINITY;

                const groupedWithPrev =
                  !!prev && prevRole === role && gapPrev <= GROUP_GAP_MINUTES;

                const groupedWithNext =
                  !!next && nextRole === role && gapNext <= GROUP_GAP_MINUTES;

                const showMeta = !groupedWithNext;
                const showBotLabel = role === "bot" && !groupedWithPrev;
                const isFirstUnread = idx === oldestUnreadIndex;
                const transport = outbound ? describeMessageTransport(m) : null;
                const isSending = outbound && (m.status === "sending" || m.status === "pending");
                const isFailed = outbound && String(m.status ?? "").toLowerCase() === "failed";

                const bubbleClass =
                  "thread-bubble" +
                  (role === "bot" ? " thread-bubble--bot" : "") +
                  (outbound ? " thread-bubble--outbound" : " thread-bubble--inbound") +
                  (groupedWithPrev ? " thread-bubble--stacked-prev" : "") +
                  (groupedWithNext ? " thread-bubble--stacked-next" : "") +
                  (isSending ? " thread-bubble--pending" : "") +
                  (isFailed ? " thread-bubble--failed" : "");

                const msgClass =
                  "thread-message " +
                  (outbound ? "thread-message--outbound" : "thread-message--inbound") +
                  (groupedWithPrev ? " thread-message--grouped" : "") +
                  (role === "bot" ? " thread-message--bot" : "");

                return (
                  <Fragment key={m.id}>
                    {showDayDivider ? (
                      <div className="thread-day-divider">
                        <span>{formatDayLabel(m.created_at)}</span>
                      </div>
                    ) : null}

                    <div ref={isFirstUnread ? firstUnreadRef : null} className={msgClass}>
                      {showBotLabel && <div className="thread-role-label">Bot</div>}
                      {m.message_kind === "template" && !groupedWithPrev ? (
                        <div className="thread-role-label">
                          Template
                          {getTemplateHistoryLabel(m)
                            ? ` · ${formatTemplateDisplayName(getTemplateHistoryLabel(m))}`
                            : ""}
                        </div>
                      ) : null}

                      <div className={bubbleClass}>
                        {renderBody(
                          m,
                          productNames,
                          handleResendMedia,
                          handleDeleteMedia,
                          activeMediaActionsId,
                          handleToggleMediaActions
                        )}

                        {showMeta && (
                          <div className="thread-meta">
                            <span className="thread-time">{formatTime(m.created_at)}</span>
                            {outbound && transport && (
                              <span
                                className={transport.className}
                                aria-label={transport.label.toLowerCase()}
                              >
                                {transport.label}
                              </span>
                            )}
                          </div>
                        )}
                        {isFailed ? (
                          <div className="thread-failure-copy">{describeFailure(m)}</div>
                        ) : null}
                      </div>
                    </div>
                  </Fragment>
                );
              })}
            </div>

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      <div className="thread-footer">
        <div className="thread-lane thread-lane--composer">
          {composerNotice ? (
            <div
              className="thread-composer-inline-hint"
              role="status"
              aria-live="polite"
            >
              <span>{composerNotice.message}</span>
              <div className="thread-composer-inline-actions">
                {composerNotice.actionLabel ? (
                  <button
                    type="button"
                    className="thread-header-action thread-header-action--inline"
                    onClick={() => setTemplateModalOpen(true)}
                  >
                    {composerNotice.actionLabel}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="thread-inline-dismiss"
                  onClick={() => setDismissedComposerNoticeKey(composerNotice.key)}
                >
                  Close
                </button>
              </div>
            </div>
          ) : null}
          <div className="thread-input-row">
            <button
              type="button"
              className="thread-attach-button"
              onClick={handleAttachClick}
              title="Add attachment"
              aria-label="Add attachment"
            >
              Add
            </button>

            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
              onChange={handleFileChange}
            />

            <input
              className="thread-input"
              value={text}
              onChange={(e) => {
                if (!agentAllowed) {
                  revealBotModeHint();
                  return;
                }
                if (composerBlockedByWindow) return;
                setText(e.target.value);
              }}
              onFocus={() => {
                if (!agentAllowed) revealBotModeHint();
              }}
              onClick={() => {
                if (!agentAllowed) revealBotModeHint();
              }}
              placeholder={
                !agentAllowed
                  ? "Switch to Agent Mode to reply"
                  : composerBlockedByWindow
                    ? "Template required before the next manual reply"
                    : "Write a reply..."
              }
              onKeyDown={handleInputKeyDown}
              readOnly={!agentAllowed || composerBlockedByWindow}
            />

            <button
              type="button"
              className="thread-send-button"
              onClick={handleSend}
              disabled={sending || !agentAllowed || composerBlockedByWindow}
            >
              {sending ? "Sending..." : "Send"}
            </button>
          </div>
        </div>
      </div>
      <TemplateSendModal
        conversationId={convo.id}
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onSent={handleTemplateSent}
      />
    </div>
  );
}
