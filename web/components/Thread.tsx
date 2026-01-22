"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type FormEvent,
} from "react";
import { api, API } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";
import { socket } from "@/lib/socket";
import type { Convo } from "./ConversationList";

type ThreadProps = {
  convo: Convo;
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

const GROUP_GAP_MINUTES = 6;

type Msg = {
  id: string | number;
  conversation_id: string | number;
  direction: "in" | "inbound" | "out" | "outbound";
  type: string;
  body: string | null;
  status?: string | null;
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

/**
 * Menus stored as JSON, e.g.
 * [MENU]{"kind":"menu","subtype":"buttons","header":null,"body":"Vitendo",...}
 */
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

    // Buttons menus
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

    // List menus
    if (payload.subtype === "list" && Array.isArray(payload.sections)) {
      for (const sec of payload.sections as any[]) {
        const secTitle = typeof sec?.title === "string" ? sec.title.trim() : "";
        const rows = Array.isArray(sec?.rows) ? sec.rows : [];
        const opts = rows
          .map((r: any) =>
            typeof r === "string"
              ? r
              : typeof r?.title === "string"
              ? r.title
              : ""
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

/**
 * Menus stored as plain text, e.g.
 *
 * Vitendo:
 * • Ongeza kikapuni
 * • Nunua sasa
 * • Maelezo zaidi
 */
function parseMenuFromPlainBody(body: string): ParsedMenu | null {
  if (!body) return null;

  const rawLines = body.split("\n");
  const trimmed = rawLines.map((l) => l.trim());

  // Must have at least one "• something"
  const hasBullet = trimmed.some((l) => l.startsWith("• "));
  if (!hasBullet) return null;

  // Find first "Section:" line
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

      // Next section header
      if (line.endsWith(":")) break;

      // Option line: starts with "• "
      if (line.startsWith("• ")) {
        options.push(line.slice(2).trim());
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

/** Common React renderer for menus */
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
    return `✅ Mteja amechagua bidhaa: ${name}`;
  }

  if (id.startsWith("DETAILS_") && !id.startsWith("DETAILS2_")) {
    const sku = id.slice("DETAILS_".length);
    const name = nameForSku(sku);
    return `ℹ️ Mteja ameomba maelezo zaidi kuhusu ${name}`;
  }

  if (id.startsWith("DETAILS2_")) {
    const rest = id.slice("DETAILS2_".length);
    const [sku, section] = rest.split("_");
    const name = nameForSku(sku);
    if (section === "ABOUT") return `ℹ️ Mteja ameomba maelezo kuhusu ${name}`;
    if (section === "USAGE") return `🧴 Mteja ameomba jinsi ya kutumia ${name}`;
    if (section === "WARN") return `⚠️ Mteja ameomba tahadhari muhimu za ${name}`;
  }

  if (id.startsWith("ADD_")) {
    const sku = id.slice("ADD_".length);
    const name = nameForSku(sku);
    return `🛒 Mteja ameongeza kwenye mzigo: ${name}`;
  }

  if (id.startsWith("BUY_")) {
    const sku = id.slice("BUY_".length);
    const name = nameForSku(sku);
    return `💳 Mteja amebonyeza *Nunua sasa* — ${name}`;
  }

  if (id === "ACTION_VIEW_CART") return "🛒 Mteja ameangalia mzigo (cart)";
  if (id === "ACTION_CHECKOUT") return "✅ Mteja ameanza kukamilisha oda (checkout)";
  if (id === "ACTION_TRACK_BY_NAME") return "🔍 Mteja anafuata oda kwa jina";
  if (id === "ACTION_TALK_TO_AGENT") return "☎️ Mteja ameomba kuongea na agent";
  if (id === "ACTION_FAQ") return "❓ Mteja ameangalia maswali (FAQ)";
  if (id === "ACTION_BACK") return "↩️ Mteja amerudi kwenye menyu kuu";

  return `⛓️ Interactive: ${id}`;
}

type Role = "customer" | "agent" | "bot";

function getRole(msg: Msg): Role {
  const inbound = msg.direction === "in" || msg.direction === "inbound";
  if (inbound) return "customer";

  const body = msg.body ?? "";

  // Bot tends to send structured menus / interactive markers
  if (parseMenuFromJsonBody(body)) return "bot";
  if (parseMenuFromPlainBody(body)) return "bot";
  if (/^\[interactive:(.+)\]$/.test(body)) return "bot";

  return "agent";
}

// LOCATION handling: "LOCATION lat,lng"
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

  /* 0) Menus: JSON then plain-text */
  const jsonMenu = parseMenuFromJsonBody(body);
  if (jsonMenu) return renderMenuBlock(jsonMenu);

  if (outbound) {
    const plainMenu = parseMenuFromPlainBody(body);
    if (plainMenu) return renderMenuBlock(plainMenu);
  }

  /* 1) Old interactive markers */
  const interactiveMatch = body.match(/^\[interactive:(.+)\]$/);
  if (interactiveMatch) {
    const id = interactiveMatch[1];
    const pretty = formatInteractiveDisplay(id, products);
    return <div className="thread-text">{pretty}</div>;
  }

  /* 2) LOCATION */
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
        <div className="thread-text">Mteja ametuma lokesheni</div>
        <div className="thread-location-coords">
          {lat.toFixed(5)}, {lng.toFixed(5)}
        </div>
        <a href={url} target="_blank" rel="noreferrer" className="thread-location-link">
          Fungua kwenye ramani
        </a>
      </div>
    );
  }

  /* 3) MEDIA marker: MEDIA:kind:id */
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
          title="Hariri media"
        >
          ✏️
        </button>
      ) : null;

    const resendButton =
      typeof onResendMedia === "function" ? (
        <button
          type="button"
          className="thread-media-resend"
          onClick={() => onResendMedia(kind, mediaId)}
        >
          Tuma tena media
        </button>
      ) : null;

    const deleteButton =
      typeof onDeleteMedia === "function" ? (
        <button
          type="button"
          className="thread-media-delete"
          onClick={() => onDeleteMedia(msg.id)}
        >
          Futa media
        </button>
      ) : null;

    if (kind === "image") {
      return (
        <div className="thread-media">
          <img src={src} className="thread-image" alt="Picha kutoka mteja" />
          <a href={src} target="_blank" rel="noreferrer" className="thread-media-link">
            Fungua picha
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
            Fungua video
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
            Fungua faili
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

  /* 4) Default: plain text */
  return <div className="thread-text">{body}</div>;
}

export default function Thread({ convo }: ThreadProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [agentAllowed, setAgentAllowed] = useState<boolean>(convo.agent_allowed);
  const [text, setText] = useState("");
  const [toggling, setToggling] = useState(false);
  const [sending, setSending] = useState(false);
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  const [activeMediaActionsId, setActiveMediaActionsId] = useState<string | number | null>(null);

  // scrolling
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const firstUnreadRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const initialScrolledRef = useRef(false);

  // file input
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function handleToggleMediaActions(messageId: string | number) {
    setActiveMediaActionsId((prev) =>
      prev != null && String(prev) === String(messageId) ? null : messageId
    );
  }

  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as any);
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
      alert(err?.message ?? "Imeshindikana kutuma media tena. Tafadhali jaribu tena baadae.");
    }
  }

  async function handleDeleteMedia(messageId: string | number) {
    const confirmDelete = window.confirm("Una uhakika unataka kufuta hii media?");
    if (!confirmDelete) return;

    try {
      await api(`/api/messages/${messageId}`, { method: "DELETE" });
      setMessages((prev) => prev.filter((m) => String(m.id) !== String(messageId)));
    } catch (err: any) {
      console.error("Failed to delete media", err);
      alert(err?.message ?? "Imeshindikana kufuta media. Tafadhali jaribu tena baadae.");
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
      alert(err?.message ?? "Imeshindikana kutuma media. Tafadhali jaribu tena baadae.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleAttachClick() {
    fileInputRef.current?.click();
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

  // oldest unread inbound index
  const oldestUnreadIndex = (() => {
    if (!messages.length) return -1;
    return messages.findIndex(
      (m) => (m.direction === "in" || m.direction === "inbound") && m.status !== "read"
    );
  })();

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior, block: "end" });
    }
  };

  const scrollToOldestUnread = () => {
    if (oldestUnreadIndex < 0) return false;
    if (!firstUnreadRef.current) return false;
    firstUnreadRef.current.scrollIntoView({ behavior: "auto", block: "start" });
    return true;
  };

  const handleScroll = () => {
    const el = messagesRef.current;
    if (!el) return;

    const threshold = 50;
    const distFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setIsAtBottom(distFromBottom <= threshold);
  };

  async function loadMessages() {
    setLoading(true);
    try {
      const { items } = await api<{ items: Msg[] }>(`/api/conversations/${convo.id}/messages`);
      setMessages(items ?? []);
    } catch (err) {
      console.error("Failed to load messages", err);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }

  // Initial load when conversation changes
  useEffect(() => {
    setAgentAllowed(convo.agent_allowed);
    initialScrolledRef.current = false;
    void loadMessages();
  }, [convo.id, convo.agent_allowed]);

  // Handle scroll on message change
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

  // Socket updates
  useEffect(() => {
    const s = socket();
    if (!s) return;

    const handler = (payload: any) => {
      if (!payload || !payload.message) return;
      if (String(payload.conversation_id) !== String(convo.id)) return;

      const msg = payload.message as Msg;

      setMessages((prev) => {
        if (!prev) return [msg];
        if (prev.some((m) => String(m.id) === String(msg.id))) return prev;
        return [...prev, msg];
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
      alert("Imeshindikana kubadilisha mode, angalia server logs.");
    } finally {
      setToggling(false);
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;

    if (!agentAllowed) {
      alert("Bot mode iko ON. Washa Agent Mode ili kujibu.");
      return;
    }

    setSending(true);
    try {
      await api("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: convo.id,
          text: value,
        }),
      });

      setText("");
      await loadMessages();
    } catch (err) {
      console.error("Failed to send message", err);
      alert("Imeshindikana kutuma ujumbe, angalia server logs.");
    } finally {
      setSending(false);
    }
  }

  const title = convo.name || formatPhonePretty(convo.phone);

  return (
    <div className="thread">
      {/* HEADER */}
      <div className="thread-header">
        <div className="thread-header-main">
          <div className="thread-title" title={title}>
            {title}
          </div>
          <div className="thread-subtitle">
            {formatPhonePretty(convo.phone)}
            {convo.lang && <span className="thread-lang"> · {convo.lang.toUpperCase()}</span>}
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

<button
  type="button"
  className={"thread-agent-toggle" + (agentAllowed ? " thread-agent-toggle--on" : "")}
  onClick={toggleAgentMode}
  disabled={toggling}
  title={agentAllowed ? "Agent Mode ON" : "Bot Mode ON"}
  aria-label={agentAllowed ? "Switch to Bot Mode" : "Switch to Agent Mode"}
>
  <span className="thread-agent-toggle-left">
    <span className="thread-agent-toggle-icon" aria-hidden="true">
      {agentAllowed ? "🧑‍💼" : "🤖"}
    </span>
    <span className="thread-agent-toggle-text">
      {agentAllowed ? "Agent Mode" : "Bot Mode"}
    </span>
  </span>
</button>


      </div>

      {/* MESSAGES */}
      <div className="thread-body">
        {loading && messages.length === 0 ? (
          <div className="thread-empty">Loading messages…</div>
        ) : messages.length === 0 ? (
          <div className="thread-empty">Hakuna ujumbe bado.</div>
        ) : (
          <div className="thread-messages" ref={messagesRef} onScroll={handleScroll}>
            {messages.map((m, idx) => {
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

              // Show meta only on the last message in a group
              const showMeta = !groupedWithNext;

              // Show "Bot" label only once per bot block
              const showBotLabel = role === "bot" && !groupedWithPrev;

              const isFirstUnread = idx === oldestUnreadIndex;

              const bubbleClass =
                "thread-bubble" +
                (role === "bot" ? " thread-bubble--bot" : "") +
                (groupedWithPrev ? " thread-bubble--stacked-prev" : "") +
                (groupedWithNext ? " thread-bubble--stacked-next" : "");

              const msgClass =
                "thread-message " +
                (outbound ? "thread-message--outbound" : "thread-message--inbound") +
                (groupedWithPrev ? " thread-message--grouped" : "") +
                (role === "bot" ? " thread-message--bot" : "");

              return (
                <div
                  key={m.id}
                  ref={isFirstUnread ? firstUnreadRef : null}
                  className={msgClass}
                >
                  {showBotLabel && <div className="thread-role-label">Bot</div>}

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
                        {outbound && m.status === "read" && (
                          <span className="thread-ticks" aria-label="read">
                            ✓✓
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* COMPOSER */}
      <div className="thread-footer">
        <div className="thread-input-row">
          <button
            type="button"
            className="thread-attach-button"
            onClick={() => fileInputRef.current?.click()}
            title="Tuma picha / faili"
          >
            📎
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
            onChange={(e) => setText(e.target.value)}
            placeholder="Andika ujumbe..."
            onKeyDown={handleInputKeyDown}
          />

          <button
            type="button"
            className="thread-send-button"
            onClick={handleSend}
            disabled={sending}
          >
            {sending ? "Inatuma..." : "Tuma"}
          </button>
        </div>
      </div>
    </div>
  );
}
