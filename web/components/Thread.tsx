"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type FormEvent
} from "react";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";
import { socket } from "@/lib/socket";
import type { Convo } from "./ConversationList";
import Image from "next/image";

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

function formatInteractiveDisplay(
  id: string,
  products: Record<string, string>
): string {
  if (!id) return "";

  const nameForSku = (sku: string) => products[sku] ?? sku;

  // Customer selected a product from the list
  if (id.startsWith("PRODUCT_")) {
    const sku = id.slice("PRODUCT_".length);
    const name = nameForSku(sku);
    return `✅ Mteja amechagua bidhaa: ${name}`;
  }

  // First-level "Maelezo zaidi" (DETAILS_<SKU>)
  if (id.startsWith("DETAILS_") && !id.startsWith("DETAILS2_")) {
    const sku = id.slice("DETAILS_".length);
    const name = nameForSku(sku);
    return `ℹ️ Mteja ameomba maelezo zaidi kuhusu ${name}`;
  }

  // Second-level details: DETAILS2_<SKU>_<SECTION>
  if (id.startsWith("DETAILS2_")) {
    const rest = id.slice("DETAILS2_".length); // "<SKU>_<SECTION>"
    const [sku, section] = rest.split("_");
    const name = nameForSku(sku);
    if (section === "ABOUT") {
      return `ℹ️ Mteja ameomba maelezo kuhusu ${name}`;
    }
    if (section === "USAGE") {
      return `🧴 Mteja ameomba jinsi ya kutumia ${name}`;
    }
    if (section === "WARN") {
      return `⚠️ Mteja ameomba tahadhari muhimu za ${name}`;
    }
  }

  // Add to cart
  if (id.startsWith("ADD_")) {
    const sku = id.slice("ADD_".length);
    const name = nameForSku(sku);
    return `🛒 Mteja ameongeza kwenye mzigo: ${name}`;
  }

  // Buy now
  if (id.startsWith("BUY_")) {
    const sku = id.slice("BUY_".length);
    const name = nameForSku(sku);
    return `💳 Mteja amebonyeza *Nunua sasa* — ${name}`;
  }

  // Other actions from main menu
  if (id === "ACTION_VIEW_CART") return "🛒 Mteja ameangalia mzigo (cart)";
  if (id === "ACTION_CHECKOUT") return "✅ Mteja ameanza kukamilisha oda (checkout)";
  if (id === "ACTION_TRACK_BY_NAME")
    return "🔍 Mteja anafuata oda kwa jina";
  if (id === "ACTION_TALK_TO_AGENT")
    return "☎️ Mteja ameomba kuongea na agent";
  if (id === "ACTION_FAQ") return "❓ Mteja ameangalia maswali (FAQ)";
  if (id === "ACTION_BACK") return "↩️ Mteja amerudi kwenye menyu kuu";

  // Unknown / fallback – keep it but make it clearer
  return `⛓️ Interactive: ${id}`;
}


// LOCATION handling: "LOCATION lat,lng"
function renderBody(
  msg: Msg,
  products: Record<string, string>,
  onResendMedia?: (kind: string, mediaId: string) => void
) {
  const body = msg.body ?? "";

  // 0) Interactive markers: [interactive:ID]
  const interactiveMatch = body.match(/^\[interactive:(.+)\]$/);
  if (interactiveMatch) {
    const id = interactiveMatch[1];
    const pretty = formatInteractiveDisplay(id, products);
    return <div className="thread-text">{pretty}</div>;
  }

  // 1) LOCATION "LOCATION lat,lng"
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
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="thread-location-link"
        >
          Fungua kwenye ramani
        </a>
      </div>
    );
  }

  // 2) MEDIA marker: MEDIA:<kind>:<mediaId>
  const mediaMatch = body.match(/^MEDIA:(image|video|audio|document):(.+)$/);
  if (mediaMatch) {
    const kind = mediaMatch[1] as "image" | "video" | "audio" | "document";
    const mediaId = mediaMatch[2];
    const src = `/api/media/${encodeURIComponent(mediaId)}`;

    const canResend =
      typeof onResendMedia === "function" &&
      (msg.direction === "out" ||
        msg.direction === "outbound" ||
        msg.direction === "inbound");

    const resendButton = canResend ? (
      <button
        type="button"
        className="thread-media-resend"
        onClick={() => onResendMedia(kind, mediaId)}
      >
        Tuma tena media
      </button>
    ) : null;

if (kind === "image") {
  return (
    <div className="thread-media">
      <Image
        src={src} // still dynamic: /api/media/<mediaId>
        alt="Picha kutoka WhatsApp"
        width={400}   // pick a size that fits your UI
        height={400}
        className="thread-image"
      />
      {resendButton}
    </div>
  );
}

    if (kind === "video") {
      return (
        <div className="thread-media">
          <video src={src} controls className="thread-video" />
          {resendButton}
        </div>
      );
    }

    if (kind === "audio") {
      return (
        <div className="thread-media">
          <audio src={src} controls className="thread-audio" />
          {resendButton}
        </div>
      );
    }

    // document
    return (
      <div className="thread-media">
        <div className="thread-text">📄 Faili kutoka mteja</div>
        <a href={src} target="_blank" rel="noreferrer">
          Fungua faili
        </a>
        {resendButton}
      </div>
    );
  }

  // 3) Default: plain text
  return <div className="thread-text">{body}</div>;
}

export default function Thread({ convo }: ThreadProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [agentAllowed, setAgentAllowed] = useState<boolean>(
    convo.agent_allowed
  );
  const [text, setText] = useState("");
  const [toggling, setToggling] = useState(false);
  const [sending, setSending] = useState(false);
  const [productNames, setProductNames] = useState<Record<string, string>>({});

  // scrolling
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const firstUnreadRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const initialScrolledRef = useRef(false);

  // 👇 NEW: file input ref
  const fileInputRef = useRef<HTMLInputElement | null>(null);


  function handleInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    // fake form event to reuse handleSend
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
    alert(
      err?.message ??
        "Imeshindikana kutuma media tena. Tafadhali jaribu tena baadae."
    );
  }
}

async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const form = new FormData();
    form.append("conversationId", String(convo.id));
    form.append("file", file);

    const data = await api<{ ok: boolean; message: Msg }>(
      "/api/upload-media",
      {
        method: "POST",
        body: form,
      }
    );

    if (data?.message) {
      setMessages((prev) => [...prev, data.message]);
      scrollToBottom("smooth");
    }
  } catch (err: any) {
    console.error("Failed to send media", err);
    alert(
      err?.message ??
        "Imeshindikana kutuma media. Tafadhali jaribu tena baadae."
    );
  } finally {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
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


  // figure out the index of the OLDEST unread inbound message
  const oldestUnreadIndex = (() => {
    if (!messages.length) return -1;
    return messages.findIndex(
      (m) =>
        (m.direction === "in" || m.direction === "inbound") &&
        m.status !== "read"
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

    const threshold = 50; // px from bottom to consider "at bottom"
    const distFromBottom = el.scrollHeight - (el.scrollTop + el.clientHeight);
    setIsAtBottom(distFromBottom <= threshold);
  };

  async function loadMessages() {
    setLoading(true);
    try {
      const { items } = await api<{ items: Msg[] }>(
        `/api/conversations/${convo.id}/messages`
      );
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

  // Handle scroll position when messages change
  useEffect(() => {
    if (!messages.length) return;

    // FIRST time we loaded messages for this conversation
    if (!initialScrolledRef.current) {
      const didScrollToUnread = scrollToOldestUnread();
      if (!didScrollToUnread) {
        scrollToBottom("auto");
      }
      initialScrolledRef.current = true;
      setIsAtBottom(true);
      return;
    }

    // AFTER initial load: only auto-scroll if user is already at bottom
    if (isAtBottom) {
      scrollToBottom("smooth");
    }
  }, [messages, oldestUnreadIndex, isAtBottom]);

  // Live Socket.IO updates: append new messages
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
    setAgentAllowed(next); // optimistic

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

    // 🔁 Ensure we see our own message even if socket doesn't fire
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
            {convo.lang && (
              <span className="thread-lang">
                {" "}
                · {convo.lang.toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          className={
            "thread-agent-toggle" +
            (agentAllowed ? " thread-agent-toggle--on" : "")
          }
          onClick={toggleAgentMode}
          disabled={toggling}
        >
          <span>{agentAllowed ? "Agent Mode" : "Chatbot Mode"}</span>
          <span className="thread-agent-pill">
            <span
              className={
                "thread-agent-dot" +
                (agentAllowed ? " thread-agent-dot--on" : "")
              }
            />
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
          <div
            className="thread-messages"
            ref={messagesRef}
            onScroll={handleScroll}
          >
{messages.map((m, idx) => {
  const inbound =
    m.direction === "in" || m.direction === "inbound";
  const outbound = !inbound;
  const isFirstUnread = idx === oldestUnreadIndex;

  return (
    <div
      key={m.id}
      ref={isFirstUnread ? firstUnreadRef : null}
      className={
        "thread-message " +
        (outbound
          ? "thread-message--outbound"
          : "thread-message--inbound")
      }
    >
      <div className="thread-bubble">
        {renderBody(m, productNames, handleResendMedia)}
        <div className="thread-meta">
          <span className="thread-time">
            {formatTime(m.created_at)}
          </span>
          {outbound && m.status === "read" && (
            <span className="thread-ticks" aria-label="read">
              ✓✓
            </span>
          )}
        </div>
      </div>
    </div>
  );
})}


            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* COMPOSER */}
      {/* FOOTER: text + file upload */}
      <div className="thread-footer">
        <div className="thread-input-row">
          {/* ATTACH BUTTON + HIDDEN FILE INPUT */}
          <button
            type="button"
            className="thread-attach-button"
            onClick={handleAttachClick}
            title="Tuma picha / faili"
          >
            📎
          </button>

          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            // allow common WhatsApp media types
            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
            onChange={handleFileChange}
          />

          {/* EXISTING TEXT INPUT */}
          <input
            className="thread-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Andika ujumbe..."
            onKeyDown={handleInputKeyDown}
          />

          {/* EXISTING SEND BUTTON */}
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
