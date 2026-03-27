"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { formatPhonePretty } from "@/lib/phone";
import type { Convo } from "@/components/ConversationList";

type ThreadHeaderProps = {
  convo: Convo;
  title: string;
  contextOpen: boolean;
  agentAllowed: boolean;
  toggling: boolean;
  onToggleContext?: () => void;
  onOpenContext?: () => void;
  onClearChat: () => void | Promise<void>;
  onToggleAgentMode: () => void | Promise<void>;
};

export default function ThreadHeader({
  convo,
  title,
  contextOpen,
  agentAllowed,
  toggling,
  onToggleContext,
  onOpenContext,
  onClearChat,
  onToggleAgentMode,
}: ThreadHeaderProps) {
  const router = useRouter();
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!actionMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setActionMenuOpen(false);
      }
    };

    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setActionMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape as unknown as EventListener);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape as unknown as EventListener);
    };
  }, [actionMenuOpen]);

  const handleToggleContext = () => {
    if (onToggleContext) {
      onToggleContext();
      return;
    }
    onOpenContext?.();
  };

  const handleIdentityKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handleToggleContext();
    }
  };

  return (
    <div className="thread-header">
      <div className="thread-lane thread-lane--header">
        <div className="thread-header-main">
          <div
            className="thread-identity"
            role="button"
            tabIndex={0}
            onClick={handleToggleContext}
            onKeyDown={handleIdentityKeyDown}
          >
            <div className="thread-identity-main">
              <div className="thread-identity-avatar" aria-hidden="true">
                {(title.trim()[0] || "?").toUpperCase()}
              </div>

              <div className="thread-identity-copy">
                <div className="thread-title-row">
                  <div className="thread-title">{title}</div>
                  {convo.unread_count && convo.unread_count > 0 ? (
                    <span className="thread-inline-chip thread-inline-chip--accent">Unread {convo.unread_count}</span>
                  ) : null}
                </div>

                <div className="thread-subtitle">
                  <span>{formatPhonePretty(convo.phone)}</span>
                  {convo.lang ? <span className="thread-lang">{convo.lang.toUpperCase()}</span> : null}
                  {convo.restock_subscribed_count && convo.restock_subscribed_count > 0 ? (
                    <span className="thread-inline-chip">Stock alert {convo.restock_subscribed_count}</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="thread-header-actions">
          <div className="thread-action-cluster">
            <button
              type="button"
              className={"thread-mode-action" + (agentAllowed ? " thread-mode-action--agent" : " thread-mode-action--bot")}
              onClick={() => void onToggleAgentMode()}
              disabled={toggling}
            >
              {agentAllowed ? "Human mode" : "Bot mode"}
            </button>

            <button
              type="button"
              className={"thread-header-action" + (contextOpen ? " thread-header-action--active" : "")}
              onClick={handleToggleContext}
            >
              {contextOpen ? "Hide details" : "Show details"}
            </button>
          </div>

          <div className="thread-action-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className="thread-menu-button"
              onClick={() => setActionMenuOpen((value) => !value)}
              aria-expanded={actionMenuOpen}
              aria-label="Open thread actions"
            >
              ...
            </button>
            {actionMenuOpen ? (
              <div className="thread-action-menu">
                <button
                  type="button"
                  className="thread-action-menu-item"
                  onClick={() => {
                    setActionMenuOpen(false);
                    handleToggleContext();
                  }}
                >
                  {contextOpen ? "Hide summary" : "Show summary"}
                </button>
                <button
                  type="button"
                  className="thread-action-menu-item"
                  onClick={() => {
                    setActionMenuOpen(false);
                    router.push(`/orders?phone=${encodeURIComponent(convo.phone)}`);
                  }}
                >
                  Open orders
                </button>
                <button
                  type="button"
                  className="thread-action-menu-item"
                  onClick={() => {
                    setActionMenuOpen(false);
                    void onClearChat();
                  }}
                >
                  Clear chat
                </button>
                <button
                  type="button"
                  className="thread-action-menu-item"
                  onClick={() => {
                    setActionMenuOpen(false);
                    void onToggleAgentMode();
                  }}
                >
                  {agentAllowed ? "Return to bot" : "Take over manually"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
