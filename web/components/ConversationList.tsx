"use client";

import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";

export type Convo = {
  id: string;
  name?: string | null;
  phone: string;
  lang?: string | null;
  agent_allowed: boolean;
  last_user_message_at: string;
  unread_count?: number;
  last_message_text?: string | null;
};

type Props = {
  activeId: string | null;
  onPick: (c: Convo) => void;
};

function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("sw-TZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ConversationList: React.FC<Props> = ({ activeId, onPick }) => {
  const [items, setItems] = useState<Convo[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<{ items: Convo[] }>("/api/conversations");
      setItems(data.items ?? []);
    } catch (err) {
      console.error("failed to load conversations", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      void load();
    }, 3_000); // feels live but not crazy
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const name = (c.name ?? "").toLowerCase();
      const phone = c.phone.toLowerCase();
      return name.includes(q) || phone.includes(q);
    });
  }, [items, search]);

  return (
    <div className="conversation-list">
      <div className="conversation-search">
        <input
          type="text"
          placeholder="Search chats..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && items.length === 0 ? (
        <div className="conversation-empty">Loading chats…</div>
      ) : filtered.length === 0 ? (
        <div className="conversation-empty">No conversations found.</div>
      ) : (
        <ul className="conversation-items">
          {filtered.map((c) => {
            const isSelected = c.id === activeId;
            const initials = (c.name || c.phone || "?")
              .slice(-2)
              .toUpperCase();
            const title =
              c.name && c.name.trim().length > 0
                ? c.name
                : formatPhonePretty(c.phone);

            const rawSubtitle =
              c.last_message_text && c.last_message_text.trim().length > 0
                ? c.last_message_text
                : c.agent_allowed
                ? "Agent mode kwa mazungumzo"
                : "Bot anaendeleza mazungumzo";

            const subtitle =
              rawSubtitle.length > 45
                ? rawSubtitle.slice(0, 42) + "..."
                : rawSubtitle;

            const timeText = c.last_user_message_at
              ? formatTime(c.last_user_message_at)
              : "";

            const unread = c.unread_count ?? 0;

            return (
              <li
                key={c.id}
                className={
                  "conversation-item" +
                  (isSelected ? " conversation-item--selected" : "") +
                  (unread > 0 ? " conversation-item--unread" : "")
                }
                onClick={() => onPick(c)}
              >
                <div className="conversation-avatar">
                  <span>{initials}</span>
                </div>
                <div className="conversation-main">
                  <div className="conversation-top-row">
                    <span className="conversation-title">{title}</span>
                    <div className="conversation-top-right">
                      {timeText && (
                        <span className="conversation-time">{timeText}</span>
                      )}
                      {unread > 0 && (
                        <span className="badge badge--unread">{unread}</span>
                      )}
                    </div>
                  </div>
                  <div className="conversation-bottom-row">
                    <div
                      className="conversation-subtitle"
                      title={rawSubtitle}
                    >
                      {subtitle}
                    </div>
                    <div className="conversation-badges">
                      {!c.agent_allowed && (
                        <span className="badge badge--bot">Bot</span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ConversationList;
