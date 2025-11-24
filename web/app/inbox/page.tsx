// web/app/inbox/page.tsx
"use client";

import { useEffect, useState } from "react";
import ConversationList, { Convo } from "@/components/ConversationList";
import Thread from "@/components/Thread";
import RightPanel from "@/components/RightPanel";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";

type MobileView = "list" | "chat";

const MOBILE_BREAKPOINT = 768; // px

export default function InboxPage() {
  const [active, setActive] = useState<Convo | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  // Detect screen size
  useEffect(() => {
    const update = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) {
        // reset to desktop behaviour when resizing up
        setMobileView("list");
        setShowMobileMenu(false);
      }
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const handlePick = async (convo: Convo) => {
    // update selected conversation in the UI
    setActive(convo);

    if (isMobile) {
      setMobileView("chat");
      setShowMobileMenu(false);
    }

    // mark this conversation as read in the backend
    try {
      await api(`/api/conversations/${convo.id}/read`, {
        method: "POST",
      });
    } catch (err) {
      console.error("Failed to mark conversation as read", err);
    }
  };

  const handleBackToList = () => {
    if (!isMobile) return;
    setMobileView("list");
    setShowMobileMenu(false);
  };

  const handleToggleMobileMenu = () => {
    if (!active) return;
    setShowMobileMenu((prev) => !prev);
  };

  const displayName =
    active?.name && active.name.trim().length > 0
      ? active.name
      : active
      ? formatPhonePretty(active.phone)
      : "";

  return (
    <div className="inbox-root">
      {/* Header (kept simple, title hidden via CSS) */}
      <div className="inbox-header">
        <div className="inbox-header-left">
          <span className="inbox-header-title">Ujani Admin — Inbox</span>
        </div>
        <div className="inbox-header-right">
          <button className="header-button">Minimize</button>
          <span className="header-status">
            <span className="status-dot" />{" "}
            <span className="header-status-label">Admin</span>{" "}
            <span className="header-status-state">Online</span>
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="inbox-main">
        {isMobile ? (
          <>
            {mobileView === "list" || !active ? (
              // Mobile: only show the list
              <ConversationList
                activeId={active ? active.id : null}
                onPick={handlePick}
              />
            ) : (
              // Mobile: only show the chat + top nav
              <div className="mobile-thread-shell">
                <div className="mobile-thread-nav">
                  <button
                    type="button"
                    className="mobile-nav-button"
                    onClick={handleBackToList}
                    aria-label="Back to chats"
                  >
                    ←
                  </button>
                  <div className="mobile-thread-nav-main">
                    <div className="mobile-thread-nav-title">
                      {displayName}
                    </div>
                    {active && (
                      <div className="mobile-thread-nav-sub">
                        {formatPhonePretty(active.phone)}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="mobile-nav-button"
                    onClick={handleToggleMobileMenu}
                    aria-label="Open menu"
                  >
                    ⋮
                  </button>
                </div>
                <Thread convo={active} />
              </div>
            )}

            {/* Mobile slide-in menu that reuses RightPanel */}
            {isMobile && active && showMobileMenu && (
              <div
                className="mobile-right-overlay"
                onClick={() => setShowMobileMenu(false)}
              >
                <div
                  className="mobile-right-panel-inner"
                  onClick={(e) => e.stopPropagation()}
                >
                  <RightPanel conversationId={active.id} />
                </div>
              </div>
            )}
          </>
        ) : (
          // Desktop: classic 3-column layout
          <>
            <ConversationList
              activeId={active ? active.id : null}
              onPick={handlePick}
            />

            {active ? (
              <>
                <Thread convo={active} />
                <RightPanel conversationId={active.id} />
              </>
            ) : (
              <div className="center-muted">Select a conversation</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
