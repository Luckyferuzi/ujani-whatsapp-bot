"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";
import {
  ConversationListSkeleton,
  EmptyState,
} from "@/components/ui";

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

const CONVERSATIONS_POLL_MS = 10_000;

function describeLastMessage(text: string | null | undefined): string | null {
  if (!text) return null;
  const s = text.trim();
  if (!s) return null;

  if (s.startsWith("LOCATION")) return "Customer shared a location";
  if (s.startsWith("[image")) return "Image received";
  if (s.startsWith("[document")) return "Document received";
  if (s.startsWith("[audio")) return "Voice note received";
  if (s.startsWith("[video")) return "Video received";
  if (s.startsWith("[sticker")) return "Sticker received";

  return s;
}

function formatTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("sw-TZ", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("sw-TZ", {
    month: "short",
    day: "2-digit",
  });
}

function getConversationPriority(convo: Convo) {
  const unread = convo.unread_count ?? 0;
  if (unread > 0 && convo.agent_allowed) return "Needs reply";
  if (unread > 0) return "Unread";
  if (convo.agent_allowed) return "Handover";
  return "Bot active";
}

function getConversationPriorityTone(convo: Convo) {
  const unread = convo.unread_count ?? 0;
  if (unread > 0 && convo.agent_allowed) {
    return "conversation-priority conversation-priority--hot";
  }
  if (unread > 0) return "conversation-priority conversation-priority--new";
  if (convo.agent_allowed) return "conversation-priority conversation-priority--agent";
  return "conversation-priority";
}

export default function ConversationList({
  activeId,
  onPick,
  phoneFilter,
  onLoaded,
}: Props) {
  const [items, setItems] = useState<Convo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewKey>("all");

  const onLoadedRef = useRef<Props["onLoaded"]>(onLoaded);
  const itemsRef = useRef<Convo[]>([]);
  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    let cancelled = false;

    const load = async (background = false) => {
      try {
        const data = await api<{ items: Convo[] }>("/api/conversations");
        if (cancelled) return;
        const next = data?.items ?? [];
        setItems(next);
        itemsRef.current = next;
        onLoadedRef.current?.(next);
      } catch (err) {
        if (cancelled) return;
        console.error("Failed to load conversations", err);
        setItems([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    if (typeof window === "undefined") {
      return () => {
        cancelled = true;
      };
    }

    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void load(true);
    };

    const timer = window.setInterval(poll, CONVERSATIONS_POLL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void load(true);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
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
        <div>
          <div className="conversation-list-header-title">Active conversations</div>
          <div className="conversation-list-header-subtitle">
            Live customer handling, payment checks, and fulfillment follow-up.
          </div>
        </div>
        <div className="conversation-list-header-count">{loading ? "-" : counts.all}</div>
      </div>

      <div className="conversation-views">
        <button
          type="button"
          className={
            "conversation-view-button" +
            (view === "all" ? " conversation-view-button--active" : "")
          }
          onClick={() => setView("all")}
        >
          All <span className="conversation-view-count">{counts.all}</span>
        </button>

        <button
          type="button"
          className={
            "conversation-view-button" +
            (view === "unread" ? " conversation-view-button--active" : "")
          }
          onClick={() => setView("unread")}
        >
          Unread <span className="conversation-view-count">{counts.unread}</span>
        </button>

        <button
          type="button"
          className={
            "conversation-view-button" +
            (view === "bot" ? " conversation-view-button--active" : "")
          }
          onClick={() => setView("bot")}
        >
          Bot <span className="conversation-view-count">{counts.bot}</span>
        </button>

        <button
          type="button"
          className={
            "conversation-view-button" +
            (view === "stock" ? " conversation-view-button--active" : "")
          }
          onClick={() => setView("stock")}
        >
          Stock alerts <span className="conversation-view-count">{counts.stock}</span>
        </button>
      </div>

      <div className="conversation-search">
        <div className="conversation-search-row">
          <input
            type="text"
            placeholder="Search name, phone, or latest message"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="conversation-search-input"
          />
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="conversation-list-state">
          <ConversationListSkeleton rows={7} />
        </div>
      ) : filtered.length === 0 && items.length === 0 ? (
        <div className="conversation-list-state">
          <EmptyState
            eyebrow="Inbox"
            title="No conversations yet."
            description="Active customer conversations will appear here as messages start coming in."
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="conversation-list-state">
          <EmptyState
            eyebrow="Search"
            title="No conversations match these filters."
            description="Try another search term or switch to a broader view."
          />
        </div>
      ) : (
        <ul className="conversation-items">
          {filtered.map((c) => {
            const isSelected = c.id === activeId;
            const title =
              c.name && c.name.trim().length > 0 ? c.name : formatPhonePretty(c.phone);
            const initials =
              title
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase() ?? "")
                .join("")
                .slice(0, 2) || "?";

            const prettyLast = describeLastMessage(c.last_message_text);

            const rawSubtitle =
              prettyLast && prettyLast.length > 0
                ? prettyLast
                : c.agent_allowed
                  ? "Assigned to an operator"
                  : "Bot is handling this thread";

            const subtitle =
              rawSubtitle.length > 45 ? rawSubtitle.slice(0, 42) + "..." : rawSubtitle;

            const timeSource = c.last_message_at ?? c.last_user_message_at;
            const timeText = timeSource ? formatTime(timeSource) : "";

            const unread = c.unread_count ?? 0;
            const restockCount = c.restock_subscribed_count ?? 0;
            const priority = getConversationPriority(c);
            const priorityTone = getConversationPriorityTone(c);

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
                    <div className="conversation-title-wrap">
                      <span className="conversation-title">{title}</span>
                      <span className={priorityTone}>{priority}</span>
                    </div>
                    <div className="conversation-top-right">
                      {timeText && <span className="conversation-time">{timeText}</span>}
                      {unread > 0 && <span className="badge badge--unread">{unread}</span>}
                    </div>
                  </div>

                  <div className="conversation-meta-row">
                    <span className="conversation-phone">{formatPhonePretty(c.phone)}</span>
                    <div className="conversation-badges">
                      {c.agent_allowed ? (
                        <span className="badge badge--handover">Human</span>
                      ) : (
                        <span className="badge badge--bot">Bot</span>
                      )}
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
                      {unread > 0 && c.agent_allowed && (
                        <span className="badge badge--needs-reply">Reply</span>
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
}
