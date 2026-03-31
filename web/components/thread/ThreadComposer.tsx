"use client";

import { useEffect, type ChangeEvent, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import type { ComposerNotice, ThreadComposerWindowState } from "./types";

type ThreadComposerProps = {
  text: string;
  sending: boolean;
  agentAllowed: boolean;
  windowState: ThreadComposerWindowState;
  composerBlockedByWindow: boolean;
  visibleComposerNotice: ComposerNotice | null;
  fileInputRef: RefObject<HTMLInputElement | null>;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  pendingAttachment: {
    mediaId: string;
    mediaKind: "image" | "video" | "audio" | "document";
    filename: string;
    mimeType: string;
  } | null;
  onOpenTemplate: () => void;
  onClearAttachment: () => void;
  onDismissNotice: (key: string) => void;
  onRequestAgentHint: () => void;
  onTextChange: (value: string) => void;
  onSend: (event: FormEvent) => void | Promise<void>;
  onFileChange: (event: ChangeEvent<HTMLInputElement>) => void | Promise<void>;
};

export default function ThreadComposer({
  text,
  sending,
  agentAllowed,
  windowState,
  composerBlockedByWindow,
  visibleComposerNotice,
  fileInputRef,
  inputRef,
  pendingAttachment,
  onOpenTemplate,
  onClearAttachment,
  onDismissNotice,
  onRequestAgentHint,
  onTextChange,
  onSend,
  onFileChange,
}: ThreadComposerProps) {
  const composerLocked = !agentAllowed || composerBlockedByWindow;
  const dockLabel = !agentAllowed ? "Bot mode active" : composerBlockedByWindow ? "Template required" : "Reply dock";
  const dockMeta = !agentAllowed
    ? "Take over the conversation to send a manual reply."
    : composerBlockedByWindow
      ? windowState.reason === "no_inbound_history"
        ? "Use an approved template before the first outbound reply."
        : "Use an approved template before the next free-text reply."
      : pendingAttachment
        ? "Add an optional note, then send the attachment."
        : "Enter sends. Shift+Enter adds a new line.";

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(el.scrollHeight, 176);
    el.style.height = `${Math.max(52, next)}px`;
  }, [text, inputRef]);

  return (
    <div className="thread-footer">
      <div className="thread-lane thread-lane--composer">
        {visibleComposerNotice ? (
          <div
            className={
              "thread-composer-inline-hint" +
              (visibleComposerNotice.key === "template_required"
                ? " thread-composer-inline-hint--warning"
                : "")
            }
          >
            <span>
              {visibleComposerNotice.key === "template_required"
                ? "⚠️ Template required"
                : visibleComposerNotice.message}
            </span>
            <div className="thread-composer-inline-actions">
              {visibleComposerNotice.actionLabel ? (
                <button
                  type="button"
                  className="thread-header-action thread-header-action--inline"
                  onClick={onOpenTemplate}
                >
                  {visibleComposerNotice.actionLabel}
                </button>
              ) : null}
              <button
                type="button"
                className="thread-inline-dismiss"
                onClick={() => onDismissNotice(visibleComposerNotice.key)}
              >
                Close
              </button>
            </div>
          </div>
        ) : null}

          <div className={"thread-dock" + (composerLocked ? " thread-dock--locked" : "")}>
          <div className="thread-dock-top">
            <div className="thread-dock-status">
              <div className="thread-dock-title">{dockLabel}</div>
              <div className="thread-dock-copy">{dockMeta}</div>
            </div>

            <div className="thread-dock-actions">
              <button
                type="button"
                className="thread-attach-button"
                onClick={() => {
                  if (!agentAllowed) {
                    onRequestAgentHint();
                    return;
                  }
                  if (composerBlockedByWindow) return;
                  fileInputRef.current?.click();
                }}
                disabled={composerBlockedByWindow}
              >
                Attach
              </button>
              <button type="button" className="thread-dock-action" onClick={onOpenTemplate}>
                Template
              </button>
              <button type="button" className="thread-dock-action thread-dock-action--placeholder" disabled>
                Catalog soon
              </button>
            </div>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
            onChange={(event) => void onFileChange(event)}
          />

          {pendingAttachment ? (
            <div className="thread-attachment-preview">
              <div className="thread-attachment-preview-main">
                <div className="thread-attachment-preview-kicker">
                  {pendingAttachment.mediaKind}
                </div>
                <div className="thread-attachment-preview-name">{pendingAttachment.filename}</div>
              </div>
              <button
                type="button"
                className="thread-dock-action"
                onClick={onClearAttachment}
              >
                Remove
              </button>
            </div>
          ) : null}

          <div className="thread-input-row">
            <div className="thread-editor">
              <div className="thread-editor-label">Message</div>
              <textarea
                ref={inputRef}
                className="thread-input thread-input--multiline"
                value={text}
                rows={1}
                onChange={(event) => {
                  if (!agentAllowed) {
                    onRequestAgentHint();
                    return;
                  }
                  if (composerBlockedByWindow) return;
                  onTextChange(event.target.value);
                }}
                placeholder={
                  !agentAllowed
                    ? "Switch to Agent Mode to reply"
                    : composerBlockedByWindow
                      ? "Template required before the next manual reply"
                      : "Write a reply for the customer..."
                }
                onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
                  if (!agentAllowed && event.key !== "Tab") {
                    event.preventDefault();
                    onRequestAgentHint();
                    return;
                  }
                  if (composerBlockedByWindow && event.key !== "Tab") {
                    event.preventDefault();
                    return;
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void onSend(event as unknown as FormEvent);
                  }
                }}
                readOnly={composerLocked}
              />
            </div>

            <div className="thread-send-stack">
              <div className="thread-send-meta">{sending ? "Sending message..." : "WhatsApp reply"}</div>
              <button
                type="button"
                className="thread-send-button"
                onClick={(event) => void onSend(event as unknown as FormEvent)}
                disabled={sending || composerLocked}
              >
                {sending ? "Sending..." : pendingAttachment ? "Send attachment" : "Send"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
