"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { socket } from "@/lib/socket";
import type { Convo } from "./ConversationList";

type Msg = {
  id: string;
  direction: "in" | "out";
  type: "text" | "template" | string;
  body: string;
  status?: string;
  created_at: string;
};

export default function Thread({ convo }: { convo: Convo }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [agentAllowed, setAgentAllowed] = useState(convo.agent_allowed);

  async function load() {
    const { messages } = await api<{ messages: Msg[] }>(
      `/api/conversations/${convo.id}/messages`
    );
    setMessages(messages);
  }

  useEffect(() => {
    setAgentAllowed(convo.agent_allowed);
    load();
    const s = socket();
    const onNew = (m: any) => m.conversation_id === convo.id && load();
    const onGate = (c: any) => c.id === convo.id && setAgentAllowed(!!c.agent_allowed);
    s.on("message.created", onNew);
    s.on("conversation.updated", onGate);
    return () => {
      s.off("message.created", onNew);
      s.off("conversation.updated", onGate);
    };
  }, [convo.id]);

  async function send() {
    if (!text.trim()) return;
    try {
      await api("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convo.id, text })
      });
      setText("");
    } catch (e: any) {
      // Show the full backend message (agent gate / 24h rule)
      alert(e.message);
    }
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      <div className="px-4 py-2 border-b bg-white font-medium">
        {convo.phone} • {convo.lang || "—"}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`max-w-[75%] rounded-2xl px-3 py-2 ${
              m.direction === "out" ? "ml-auto bg-blue-600 text-white" : "bg-white border"
            }`}
          >
            <div className="whitespace-pre-wrap text-sm">{m.body}</div>
            {m.direction === "out" && (
              <div className="text-[10px] opacity-70 mt-1">{m.status || "sent"}</div>
            )}
          </div>
        ))}
      </div>

      {!agentAllowed && (
        <div className="bg-yellow-50 text-yellow-800 text-sm px-3 py-2 border-t">
          Bot active — customer must tap <b>“Ongea na mhudumu”</b>. You can still send a{" "}
          <button className="underline">Template</button>.
        </div>
      )}

      <div className="border-t p-2 flex gap-2 bg-white">
        <input
          className="flex-1 rounded-xl border px-3 py-2"
          placeholder={agentAllowed ? "Type a message…" : "Locked by bot"}
          disabled={!agentAllowed}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => (e.key === "Enter" ? send() : null)}
        />
        <button
          onClick={send}
          disabled={!agentAllowed}
          className="px-4 py-2 rounded-xl bg-blue-600 text-white disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
