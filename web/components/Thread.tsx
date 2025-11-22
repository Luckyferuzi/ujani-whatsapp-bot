"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";
import { socket } from "@/lib/socket";
import type { Convo } from "./ConversationList";

type Msg = {
  id: string | number;
  conversation_id: string | number;
  direction: "in" | "inbound" | "out" | "outbound";
  type: string;
  body: string | null;
  status?: string | null;
  created_at: string;
};

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

// LOCATION handling: "LOCATION lat,lng"
function renderBody(msg: Msg) {
  const body = msg.body ?? "";
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

  // scrolling
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const firstUnreadRef = useRef<HTMLDivElement | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const initialScrolledRef = useRef(false);

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

async function handleSend(e: React.FormEvent) {
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
                      ? "thread-message--outgoing"
                      : "thread-message--incoming")
                  }
                >
                  <div className="thread-bubble">
                    {renderBody(m)}
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
      <form className="thread-composer" onSubmit={handleSend}>
        <textarea
          className="thread-input"
          placeholder={
            agentAllowed
              ? "Andika jibu kwa mteja…"
              : "Bot mode iko ON, agent hawezi kujibu."
          }
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={!agentAllowed || sending}
        />
        <button
          type="submit"
          className="thread-send"
          disabled={!agentAllowed || sending || !text.trim()}
        >
          Tuma
        </button>
      </form>
    </div>
  );
}
