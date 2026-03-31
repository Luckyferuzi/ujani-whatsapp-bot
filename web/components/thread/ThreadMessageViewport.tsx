"use client";

import { Fragment, type MutableRefObject, type RefObject, type ReactNode } from "react";
import { EmptyState } from "@/components/ui";
import type { Msg } from "./types";

type ThreadMessageViewportProps = {
  messages: Msg[];
  loading: boolean;
  messagesRef: RefObject<HTMLDivElement | null>;
  firstUnreadRef: MutableRefObject<HTMLDivElement | null>;
  oldestUnreadIndex: number;
  customerInitial: string;
  hoveredMessageId: string | number | null;
  activeMediaActionsId: string | number | null;
  isInbound: (msg: Pick<Msg, "direction">) => boolean;
  getRole: (msg: Msg) => string;
  minutesBetween: (a: string, b: string) => number;
  formatDayLabel: (iso: string) => string;
  formatTime: (iso: string) => string;
  describeTransport: (msg: Msg) => { icon: string; label: string; className: string } | null;
  describeFailure: (msg: Msg) => string;
  expandedFailureId: string | number | null;
  renderBody: (
    msg: Msg,
    onResendMedia?: (kind: string, mediaId: string) => void,
    onDeleteMedia?: (messageId: string | number) => void,
    activeMediaActionsId?: string | number | null,
    onToggleMediaActions?: (messageId: string | number) => void
  ) => ReactNode;
  onScrollBottomStateChange: (isAtBottom: boolean) => void;
  onMessageHover: (id: string | number | null) => void;
  onToggleFailureDetails: (messageId: string | number) => void;
  onCopyMessage: (body: string | null) => void | Promise<void>;
  onDeleteMessage: (id: string | number) => void | Promise<void>;
  onEditMessage: (msg: Msg) => void | Promise<void>;
  onResendMedia: (kind: string, mediaId: string) => void | Promise<void>;
  onDeleteMedia: (messageId: string | number) => void | Promise<void>;
  onToggleMediaActions: (messageId: string | number) => void;
};

const GROUP_GAP_MINUTES = 6;

export default function ThreadMessageViewport({
  messages,
  loading,
  messagesRef,
  firstUnreadRef,
  oldestUnreadIndex,
  customerInitial,
  hoveredMessageId,
  activeMediaActionsId,
  isInbound,
  getRole,
  minutesBetween,
  formatDayLabel,
  formatTime,
  describeTransport,
  describeFailure,
  expandedFailureId,
  renderBody,
  onScrollBottomStateChange,
  onMessageHover,
  onToggleFailureDetails,
  onCopyMessage,
  onDeleteMessage,
  onEditMessage,
  onResendMedia,
  onDeleteMedia,
  onToggleMediaActions,
}: ThreadMessageViewportProps) {
  return (
    <div className="thread-body">
      {loading && messages.length === 0 ? (
        <div className="thread-loading-state thread-loading-state--workspace" aria-hidden="true">
          <div className="thread-lane thread-lane--messages thread-loading-lane">
            <div className="thread-loading-group">
              <div className="thread-loading-row">
                <div className="thread-avatar thread-avatar--loading ui-skeleton" />
                <div className="thread-loading-stack">
                  <div className="thread-loading-label ui-skeleton" />
                  <div className="thread-loading-bubble thread-loading-bubble--inbound ui-skeleton" />
                  <div className="thread-loading-bubble thread-loading-bubble--inbound thread-loading-bubble--short ui-skeleton" />
                  <div className="thread-loading-meta ui-skeleton" />
                </div>
              </div>
            </div>

            <div className="thread-day-divider thread-day-divider--loading">
              <span className="ui-skeleton thread-loading-divider" />
            </div>

            <div className="thread-loading-group thread-loading-group--outbound">
              <div className="thread-loading-row thread-loading-row--outbound">
                <div className="thread-loading-stack thread-loading-stack--outbound">
                  <div className="thread-loading-bubble thread-loading-bubble--outbound ui-skeleton" />
                  <div className="thread-loading-bubble thread-loading-bubble--outbound thread-loading-bubble--short ui-skeleton" />
                  <div className="thread-loading-meta ui-skeleton" />
                </div>
                <div className="thread-avatar thread-avatar--loading ui-skeleton" />
              </div>
            </div>

            <div className="thread-loading-group">
              <div className="thread-loading-row">
                <div className="thread-avatar thread-avatar--loading ui-skeleton" />
                <div className="thread-loading-stack">
                  <div className="thread-loading-bubble thread-loading-bubble--media ui-skeleton" />
                  <div className="thread-loading-meta ui-skeleton" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : messages.length === 0 ? (
        <div className="thread-loading-state">
          <EmptyState
            eyebrow="Conversation"
            title="No messages yet."
            description="This thread will populate as the customer and operators exchange messages."
          />
        </div>
      ) : (
        <div
          className="thread-messages"
          ref={messagesRef}
          onScroll={() => {
            const el = messagesRef.current;
            if (!el) return;
            onScrollBottomStateChange(el.scrollHeight - (el.scrollTop + el.clientHeight) <= 50);
          }}
        >
          <div className="thread-lane thread-lane--messages">
            {messages.map((msg, index) => {
              const prev = index > 0 ? messages[index - 1] : null;
              const next = index < messages.length - 1 ? messages[index + 1] : null;
              const role = getRole(msg);
              const outbound = !isInbound(msg);
              const groupedWithPrev = !!prev && getRole(prev) === role && minutesBetween(prev.created_at, msg.created_at) <= GROUP_GAP_MINUTES;
              const groupedWithNext = !!next && getRole(next) === role && minutesBetween(msg.created_at, next.created_at) <= GROUP_GAP_MINUTES;
              const showMeta = !groupedWithNext;
              const showDayDivider = index === 0 || msg.created_at.slice(0, 10) !== prev?.created_at?.slice(0, 10);
              const transport = outbound ? describeTransport(msg) : null;
              const isFailed = outbound && String(msg.status ?? "").toLowerCase() === "failed";
              const failureExpanded =
                isFailed && expandedFailureId != null && String(expandedFailureId) === String(msg.id);

              return (
                <Fragment key={msg.id}>
                  {showDayDivider ? (
                    <div className="thread-day-divider">
                      <span>{formatDayLabel(msg.created_at)}</span>
                    </div>
                  ) : null}

                  <div
                    ref={index === oldestUnreadIndex ? firstUnreadRef : null}
                    className={
                      "thread-message" +
                      (outbound ? " thread-message--outbound" : " thread-message--inbound") +
                      (groupedWithPrev ? " thread-message--grouped" : "")
                    }
                    onMouseEnter={() => onMessageHover(msg.id)}
                    onMouseLeave={() => onMessageHover(null)}
                  >
                    <div className={"thread-message-row" + (outbound ? " thread-message-row--outbound" : "")}>
                      <div className="thread-message-stack">
                        {role === "bot" && !groupedWithPrev ? <div className="thread-role-label">Bot</div> : null}
                        {msg.message_kind === "template" && !groupedWithPrev ? (
                          <div className="thread-role-label">
                            Template
                            {msg.template_name || msg.template_key
                              ? ` · ${String(msg.template_name || msg.template_key).replaceAll("_", " ")}`
                              : ""}
                          </div>
                        ) : null}

                        <div className={"thread-bubble-wrap" + (outbound ? " thread-bubble-wrap--outbound" : "")}>
                          {outbound && String(hoveredMessageId ?? "") === String(msg.id) ? (
                            <div className="thread-bubble-actions thread-bubble-actions--left">
                              <button
                                type="button"
                                className="thread-bubble-action"
                                onClick={() => void onCopyMessage(msg.body)}
                                aria-label="Copy message"
                                title="Copy"
                              >
                                C
                              </button>
                              <button
                                type="button"
                                className="thread-bubble-action"
                                onClick={() => void onEditMessage(msg)}
                                aria-label="Edit message"
                                title="Edit"
                              >
                                E
                              </button>
                              <button
                                type="button"
                                className="thread-bubble-action thread-bubble-action--danger"
                                onClick={() => void onDeleteMessage(msg.id)}
                                aria-label="Delete message"
                                title="Delete"
                              >
                                D
                              </button>
                            </div>
                          ) : null}

                          <div
                            className={
                              "thread-bubble" +
                              (outbound ? " thread-bubble--outbound" : " thread-bubble--inbound") +
                              (role === "bot" ? " thread-bubble--bot" : "") +
                              (isFailed ? " thread-bubble--failed" : "")
                            }
                          >
                            {renderBody(
                              msg,
                              onResendMedia,
                              onDeleteMedia,
                              activeMediaActionsId,
                              onToggleMediaActions
                            )}
                            {showMeta ? (
                              <div className="thread-meta">
                                <span className="thread-time">{formatTime(msg.created_at)}</span>
                                {isFailed ? (
                                  <button
                                    type="button"
                                    className={
                                      "thread-failure-trigger" +
                                      (failureExpanded ? " thread-failure-trigger--active" : "")
                                    }
                                    onClick={() => onToggleFailureDetails(msg.id)}
                                    aria-label="Show error details"
                                    title="Show error details"
                                  >
                                    ⚠️
                                  </button>
                                ) : null}
                                {transport ? (
                                  <span
                                    className={transport.className}
                                    aria-label={transport.label}
                                    title={transport.label}
                                  >
                                    {transport.icon}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                            {failureExpanded ? (
                              <div className="thread-failure-detail">{describeFailure(msg)}</div>
                            ) : null}
                          </div>

                          {!outbound && String(hoveredMessageId ?? "") === String(msg.id) ? (
                            <div className="thread-bubble-actions thread-bubble-actions--right">
                              <button
                                type="button"
                                className="thread-bubble-action"
                                onClick={() => void onCopyMessage(msg.body)}
                                aria-label="Copy message"
                                title="Copy"
                              >
                                C
                              </button>
                              <button
                                type="button"
                                className="thread-bubble-action"
                                onClick={() => void onEditMessage(msg)}
                                aria-label="Edit message"
                                title="Edit"
                              >
                                E
                              </button>
                              <button
                                type="button"
                                className="thread-bubble-action thread-bubble-action--danger"
                                onClick={() => void onDeleteMessage(msg.id)}
                                aria-label="Delete message"
                                title="Delete"
                              >
                                D
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
