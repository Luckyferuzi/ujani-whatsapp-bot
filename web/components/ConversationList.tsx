// web/components/ConversationList.tsx
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
  activeId: string | null;
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
    return digits;
  }
  return raw;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ConversationList({ activeId, onPick }: Props) {
  const [items, setItems] = useState<Convo[]>([]);
  const [search, setSearch] = useState("");

  async function load() {
    const { items } = await api<{ items: Convo[] }>("/api/conversations");
    setItems(items || []);
  }

  useEffect(() => {
    load();
    const s = socket();
    const handler = () => load();
    s.on("message.created", handler);
    s.on("conversation.updated", handler);
    return () => {
      s.off("message.created", handler);
      s.off("conversation.updated", handler);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const phone = (c.phone || "").toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [items, search]);

  return (
    <div className="conversation-list">
      {/* Search */}
      <div className="conversation-search">
        <input
          className="conversation-search-input"
          placeholder="Search chats..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* List */}
      <div className="conversation-list-scroll scroll-y">
        {filtered.map((c) => {
          const isActive = String(c.id) === String(activeId);
          const title = c.name || formatPhonePretty(c.phone);
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c)}
              className={
                "conversation-item" +
                (isActive ? " conversation-item--active" : "")
              }
            >
              <div className="conversation-avatar">
                <span className="conversation-avatar-text">
                  {title.slice(0, 2).toUpperCase()}
                </span>
              </div>

              <div className="conversation-content">
                {/* Top row */}
                <div className="conversation-top-row">
                  <div className="conversation-title" title={title}>
                    {title}
                  </div>
                  <div className="conversation-time">
                    {formatTime(c.last_user_message_at)}
                  </div>
                </div>

                {/* Bottom row */}
                <div className="conversation-bottom-row">
                  <div className="conversation-subtitle">
                    {c.agent_allowed
                      ? "Agent mode kwa mazungumzo"
                      : "Bot anaendeleza mazungumzo"}
                  </div>
                  <div className="conversation-badges">
                    {!c.agent_allowed && (
                      <span className="badge badge--bot">Bot</span>
                    )}
                    {!!c.unread_count && (
                      <span className="badge badge--unread">
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
