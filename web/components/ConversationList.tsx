// web/components/ConversationList.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { socket } from "@/lib/socket";
import { Input } from "./ui";

export type Convo = {
  id: number;
  name?: string | null;
  phone?: string | null;
  lang?: string | null;
  agent_allowed: boolean;
  last_user_message_at: string | null;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  unread_count?: number;
};

type Props = {
  activeId: number | null;
  onPick(convo: Convo): void;
};

function formatPhonePretty(raw?: string | null) {
  if (!raw) return "Unknown";
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+255") && digits.length >= 10) {
    const body = digits.slice(4);
    return `+255 ${body.slice(0, 3)} ${body.slice(3, 6)} ${body.slice(6)}`;
  }
  return digits;
}

function formatTime(ts?: string | null) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ConversationList({ activeId, onPick }: Props) {
  const [items, setItems] = useState<Convo[]>([]);
  const [q, setQ] = useState("");

  async function load() {
    const { items } = await api<{ items: Convo[] }>("/api/conversations");
    // newest first (by last message from either side)
    items.sort((a, b) => {
      const ta = new Date(a.last_message_at ?? a.last_user_message_at ?? 0).getTime();
      const tb = new Date(b.last_message_at ?? b.last_user_message_at ?? 0).getTime();
      return tb - ta;
    });
    setItems(items);
  }

  useEffect(() => {
    load();

    const s = socket();
    const reload = () => load();

    s.on("message.created", reload);
    s.on("conversation.updated", reload);

    return () => {
      s.off("message.created", reload);
      s.off("conversation.updated", reload);
    };
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((c) =>
      [c.name, c.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(t)
    );
  }, [items, q]);

  return (
    <div className="w-[24rem] border-r bg-white flex flex-col">
      {/* Search bar like WhatsApp */}
      <div className="p-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search or start a new chat"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((c) => {
          const isActive = c.id === activeId;
          return (
            <button
              key={c.id}
              onClick={() => onPick(c)}
              className={[
                "w-full px-3 py-2 flex items-center gap-3 hover:bg-[#f5f6f6]",
                isActive ? "bg-[#e9edef]" : "",
              ].join(" ")}
            >
              {/* Avatar placeholder */}
              <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-xs text-gray-700">
                {c.name?.[0]?.toUpperCase() ??
                  formatPhonePretty(c.phone)[0] ??
                  "?"}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm truncate">
                    {c.name || formatPhonePretty(c.phone)}
                    {c.lang && (
                      <span className="ml-1 text-xs text-gray-500">
                        • {c.lang.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 ml-2">
                    {formatTime(c.last_message_at ?? c.last_user_message_at)}
                  </div>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <div className="text-xs text-gray-600 truncate max-w-[11rem]">
                    {c.last_message_preview || ""}
                  </div>
                  <div className="flex items-center gap-2">
                    {!c.agent_allowed && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
                        Bot
                      </span>
                    )}
                    {!!c.unread_count && (
                      <span className="min-w-[1.4rem] text-center text-[11px] px-1.5 py-0.5 rounded-full bg-green-500 text-white">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
