"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";
import { socket } from "@/lib/socket";
import { ConversationListSkeleton, EmptyState } from "@/components/ui";
import type { ConversationWindowState } from "@/lib/types";

export type Convo = {
  id: string;
  name?: string | null;
  phone: string;
  lang?: string | null;
  agent_allowed: boolean;
  last_user_message_at: string;
  windowState: ConversationWindowState;
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

const CONVERSATIONS_POLL_MS = 10_000;

function describeLastMessage(text: string | null | undefined) {
  if (!text) return null;
  const value = text.trim();
  if (!value) return null;
  const mediaMatch = value.match(/^MEDIA:([a-z]+):([^|\n]+)(?:\|([^|\n]*))?(?:\|([^\n]*))?/i);
  if (mediaMatch) {
    const kind = mediaMatch[1];
    const filename = mediaMatch[3]
      ? (() => {
          try {
            return decodeURIComponent(mediaMatch[3]);
          } catch {
            return mediaMatch[3];
          }
        })()
      : "";
    const caption = mediaMatch[4]
      ? (() => {
          try {
            return decodeURIComponent(mediaMatch[4]);
          } catch {
            return mediaMatch[4];
          }
        })()
      : "";
    if (caption) return caption;
    if (filename) return filename;
    if (kind === "document") return "Document shared";
    if (kind === "image") return "Image shared";
    if (kind === "audio") return "Audio shared";
    if (kind === "video") return "Video shared";
  }
  if (value.startsWith("LOCATION")) return "Customer shared a location";
  if (value.startsWith("[image")) return "Image received";
  if (value.startsWith("[document")) return "Document received";
  if (value.startsWith("[audio")) return "Voice note received";
  if (value.startsWith("[video")) return "Video received";
  return value;
}

function formatListTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("sw-TZ", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("sw-TZ", { month: "short", day: "2-digit" });
}

export default function ConversationList({ activeId, onPick, phoneFilter, onLoaded }: Props) {
  const [items, setItems] = useState<Convo[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState<"all" | "unread" | "human" | "bot">("all");
  const onLoadedRef = useRef<Props["onLoaded"]>(onLoaded);

  useEffect(() => {
    onLoadedRef.current = onLoaded;
  }, [onLoaded]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const data = await api<{ items: Convo[] }>("/api/conversations");
        if (cancelled) return;
        const next = data?.items ?? [];
        setItems(next);
        onLoadedRef.current?.(next);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load conversations", error);
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void load();
      }
    }, CONVERSATIONS_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const s = socket();
    if (!s) return;

    const clearedHandler = (payload: any) => {
      if (!payload?.conversation_id) return;
      setItems((current) =>
        current.map((item) =>
          String(item.id) === String(payload.conversation_id)
            ? { ...item, unread_count: 0, last_message_text: null, last_message_at: null }
            : item
        )
      );
    };

    s.on("conversation.cleared", clearedHandler);
    return () => {
      s.off("conversation.cleared", clearedHandler);
    };
  }, []);

  useEffect(() => {
    if (!phoneFilter || items.length === 0) return;
    const match = items.find((item) => item.phone === phoneFilter);
    if (!match || match.id === activeId) return;
    onPick(match);
  }, [phoneFilter, items, activeId, onPick]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      if (queueFilter === "unread" && (item.unread_count ?? 0) <= 0) return false;
      if (queueFilter === "human" && !item.agent_allowed) return false;
      if (queueFilter === "bot" && item.agent_allowed) return false;

      if (!query) return true;
      const name = (item.name ?? "").toLowerCase();
      const phone = (item.phone ?? "").toLowerCase();
      const last = (item.last_message_text ?? "").toLowerCase();
      return name.includes(query) || phone.includes(query) || last.includes(query);
    });
  }, [items, search, queueFilter]);

  const unreadCount = useMemo(() => items.reduce((sum, item) => sum + (item.unread_count ?? 0), 0), [items]);

  return (
    <div className="conversation-list">
      <div className="conversation-list-header">
        <div>
          <div className="conversation-list-header-title">Conversations</div>
          <div className="conversation-list-header-subtitle">{items.length} active threads</div>
        </div>
        <div className="conversation-list-header-count">{unreadCount}</div>
      </div>

      <div className="conversation-search">
        <div className="conversation-search-shell">
          <input
            type="text"
            className="conversation-search-input"
            placeholder="Search by name, phone, or message"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="conversation-filters" role="tablist" aria-label="Conversation filters">
          <button
            type="button"
            className={"conversation-filter-chip" + (queueFilter === "all" ? " conversation-filter-chip--active" : "")}
            onClick={() => setQueueFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={"conversation-filter-chip" + (queueFilter === "unread" ? " conversation-filter-chip--active" : "")}
            onClick={() => setQueueFilter("unread")}
          >
            Unread
          </button>
          <button
            type="button"
            className={"conversation-filter-chip" + (queueFilter === "human" ? " conversation-filter-chip--active" : "")}
            onClick={() => setQueueFilter("human")}
          >
            Human
          </button>
          <button
            type="button"
            className={"conversation-filter-chip" + (queueFilter === "bot" ? " conversation-filter-chip--active" : "")}
            onClick={() => setQueueFilter("bot")}
          >
            Bot
          </button>
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className="conversation-list-state">
          <ConversationListSkeleton rows={10} />
        </div>
      ) : filtered.length === 0 && items.length === 0 ? (
        <div className="conversation-list-state">
          <EmptyState eyebrow="Inbox" title="No conversations yet." description="Customer threads will appear here as messages start coming in." />
        </div>
      ) : filtered.length === 0 ? (
        <div className="conversation-list-state">
          <EmptyState eyebrow="Search" title="No matching conversations." description="Try another name, phone number, or message phrase." />
        </div>
      ) : (
        <ul className="conversation-items">
          {filtered.map((item) => {
            const title = item.name?.trim() || formatPhonePretty(item.phone);
            const initials =
              title
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((part) => part[0]?.toUpperCase() ?? "")
                .join("")
                .slice(0, 2) || "?";
            const subtitle =
              describeLastMessage(item.last_message_text) ||
              (item.agent_allowed ? "Assigned to an operator" : "Bot is handling this thread");
            const timeSource = item.last_message_at || item.last_user_message_at;
            const unread = item.unread_count ?? 0;
            const statusLabel = item.agent_allowed ? "Human" : "Bot";
            const needsTemplate = item.windowState?.mode === "template_required";

            return (
              <li
                key={item.id}
                className={
                  "conversation-item" +
                  (item.id === activeId ? " conversation-item--selected" : "") +
                  (unread > 0 ? " conversation-item--unread" : "")
                }
                onClick={() => onPick(item)}
              >
                <div className="conversation-avatar">
                  <span>{initials}</span>
                </div>

                <div className="conversation-main">
                  <div className="conversation-top-row">
                    <div className="conversation-title-wrap">
                      <div className="conversation-title">{title}</div>
                      {unread > 0 ? <span className="conversation-inline-badge conversation-inline-badge--strong">Unread {unread}</span> : null}
                    </div>
                    <div className="conversation-time">{timeSource ? formatListTime(timeSource) : ""}</div>
                  </div>

                  <div className="conversation-meta-row">
                    <div className="conversation-phone">{formatPhonePretty(item.phone)}</div>
                    <div className="conversation-status">
                      <span className={"conversation-status-dot" + (item.agent_allowed ? " conversation-status-dot--human" : " conversation-status-dot--bot")} />
                      <span className="conversation-status-label">{statusLabel}</span>
                    </div>
                  </div>

                  <div className="conversation-subtitle" title={subtitle}>
                    {subtitle}
                  </div>

                  <div className="conversation-bottom-row">
                    <div className="conversation-badges">
                      {item.lang ? <span className="conversation-inline-badge">{item.lang.toUpperCase()}</span> : null}
                      {needsTemplate ? (
                        <span className="conversation-inline-badge">Template</span>
                      ) : null}
                      {item.restock_subscribed_count && item.restock_subscribed_count > 0 ? (
                        <span className="conversation-inline-badge">Stock {item.restock_subscribed_count}</span>
                      ) : null}
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
