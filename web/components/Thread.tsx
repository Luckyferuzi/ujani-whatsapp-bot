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
  if (status === "read") return <span className="text-[#34B7F1]">✓✓</span>;
  return <span>✓</span>;
}

export default function Thread({ convo }: ThreadProps) {
  // IMPORTANT: start as [] so map() always works
  const [messages, setMessages] = useState<Msg[]>([]);
  const [agentAllowed, setAgentAllowed] = useState<boolean>(convo.agent_allowed);
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function loadMessages() {
  const { items } = await api<{ items: Msg[] }>(
    `/api/conversations/${convo.id}/messages`
  );
  setMessages(items || []);
}


  useEffect(() => {
    // when switching conversations, clear view then load
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
      if (String(payload?.id) === String(convo.id) && "agent_allowed" in payload) {
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
    // server will broadcast message.created → loadMessages via socket
  }

  const bgPattern = {
    backgroundColor: "#efeae2",
    backgroundImage:
      "radial-gradient(rgba(0,0,0,0.03) 1px, transparent 1px), radial-gradient(rgba(0,0,0,0.03) 1px, transparent 1px)",
    backgroundSize: "16px 16px",
    backgroundPosition: "0 0, 8px 8px",
  } as const;

  const title = convo.name || convo.phone || "Mteja";

  return (
    <div className="flex-1 flex flex-col border-r bg-[#efeae2]">
      {/* Header (like WhatsApp chat header) */}
      <div className="h-12 border-b bg-[#f0f2f5] px-4 flex items-center justify-between">
        <div className="font-medium text-sm truncate">{title}</div>
        <div className="text-[11px] text-gray-500">
          {agentAllowed ? "Agent mode" : "Bot mode"}
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 space-y-2"
        style={bgPattern}
      >
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[70%] rounded-lg px-3 py-2 text-sm leading-5 ${
              m.direction === "out"
                ? "ml-auto bg-[#DCF8C6]"
                : "mr-auto bg-white"
            }`}
          >
            <div className="whitespace-pre-wrap">{m.body}</div>
            <div className="mt-1 text-[10px] text-gray-600 flex items-center gap-1 justify-end">
              <span>{formatTime(m.created_at)}</span>
              {m.direction === "out" && <Tick status={m.status} />}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Bot lock banner */}
      {!agentAllowed && (
        <div className="bg-yellow-50 text-yellow-800 text-xs px-3 py-2 border-t">
          Bot inaongea na mteja. Ataenda kwa mhudumu akibonyeza{" "}
          <b>“Ongea na mhudumu”</b>. Ujumbe wa admin umefungwa kwa sasa.
        </div>
      )}

      {/* Composer */}
      <div className="border-t bg-[#f0f2f5] px-3 py-2 flex items-center gap-2">
        <input
          value={text}
          disabled={!agentAllowed}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? send() : undefined)}
          placeholder={
            agentAllowed
              ? "Type a message"
              : "Locked by bot until customer chooses agent"
          }
          className="flex-1 rounded-full border border-gray-300 px-3 py-2 text-sm bg-white disabled:bg-gray-100 disabled:text-gray-400"
        />
        <button
          onClick={send}
          disabled={!agentAllowed || !text.trim()}
          className="px-4 py-2 rounded-full bg-[#128C7E] text-white text-sm font-medium disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
