"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";
import { socket } from "@/lib/socket";
import type { Convo } from "./ConversationList";

type Msg = {
  id: string | number;
  conversation_id: string | number;
  direction: "in" | "out";
  type: "text" | "template" | string;
  body: string;
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

/**
 * Turn technical bodies like "[interactive:PRODUCT_KIBOKO]" into human text
 * for the inbox UI.
 */
function formatMessageBody(body: string) {
  if (!body) return "";

  // 1) [interactive:XYZ] → nice Swahili description
  const interactiveMatch = body.match(/^\[interactive:([A-Z0-9_]+)\]$/);
  if (interactiveMatch) {
    const id = interactiveMatch[1];

    const labels: Record<string, string> = {
      PRODUCT_KIBOKO: "Mteja amefungua bidhaa: Ujani Kiboko",
      BUY_KIBOKO: "Mteja amechagua: Nunua Kiboko sasa",
      DAR_INSIDE: "Mteja amechagua: Ndani ya Dar es Salaam",
      DAR_OUTSIDE: "Mteja amechagua: Nje ya Dar es Salaam",
      IN_DAR_DELIV: "Mteja amechagua: Delivery ndani ya Dar",
      IN_DAR_PICKUP: "Mteja amechagua: Kuchukua mwenyewe (pickup)",
      ACTION_VIEW_CART: "Mteja ameomba kuona kikapu",
      ACTION_CHECKOUT: "Mteja amechagua kwenda malipo",
      ACTION_TALK_TO_AGENT: "Mteja ameomba kuongea na agent",
      // ongeza zingine kadri unavyoziona kwenye DB
    };

    return labels[id] ?? `Mteja amechagua: ${id}`;
  }

  // 2) LOCATION lat,lon → friendly text
  if (body.startsWith("LOCATION ")) {
    return "Mteja ametuma lokesheni (GPS pin)";
  }

  // 3) default plain text
  return body;
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
  const bottomRef = useRef<HTMLDivElement | null>(null);

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

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior, block: "end" });
    }
  }

  // Initial load + when conversation changes
  useEffect(() => {
    setAgentAllowed(convo.agent_allowed);
    loadMessages().then(() => scrollToBottom("auto"));
  }, [convo.id, convo.agent_allowed]);

  // Smooth scroll when new messages arrive
  useEffect(() => {
    if (messages.length > 0) scrollToBottom("smooth");
  }, [messages.length]);

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
          // 🔴 Backend expects `conversationId` exactly like this
          conversationId: convo.id,
          text: value,
        }),
      });

      // new message will arrive via socket
      setText("");
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
          <div className="thread-messages">
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  "thread-message " +
                  (m.direction === "out"
                    ? "thread-message--outgoing"
                    : "thread-message--incoming")
                }
              >
                <div className="thread-bubble">
                  <div className="thread-text">
                    {formatMessageBody(m.body)}
                  </div>
                  <div className="thread-meta">
                    <span className="thread-time">
                      {formatTime(m.created_at)}
                    </span>
                    {m.status && (
                      <span className="thread-status"> · {m.status}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
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
