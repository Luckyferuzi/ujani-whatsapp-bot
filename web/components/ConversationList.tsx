"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { socket } from "@/lib/socket";

export type Convo = {
  id: string;
  name?: string | null;
  phone: string;
  lang?: string | null;
  agent_allowed: boolean;
  last_user_message_at: string;
  unread_count?: number;
};

type Props = {
  activeId?: string | null;
  onPick: (c: Convo) => void;
};

function formatPhonePretty(raw?: string | null) {
  if (!raw) return "Unknown";
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+255") && digits.length >= 10) {
    const body = digits.slice(4);
    return `+255 ${body.slice(0, 3)} ${body.slice(3, 6)} ${body.slice(6)}`;
  }
  if (digits.startsWith("+") && digits.length > 7) {
    return digits.replace(/(\+\d{1,3})(\d{3})(\d{3})(\d+)/, "$1 $2 $3 $4");
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return digits;
}

function formatTime(ts?: string) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ConversationList({ activeId, onPick }: Props) {
  const [items, setItems] = useState<Convo[]>([]);
  const [query, setQuery] = useState("");

  async function load() {
    // IMPORTANT: backend returns { items: [...] }
    const { items } = await api<{ items: Convo[] }>("/api/conversations");

    items.sort(
      (a, b) =>
        new Date(b.last_user_message_at).getTime() -
        new Date(a.last_user_message_at).getTime()
    );

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
    const t = query.trim().toLowerCase();
    if (!t) return items;
    return items.filter((c) =>
      [c.name, c.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(t)
    );
  }, [items, query]);

  return (
    <div className="w-[24rem] border-r bg-white flex flex-col">
      {/* Search bar */}
      <div className="p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search or start a new chat"
          className="w-full h-9 px-3 rounded-full bg-[#f0f2f5] text-sm outline-none border border-transparent focus:border-gray-300"
        />
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((c) => {
          const isActive = c.id === activeId;
          const displayName = c.name || formatPhonePretty(c.phone);

          return (
            <button
              key={c.id}
              onClick={() => onPick(c)}
              className={[
                "w-full px-3 py-2 flex items-center gap-3 hover:bg-[#f5f6f6]",
                isActive ? "bg-[#e9edef]" : "",
              ].join(" ")}
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center text-xs font-semibold text-gray-800">
                {displayName[0]?.toUpperCase() ?? "?"}
              </div>

              <div className="flex-1 min-w-0">
                {/* Top row: name + time */}
                <div className="flex items-center justify-between">
                  <div className="font-medium text-sm truncate">
                    {displayName}
                    {c.lang && (
                      <span className="ml-1 text-[11px] text-gray-500">
                        • {c.lang.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 ml-2">
                    {formatTime(c.last_user_message_at)}
                  </div>
                </div>

                {/* Bottom row: preview + badges */}
                <div className="flex items-center justify-between mt-0.5">
                  <div className="text-xs text-gray-600 truncate max-w-[11rem]">
                    {c.agent_allowed
                      ? "Agent mode kwa mazungumzo"
                      : "Bot anaendeleza mazungumzo"}
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
