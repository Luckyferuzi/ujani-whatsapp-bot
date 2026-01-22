"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";

export type Convo = {
  id: string;
  name?: string | null;
  phone: string;
  lang?: string | null;
  agent_allowed: boolean;
  last_user_message_at: string;
  last_message_at?: string | null;
  unread_count?: number;
  last_message_text?: string | null;
  restock_subscribed_count?: number;
};

type Props = {
  activeId: string | null;
  onPick: (c: Convo) => void;
  phoneFilter?: string | null;
  onLoaded?: (items: Convo[]) => void;
};

type ViewKey = "all" | "unread" | "bot" | "stock";

function describeLastMessage(text: string | null | undefined): string | null {
  if (!text) return null;
  const s = text.trim();
  if (!s) return null;

  if (s.startsWith("LOCATION")) return "Mteja ametuma lokesheni";
  if (s.startsWith("[image")) return "Picha imetumwa";
  if (s.startsWith("[document")) return "Hati imetumwa";
  if (s.startsWith("[audio")) return "Sauti imetumwa";
  if (s.startsWith("[video")) return "Video imetumwa";
  if (s.startsWith("[sticker")) return "Stika imetumwa";

  return s;
}

function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("sw-TZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ConversationList({
  activeId,
  onPick,
  phoneFilter,
  onLoaded,
}: Props) {
  const [items, setItems] = useState<Convo[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewKey>("all");

  const onLoadedRef = useRef<Props["onLoaded"]>(onLoaded);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api<{ items: Convo[] }>("/api/conversations");
      const next = data.items ?? [];
      setItems(next);
      onLoadedRef.current?.(next);
    } catch (err) {
      console.error("failed to load conversations", err);
      setItems([]);
      onLoadedRef.current?.([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 3_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!phoneFilter) return;
    if (!items || items.length === 0) return;

    const match = items.find((c) => c.phone === phoneFilter);
    if (!match) return;

    if (activeId && activeId === match.id) return;
    onPick(match);
  }, [phoneFilter, items, activeId, onPick]);

  const counts = useMemo(() => {
    const all = items.length;
    const unread = items.filter((c) => (c.unread_count ?? 0) > 0).length;
    const bot = items.filter((c) => !c.agent_allowed).length;
    const stock = items.filter((c) => (c.restock_subscribed_count ?? 0) > 0).length;
    return { all, unread, bot, stock };
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return items.filter((c) => {
      const unread = c.unread_count ?? 0;
      const stock = c.restock_subscribed_count ?? 0;

      if (view === "unread" && unread === 0) return false;
      if (view === "bot" && c.agent_allowed) return false;
      if (view === "stock" && stock === 0) return false;

      if (!q) return true;

      const name = (c.name ?? "").toLowerCase();
      const phone = (c.phone ?? "").toLowerCase();
      const last = (c.last_message_text ?? "").toLowerCase();

      return name.includes(q) || phone.includes(q) || last.includes(q);
    });
  }, [items, search, view]);

  return (
    <div className="conversation-list">
      <div className="conversation-list-header">
        <div className="conversation-list-header-title">Inbox</div>
        <div className="conversation-list-header-count">{counts.all}</div>
      </div>

      <div className="conversation-views">
        <button
          type="button"
          className={
            "conversation-view-button" + (view === "all" ? " conversation-view-button--active" : "")
          }
          onClick={() => setView("all")}
        >
          All <span className="conversation-view-count">{counts.all}</span>
        </button>

        <button
          type="button"
          className={
            "conversation-view-button" + (view === "unread" ? " conversation-view-button--active" : "")
          }
          onClick={() => setView("unread")}
        >
          Unread <span className="conversation-view-count">{counts.unread}</span>
        </button>

        <button
          type="button"
          className={
            "conversation-view-button" + (view === "bot" ? " conversation-view-button--active" : "")
          }
          onClick={() => setView("bot")}
        >
          Bot <span className="conversation-view-count">{counts.bot}</span>
        </button>

        <button
          type="button"
          className={
            "conversation-view-button" + (view === "stock" ? " conversation-view-button--active" : "")
          }
          onClick={() => setView("stock")}
        >
          Stock Alerts <span className="conversation-view-count">{counts.stock}</span>
        </button>
      </div>

      <div className="conversation-search">
        <div className="conversation-search-row">
          <input
            type="text"
            placeholder="Tafuta jina, namba au ujumbe..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="conversation-search-input"
          />
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="conversation-empty">Loading chats…</div>
      ) : filtered.length === 0 ? (
        <div className="conversation-empty">No conversations found.</div>
      ) : (
        <ul className="conversation-items">
          {filtered.map((c) => {
            const isSelected = c.id === activeId;
            const initials = (c.name || c.phone || "?").slice(-2).toUpperCase();
            const title =
              c.name && c.name.trim().length > 0 ? c.name : formatPhonePretty(c.phone);

            const prettyLast = describeLastMessage(c.last_message_text);

            const rawSubtitle =
              prettyLast && prettyLast.length > 0
                ? prettyLast
                : c.agent_allowed
                ? "Agent mode kwa mazungumzo"
                : "Bot anaendeleza mazungumzo";

            const subtitle =
              rawSubtitle.length > 45 ? rawSubtitle.slice(0, 42) + "..." : rawSubtitle;

            const timeSource = c.last_message_at ?? c.last_user_message_at;
            const timeText = timeSource ? formatTime(timeSource) : "";

            const unread = c.unread_count ?? 0;
            const restockCount = c.restock_subscribed_count ?? 0;

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
                      {timeText && <span className="conversation-time">{timeText}</span>}
                      {unread > 0 && <span className="badge badge--unread">{unread}</span>}
                    </div>
                  </div>

                  <div className="conversation-bottom-row">
                    <div className="conversation-subtitle" title={rawSubtitle}>
                      {subtitle}
                    </div>

                    <div className="conversation-badges">
                      {restockCount > 0 && (
                        <span
                          className="badge badge--restock"
                          title="Customer requested back-in-stock notification"
                        >
                          Stock Alert{restockCount > 1 ? ` ${restockCount}` : ""}
                        </span>
                      )}
                      {!c.agent_allowed && <span className="badge badge--bot">Bot</span>}
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
}
