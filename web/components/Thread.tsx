"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { api, API, type ApiError } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";
import { socket } from "@/lib/socket";
import TemplateSendModal from "./TemplateSendModal";
import ThreadComposer from "./thread/ThreadComposer";
import ThreadHeader from "./thread/ThreadHeader";
import ThreadMessageViewport from "./thread/ThreadMessageViewport";
import ThreadStatusStrip from "./thread/ThreadStatusStrip";
import type { ComposerNotice, Msg, ThreadProps } from "./thread/types";

const FREE_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

const isInbound = (msg: Pick<Msg, "direction">) => msg.direction === "in" || msg.direction === "inbound";
const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("sw-TZ", { hour: "2-digit", minute: "2-digit" });
const formatDayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("sw-TZ", { year: "numeric", month: "short", day: "2-digit" });
const minutesBetween = (a: string, b: string) =>
  Math.abs(new Date(b).getTime() - new Date(a).getTime()) / 60000;

function getRole(msg: Msg) {
  if (isInbound(msg)) return "customer";
  if ((msg.body ?? "").startsWith("[MENU]")) return "bot";
  return "agent";
}

function getFreeReplyState(lastInboundAt?: string | null) {
  const openedAt = lastInboundAt ? new Date(lastInboundAt).getTime() : NaN;
  const allowed = Number.isFinite(openedAt) && openedAt + FREE_REPLY_WINDOW_MS > Date.now();
  return { allowed, label: allowed ? "Free reply open" : "Template required" };
}

function describeTransport(msg: Msg) {
  const status = String(msg.status ?? "").toLowerCase();
  if (status === "failed") return { icon: "!", label: "Failed", className: "thread-ticks thread-ticks--failed" };
  if (status === "read") return { icon: "✓✓", label: "Read", className: "thread-ticks thread-ticks--read" };
  if (status === "delivered") return { icon: "✓✓", label: "Delivered", className: "thread-ticks thread-ticks--delivered" };
  if (status === "sent") return { icon: "✓", label: "Sent", className: "thread-ticks thread-ticks--sent" };
  return { icon: "○", label: "Sending", className: "thread-ticks thread-ticks--pending" };
}

function describeFailure(msg: Msg) {
  if ((msg.status_reason ?? "").toLowerCase() === "template_required") {
    return "Customer is outside WhatsApp's free reply window. A template message is required before another manual text can be sent.";
  }
  if ((msg.status_reason ?? "").toLowerCase() === "template_config_missing") {
    return "This template is not configured yet. Map the approved WhatsApp template name in Setup before sending.";
  }
  if ((msg.status_reason ?? "").toLowerCase() === "template_language_unavailable") {
    return "This template is missing the exact approved WhatsApp language code. Update it in Setup before sending.";
  }
  return msg.error_details || msg.error_title || "WhatsApp could not deliver this message.";
}

function renderBody(
  msg: Msg,
  onResendMedia?: (kind: string, mediaId: string) => void,
  onDeleteMedia?: (messageId: string | number) => void,
  activeMediaActionsId?: string | number | null,
  onToggleMediaActions?: (messageId: string | number) => void
) {
  const body = msg.body ?? "";

  if (body.startsWith("LOCATION ")) {
    const [latStr, lngStr] = body
      .substring("LOCATION ".length)
      .split(",")
      .map((part) => part.trim());
    const lat = Number(latStr);
    const lng = Number(lngStr);
    const url = Number.isFinite(lat) && Number.isFinite(lng) ? `https://www.google.com/maps?q=${lat},${lng}` : "";
    return (
      <div className="thread-text">
        {url ? (
          <a className="thread-location-link" href={url} target="_blank" rel="noreferrer">
            Open location in maps
          </a>
        ) : (
          body
        )}
      </div>
    );
  }

  const media = body.match(/^MEDIA:([a-z]+):(.+)$/);
  if (media) {
    const kind = media[1];
    const mediaId = media[2];
    const src = `${API}/api/media/${encodeURIComponent(mediaId)}`;
    const showActions = activeMediaActionsId != null && String(activeMediaActionsId) === String(msg.id);

    return (
      <div className="thread-media">
        {kind === "image" ? <img src={src} className="thread-image" alt="Media sent in conversation" /> : null}
        {kind === "video" ? <video src={src} controls className="thread-video" /> : null}
        {kind === "audio" ? <audio src={src} controls className="thread-audio" /> : null}
        <a className="thread-media-link" href={src} target="_blank" rel="noreferrer">
          {kind === "document" ? "Open file" : "Open media"}
        </a>
        {typeof onToggleMediaActions === "function" ? (
          <button type="button" className="thread-media-edit" onClick={() => onToggleMediaActions(msg.id)}>
            Edit
          </button>
        ) : null}
        {showActions ? (
          <div className="thread-media-actions">
            {typeof onResendMedia === "function" ? (
              <button type="button" className="thread-media-resend" onClick={() => onResendMedia(kind, mediaId)}>
                Resend media
              </button>
            ) : null}
            {typeof onDeleteMedia === "function" ? (
              <button type="button" className="thread-media-delete" onClick={() => onDeleteMedia(msg.id)}>
                Delete media
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  return <div className="thread-text">{body}</div>;
}

export default function Thread({ convo, onOpenContext, onToggleContext, contextOpen = false }: ThreadProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const [agentAllowed, setAgentAllowed] = useState<boolean>(convo.agent_allowed);
  const [text, setText] = useState("");
  const [toggling, setToggling] = useState(false);
  const [sending, setSending] = useState(false);
  const [showBotModeHint, setShowBotModeHint] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [dismissedHeaderFailureId, setDismissedHeaderFailureId] = useState<string | number | null>(null);
  const [dismissedComposerNoticeKey, setDismissedComposerNoticeKey] = useState<string | null>(null);
  const [activeMediaActionsId, setActiveMediaActionsId] = useState<string | number | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<string | number | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const firstUnreadRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const initialScrolledRef = useRef(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const oldestUnreadIndex = useMemo(
    () => messages.findIndex((msg) => isInbound(msg) && msg.status !== "read"),
    [messages]
  );
  const freeReplyState = useMemo(() => getFreeReplyState(convo.last_user_message_at), [convo.last_user_message_at]);
  const composerBlockedByWindow = agentAllowed && !freeReplyState.allowed;
  const latestOutbound = useMemo(
    () => [...messages].reverse().find((msg) => !isInbound(msg)) ?? null,
    [messages]
  );
  const latestFailedOutbound =
    latestOutbound && String(latestOutbound.status ?? "").toLowerCase() === "failed" ? latestOutbound : null;
  const shouldShowHeaderFailure =
    !!latestFailedOutbound &&
    String(latestFailedOutbound.status_reason ?? "").toLowerCase() !== "template_required" &&
    String(dismissedHeaderFailureId ?? "") !== String(latestFailedOutbound.id);
  const composerNotice: ComposerNotice | null = !agentAllowed && showBotModeHint
    ? {
        key: "bot_mode",
        message: "Bot mode is active. Switch to Agent Mode to send a manual reply.",
        actionLabel: null,
      }
    : composerBlockedByWindow
      ? {
          key: "template_required",
          message: "Manual free-text is paused because the conversation is outside WhatsApp's free reply window.",
          actionLabel: "Use template",
        }
      : null;
  const visibleComposerNotice =
    composerNotice && dismissedComposerNoticeKey !== composerNotice.key ? composerNotice : null;
  const title = convo.name || formatPhonePretty(convo.phone);
  const customerInitial = (title.trim()[0] || "?").toUpperCase();

  const scrollToBottom = (behavior: ScrollBehavior = "auto") => {
    const el = messagesRef.current;
    if (!el) return;
    if (behavior === "smooth") {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      return;
    }
    el.scrollTop = el.scrollHeight;
  };

  async function loadMessages() {
    setLoading(true);
    try {
      const { items } = await api<{ items: Msg[] }>(`/api/conversations/${convo.id}/messages`);
      setMessages(items ?? []);
      setActiveMediaActionsId(null);
    } catch (error) {
      console.error("Failed to load messages", error);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAgentMode() {
    const next = !agentAllowed;
    setToggling(true);
    setAgentAllowed(next);
    try {
      await api(`/api/conversations/${convo.id}/agent-allow`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_allowed: next, allowed: next }),
      });
    } catch (error) {
      console.error("Failed to toggle agent mode", error);
      setAgentAllowed(!next);
      toast.error("Unable to update handover mode right now.");
    } finally {
      setToggling(false);
    }
  }

  async function handleSend(event: FormEvent) {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    if (!agentAllowed) {
      setShowBotModeHint(true);
      return;
    }

    const optimisticId = `temp-${Date.now()}`;
    setSending(true);
    setText("");
    setMessages((prev) => [
      ...prev,
      {
        id: optimisticId,
        conversation_id: convo.id,
        direction: "outbound",
        type: "text",
        body: value,
        status: "sending",
        created_at: new Date().toISOString(),
      },
    ]);

    try {
      await api("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convo.id, text: value }),
      });
      await loadMessages();
    } catch (error) {
      console.error("Failed to send message", error);
      setMessages((prev) => prev.filter((msg) => String(msg.id) !== optimisticId));
      setText(value);
      await loadMessages();
      const apiErr = error as ApiError;
      if (apiErr.code !== "template_required") toast.error("Unable to send the message right now.");
    } finally {
      setSending(false);
    }
  }

  async function handleResendMedia(kind: string, mediaId: string) {
    try {
      const data = await api<{ ok: boolean; message: Msg }>("/api/send-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convo.id, kind, mediaId }),
      });
      if (data?.message) setMessages((prev) => [...prev, data.message]);
    } catch (error: any) {
      toast.error(error?.message ?? "Unable to resend media right now.");
    }
  }

  async function handleDeleteMedia(messageId: string | number) {
    if (!window.confirm("Delete this media message?")) return;
    try {
      await api(`/api/messages/${messageId}`, { method: "DELETE" });
      setMessages((prev) => prev.filter((msg) => String(msg.id) !== String(messageId)));
    } catch (error: any) {
      toast.error(error?.message ?? "Unable to delete media right now.");
    }
  }

  async function handleDeleteMessage(messageId: string | number) {
    if (!window.confirm("Delete this message?")) return;
    try {
      await api(`/api/messages/${messageId}`, { method: "DELETE" });
      setMessages((prev) => prev.filter((msg) => String(msg.id) !== String(messageId)));
      toast.success("Message deleted.");
    } catch (error: any) {
      toast.error(error?.message ?? "Unable to delete this message right now.");
    }
  }

  async function handleCopyMessage(body: string | null) {
    if (!body) return;
    try {
      await navigator.clipboard.writeText(body);
      toast.success("Message copied.");
    } catch {
      toast.error("Unable to copy this message.");
    }
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const form = new FormData();
      form.append("conversationId", String(convo.id));
      form.append("file", file);
      const data = await api<{ ok: boolean; message: Msg }>("/api/upload-media", {
        method: "POST",
        body: form,
      });
      if (data?.message) setMessages((prev) => [...prev, data.message]);
    } catch (error: any) {
      toast.error(error?.message ?? "Unable to send media right now.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function clearConversationHistory() {
    if (!window.confirm("Clear this chat history? Orders, payments, and the contact will remain.")) return;
    try {
      await api(`/api/conversations/${convo.id}/messages`, { method: "DELETE" });
      setMessages([]);
      toast.success("Chat history cleared.");
    } catch (error: any) {
      toast.error(error?.message ?? "Unable to update conversation history right now.");
    }
  }

  useEffect(() => {
    setAgentAllowed(convo.agent_allowed);
    setMessages([]);
    setText("");
    setShowBotModeHint(false);
    setTemplateModalOpen(false);
    setDismissedHeaderFailureId(null);
    setDismissedComposerNoticeKey(null);
    initialScrolledRef.current = false;
    void loadMessages();
  }, [convo.id, convo.agent_allowed]);

  useEffect(() => {
    const s = socket();
    if (!s) return;

    const messageHandler = (payload: any) => {
      if (!payload?.message || String(payload.conversation_id) !== String(convo.id)) return;
      const msg = payload.message as Msg;
      setMessages((prev) =>
        prev.some((existing) => String(existing.id) === String(msg.id))
          ? prev.map((existing) => (String(existing.id) === String(msg.id) ? msg : existing))
          : [...prev, msg]
      );
    };

    const clearedHandler = (payload: any) => {
      if (!payload || String(payload.conversation_id) !== String(convo.id)) return;
      setMessages([]);
      setActiveMediaActionsId(null);
    };

    s.on("message.created", messageHandler);
    s.on("conversation.cleared", clearedHandler);
    return () => {
      s.off("message.created", messageHandler);
      s.off("conversation.cleared", clearedHandler);
    };
  }, [convo.id]);

  useEffect(() => {
    if (!messages.length) return;
    if (!initialScrolledRef.current) {
      if (oldestUnreadIndex >= 0 && firstUnreadRef.current && messagesRef.current) {
        messagesRef.current.scrollTop = Math.max(0, firstUnreadRef.current.offsetTop - 12);
      } else {
        scrollToBottom("auto");
      }
      initialScrolledRef.current = true;
      return;
    }
    if (isAtBottom) scrollToBottom("smooth");
  }, [messages, oldestUnreadIndex, isAtBottom]);

  return (
    <div className="thread">
      <ThreadHeader
        convo={convo}
        title={title}
        contextOpen={contextOpen}
        agentAllowed={agentAllowed}
        toggling={toggling}
        freeReplyAllowed={freeReplyState.allowed}
        onOpenContext={onOpenContext}
        onToggleContext={onToggleContext}
        onClearChat={clearConversationHistory}
        onToggleAgentMode={toggleAgentMode}
      />

      <ThreadStatusStrip
        latestFailedOutbound={latestFailedOutbound}
        shouldShowHeaderFailure={shouldShowHeaderFailure}
        describeFailure={describeFailure}
        onDismissFailure={(id) => setDismissedHeaderFailureId(id)}
      />

      <ThreadMessageViewport
        messages={messages}
        loading={loading}
        messagesRef={messagesRef}
        firstUnreadRef={firstUnreadRef}
        oldestUnreadIndex={oldestUnreadIndex}
        customerInitial={customerInitial}
        hoveredMessageId={hoveredMessageId}
        activeMediaActionsId={activeMediaActionsId}
        isInbound={isInbound}
        getRole={getRole}
        minutesBetween={minutesBetween}
        formatDayLabel={formatDayLabel}
        formatTime={formatTime}
        describeTransport={describeTransport}
        describeFailure={describeFailure}
        renderBody={renderBody}
        onScrollBottomStateChange={setIsAtBottom}
        onMessageHover={setHoveredMessageId}
        onCopyMessage={handleCopyMessage}
        onDeleteMessage={handleDeleteMessage}
        onResendMedia={handleResendMedia}
        onDeleteMedia={handleDeleteMedia}
        onToggleMediaActions={(messageId) =>
          setActiveMediaActionsId((current) =>
            current != null && String(current) === String(messageId) ? null : messageId
          )
        }
      />

      <ThreadComposer
        text={text}
        sending={sending}
        agentAllowed={agentAllowed}
        composerBlockedByWindow={composerBlockedByWindow}
        visibleComposerNotice={visibleComposerNotice}
        fileInputRef={fileInputRef}
        inputRef={inputRef}
        onOpenTemplate={() => setTemplateModalOpen(true)}
        onDismissNotice={(key) => setDismissedComposerNoticeKey(key)}
        onRequestAgentHint={() => setShowBotModeHint(true)}
        onTextChange={setText}
        onSend={handleSend}
        onFileChange={handleFileChange}
      />

      <TemplateSendModal
        conversationId={convo.id}
        open={templateModalOpen}
        onClose={() => setTemplateModalOpen(false)}
        onSent={loadMessages}
      />
    </div>
  );
}
