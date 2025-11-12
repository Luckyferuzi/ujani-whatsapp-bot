"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { Input, Badge } from "./ui";

export type Conversation = { id: number; last_user_message_at: string | null; name?: string | null; phone?: string | null; agent_allowed?: boolean };

export default function ConversationList(props: { current?: number | null; onPick(id: number): void; }) {
  const { current, onPick } = props;
  const [items, setItems] = useState<Conversation[]>([]);
  const [q, setQ] = useState("");

  async function load() {
    const rows = await api<Conversation[]>("/api/conversations");
    setItems(rows);
  }

  useEffect(() => {
    void load();
    const s = getSocket();
    s.on("conversation.updated", load);
    s.on("message.created", load);
    return () => { s.off("conversation.updated", load); s.off("message.created", load); };
  }, []);

  const filtered = q.trim()
    ? items.filter(i => (i.name || "").toLowerCase().includes(q.toLowerCase()) || (i.phone || "").includes(q))
    : items;

  return (
    <div className="h-full flex flex-col">
      <div className="p-3 border-b border-ui.border">
        <Input placeholder="Search…" value={q} onChange={e => setQ(e.target.value)} />
      </div>
      <div className="flex-1 overflow-auto scroll-thin">
        {filtered.map(c => (
          <button key={c.id}
            onClick={() => onPick(c.id)}
            className={`w-full text-left px-3 py-2 border-b border-ui.border/50 hover:bg-ui.soft ${current === c.id ? "bg-ui.soft" : ""}`}>
            <div className="flex items-center gap-2">
              <div className="font-medium">{c.name || c.phone || "Mteja"}</div>
              {!c.last_user_message_at && <Badge>New</Badge>}
            </div>
            <div className="text-xs text-ui.dim">{c.last_user_message_at ? new Date(c.last_user_message_at).toLocaleString() : "—"}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
