"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { socket } from "@/lib/socket";

export type Convo = {
  id: string;
  name?: string;
  phone: string;
  lang?: string;
  agent_allowed: boolean;
  last_user_message_at: string;
  unread_count?: number;
};

export default function ConversationList({
  onPick,
  activeId
}: {
  onPick: (c: Convo) => void;
  activeId?: string;
}) {
  const [items, setItems] = useState<Convo[]>([]);
  const [q, setQ] = useState("");

  async function load() {
    const { items } = await api<{ items: Convo[] }>("/api/conversations");
    setItems(items);
  }

  useEffect(() => {
    load();
    const s = socket();
    s.on("message.created", load);
    s.on("conversation.updated", load);
    return () => {
      s.off("message.created", load);
      s.off("conversation.updated", load);
    };
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((c) =>
      [c.name, c.phone].filter(Boolean).join(" ").toLowerCase().includes(t)
    );
  }, [items, q]);

  return (
    <div className="w-80 border-r bg-white flex flex-col">
      <div className="p-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search chats..."
          className="w-full rounded border px-3 py-2 text-sm"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c)}
            className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-gray-50 ${c.id === activeId ? "bg-gray-50" : ""}`}
          >
            <div>
              <div className="font-medium">
                {c.name || c.phone}{" "}
                {c.lang && <span className="text-xs text-gray-500">• {c.lang}</span>}
              </div>
              <div className="text-xs text-gray-500">
                {new Date(c.last_user_message_at).toLocaleTimeString()}
              </div>
            </div>
            <div className="text-xs flex items-center gap-2">
              {!c.agent_allowed && (
                <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded">Bot</span>
              )}
              {!!c.unread_count && (
                <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded">
                  {c.unread_count}
                </span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
