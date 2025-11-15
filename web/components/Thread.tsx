// web/components/Thread.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { socket } from "@/lib/socket";
import type { Convo } from "./ConversationList";

type Msg = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  type: "text" | "template" | string;
  body: string;
  status?: string | null;
  created_at: string;
};

type ThreadProps = {
  convo: Convo;
};

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Tick({ status }: { status?: string | null }) {
  if (!status || status === "sent") return <span>✓</span>;
  if (status === "delivered") return <span>✓✓</span>;
  if (status === "read") return <span className="tick-read">✓✓</span>;
  return <span>✓</span>;
}

export default function Thread({ convo }: ThreadProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [agentAllowed, setAgentAllowed] = useState<boolean>(
    convo.agent_allowed
  );
  const [text, setText] = useState("");
  const [toggling, setToggling] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function loadMessages() {
    const { items } = await api<{ items: Msg[] }>(
      `/api/conversations/${convo.id}/messages`
    );
    setMessages(items || []);
  }

  // Load messages and subscribe to socket events
  useEffect(() => {
    setMessages([]);
    setAgentAllowed(convo.agent_allowed);
    loadMessages();

    const s = socket();
    const onNew = (payload: any) => {
      const cid =
        payload?.conversation_id ??
        payload?.conversationId ??
        payload?.conversation?.id;
      if (String(cid) === String(convo.id)) {
        loadMessages();
      }
    };
    const onConvo = (payload: any) => {
      if (
        String(payload?.id) === String(convo.id) &&
        "agent_allowed" in payload
      ) {
        setAgentAllowed(!!payload.agent_allowed);
      }
    };

    s.on("message.created", onNew);
    s.on("conversation.updated", onConvo);

    return () => {
      s.off("message.created", onNew);
      s.off("conversation.updated", onConvo);
    };
  }, [convo.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const trimmed = text.trim();
    if (!trimmed || !agentAllowed) return;

    setText("");
    await api("/api/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: convo.id,
        text: trimmed,
      }),
    });
    // messages will reload via socket "message.created"
  }

  // Admin toggle: switch between bot mode and agent mode
  async function toggleAgentMode() {
    const next = !agentAllowed;
    setToggling(true);

    // optimistic UI update
    setAgentAllowed(next);

    try {
      await api(`/api/conversations/${convo.id}/agent-allow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // send both fields so we match whichever the backend expects
        body: JSON.stringify({
          agent_allowed: next,
          allowed: next,
        }),
      });
      // backend should emit conversation.updated; our socket listener will re-sync
    } catch (err) {
      console.error("Failed to toggle agent mode", err);
      // revert UI on failure
      setAgentAllowed(!next);
      alert("Failed to change mode. Check the server logs for /agent-allow.");
    } finally {
      setToggling(false);
    }
  }


  const title = convo.name || convo.phone || "Mteja";

  return (
    <div className="thread">
      {/* Header */}
      <div className="thread-header">
        <div className="thread-header-left">
          <div className="thread-header-title" title={title}>
            {title}
          </div>
          <div className="thread-header-sub">
            {agentAllowed
              ? "Agent anaweza kujibu sasa"
              : "Bot anaendelea kuongea na mteja"}
          </div>
        </div>
        <div className="thread-header-right">
          <span className="thread-header-mode-label">Agent replies</span>
          <button
            className={
              "toggle-switch" + (agentAllowed ? " toggle-switch--on" : "")
            }
            onClick={toggleAgentMode}
            disabled={toggling}
            title={
              agentAllowed
                ? "Bonyeza kuzima na kurudisha mazungumzo kwa bot"
                : "Bonyeza kuruhusu admin kuongea na mteja"
            }
          >
            <span className="toggle-knob" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="thread-messages chat-bg scroll-y">
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              "thread-message" +
              (m.direction === "out"
                ? " thread-message--outgoing"
                : " thread-message--incoming")
            }
          >
            <div className="thread-message-body">{m.body}</div>
            <div className="thread-message-meta">
              <span className="thread-message-time">
                {formatTime(m.created_at)}
              </span>
              {m.direction === "out" && (
                <span className="thread-message-status">
                  <Tick status={m.status} />
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Bot lock banner */}
      {!agentAllowed && (
        <div className="thread-lock-banner">
          Bot inaongea na mteja. Ataenda kwa mhudumu akibonyeza{" "}
          <b>“Ongea na mhudumu”</b>. Ujumbe wa admin umefungwa kwa sasa.
        </div>
      )}

      {/* Composer */}
      <div className="thread-composer">
        <input
          className="thread-composer-input"
          value={text}
          disabled={!agentAllowed}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? send() : undefined)}
          placeholder={
            agentAllowed
              ? "Type a message"
              : "Locked by bot until customer chooses agent"
          }
        />
        <button
          className={
            "btn btn-primary" +
            (!agentAllowed || !text.trim() ? " btn-disabled" : "")
          }
          onClick={send}
          disabled={!agentAllowed || !text.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
