"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { Card } from "./ui";

export type Message = { id: number; conversation_id: number; direction: "inbound" | "outbound"; type: string; body: string | null; status: string | null; created_at: string; };

export default function Thread({ conversationId }: { conversationId: number | null }) {
  const [msgs, setMsgs] = useState<Message[]>([]);

  async function load(id: number) {
    const list = await api<Message[]>(`/api/conversations/${id}/messages`);
    setMsgs(list);
  }

  useEffect(() => {
    if (!conversationId) return;
    void load(conversationId);
    const s = getSocket();
    const onMsg = (p: { conversation_id: number, message: Message }) => {
      if (p.conversation_id === conversationId) setMsgs(m => [...m, p.message]);
    };
    s.on("message.created", onMsg);
    return () => { s.off("message.created", onMsg); };
  }, [conversationId]);

  const view = useMemo(() => msgs.toSorted((a,b)=>+new Date(a.created_at)-+new Date(b.created_at)), [msgs]);

  if (!conversationId) return (
    <div className="flex items-center justify-center h-full text-ui.dim">Pick a conversation</div>
  );

  return (
    <div className="p-4 overflow-auto scroll-thin h-full">
      {view.map(m => (
        <div key={m.id} className={`max-w-[70%] mb-2 ${m.direction==='outbound' ? "ml-auto" : ""}`}>
          <Card className={`${m.direction==='outbound' ? "bg-ui.primary/10 border-ui.primary/30" : ""} px-4 py-2`}>
            <div className="whitespace-pre-wrap">{m.body}</div>
          </Card>
          <div className="text-xs text-ui.dim mt-1">{new Date(m.created_at).toLocaleString()} · {m.direction}</div>
        </div>
      ))}
    </div>
  );
}
