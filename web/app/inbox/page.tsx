"use client";

import { useEffect, useMemo, useState } from "react";
import ConversationList, { Convo } from "@/components/ConversationList";
import Thread from "@/components/Thread";
import RightPanel from "@/components/RightPanel";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";
import { useSearchParams } from "next/navigation";

type MobileView = "list" | "chat";

const MOBILE_BREAKPOINT = 768; // px
const STORAGE_KEY = "ujani-inbox-active";

function readSavedConversationId(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (parsed && typeof parsed === "object" && typeof parsed.id === "string") {
      return parsed.id;
    }

    return null;
  } catch {
    return null;
  }
}

function writeSavedConversationId(id: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ id }));
  } catch {
    // ignore
  }
}

function clearSavedConversationId() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export default function InboxPage() {
  const [active, setActive] = useState<Convo | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [showMobileMenu, setShowMobileMenu] = useState(false);

  const searchParams = useSearchParams();
  const phoneFromUrl = searchParams.get("phone");

  // Saved selection restore (by id only, validated against server list)
  const [savedId, setSavedId] = useState<string | null>(null);
  const [restoreDone, setRestoreDone] = useState(false);

  useEffect(() => {
    const update = () => {
      const mobile = window.innerWidth < MOBILE_BREAKPOINT;
      setIsMobile(mobile);
      if (!mobile) {
        setMobileView("list");
        setShowMobileMenu(false);
      }
    };

    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    setSavedId(readSavedConversationId());
  }, []);

  const handlePick = async (convo: Convo) => {
    setActive(convo);
    writeSavedConversationId(convo.id);
    setSavedId(convo.id);
    setRestoreDone(true);

    if (isMobile) {
      setMobileView("chat");
      setShowMobileMenu(false);
    }

    try {
      await api(`/api/conversations/${convo.id}/read`, { method: "POST" });
    } catch (err) {
      console.error("Failed to mark conversation as read", err);
    }
  };

  const handleLoaded = (items: Convo[]) => {
    const list = items ?? [];

    if (active && !list.some((c) => c.id === active.id)) {
      setActive(null);
      clearSavedConversationId();
      setSavedId(null);
      if (isMobile) {
        setMobileView("list");
        setShowMobileMenu(false);
      }
    }

    if (phoneFromUrl) {
      if (!restoreDone) setRestoreDone(true);
      return;
    }

    if (restoreDone) return;

    if (savedId) {
      const match = list.find((c) => c.id === savedId);
      if (match) {
        setActive(match);
        if (window.innerWidth < MOBILE_BREAKPOINT) {
          setMobileView("chat");
        }
      } else {
        clearSavedConversationId();
        setSavedId(null);
      }
    }

    setRestoreDone(true);
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

  const displayName = useMemo(() => {
    if (active?.name && active.name.trim().length > 0) return active.name;
    if (active) return formatPhonePretty(active.phone);
    return "";
  }, [active]);

  const mobileRestockCount = active?.restock_subscribed_count ?? 0;

  return (
    <div className="inbox-root">
      <div className="inbox-main">
        {isMobile ? (
          <>
            {mobileView === "list" || !active ? (
              <ConversationList
                activeId={active ? active.id : null}
                onPick={handlePick}
                phoneFilter={phoneFromUrl}
                onLoaded={handleLoaded}
              />
            ) : (
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
                      {mobileRestockCount > 0 && (
                        <span className="badge badge--restock mobile-restock-badge">
                          Stock Alert
                          {mobileRestockCount > 1 ? ` ${mobileRestockCount}` : ""}
                        </span>
                      )}
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
          <>
            <ConversationList
              activeId={active ? active.id : null}
              onPick={handlePick}
              phoneFilter={phoneFromUrl}
              onLoaded={handleLoaded}
            />

            {active ? (
              <>
                <Thread convo={active} />
                <RightPanel conversationId={active.id} />
              </>
            ) : (
              <div className="center-muted">
                Select a conversation to view messages
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
