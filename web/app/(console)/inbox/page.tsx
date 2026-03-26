"use client";

import { useEffect, useMemo, useState } from "react";
import ConversationList, { Convo } from "@/components/ConversationList";
import Thread from "@/components/Thread";
import RightPanel from "@/components/RightPanel";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";
import { useSearchParams } from "next/navigation";

type MobileView = "list" | "chat";

const MOBILE_BREAKPOINT = 768;
const STORAGE_KEY = "ujani-inbox-active";
const STORAGE_MAX_AGE_MS = 10 * 60 * 1000;
const DESKTOP_LIST_STORAGE_KEY = "ujani-inbox-desktop-list-open";

function readSavedConversationId(): string | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    if (
      parsed &&
      typeof parsed === "object" &&
      typeof parsed.id === "string" &&
      typeof parsed.savedAt === "number" &&
      Date.now() - parsed.savedAt < STORAGE_MAX_AGE_MS
    ) {
      return parsed.id;
    }

    return null;
  } catch {
    return null;
  }
}

function writeSavedConversationId(id: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, savedAt: Date.now() }));
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
  const [desktopListOpen, setDesktopListOpen] = useState(true);
  const [desktopContextOpen, setDesktopContextOpen] = useState(false);

  const searchParams = useSearchParams();
  const phoneFromUrl = searchParams.get("phone");

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

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DESKTOP_LIST_STORAGE_KEY);
      if (raw === "0") {
        setDesktopListOpen(false);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isMobile) return;
    try {
      window.localStorage.setItem(
        DESKTOP_LIST_STORAGE_KEY,
        desktopListOpen ? "1" : "0"
      );
    } catch {
      // ignore
    }
  }, [desktopListOpen, isMobile]);

  const handlePick = async (convo: Convo) => {
    setActive(convo);
    writeSavedConversationId(convo.id);
    setSavedId(convo.id);
    setRestoreDone(true);

    if (isMobile) {
      setMobileView("chat");
      setShowMobileMenu(false);
    } else {
      setDesktopContextOpen(false);
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
      } else {
        setDesktopContextOpen(false);
      }
    }

    if (phoneFromUrl) {
      if (!restoreDone) setRestoreDone(true);
      return;
    }

    if (restoreDone) return;

    if (savedId && isMobile) {
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
    } else if (savedId && !isMobile) {
      const match = list.find((c) => c.id === savedId);
      if (match) {
        setActive(match);
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

  const displayName = useMemo(() => {
    if (active?.name && active.name.trim().length > 0) return active.name;
    if (active) return formatPhonePretty(active.phone);
    return "";
  }, [active]);

  const mobileRestockCount = active?.restock_subscribed_count ?? 0;

  return (
    <div className="inbox-root">
      <div
        className={
          "inbox-main" +
          (!desktopListOpen && !isMobile ? " inbox-main--list-collapsed" : "")
        }
      >
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
                    Back
                  </button>

                  <div className="mobile-thread-nav-main">
                    <div className="mobile-thread-nav-title">
                      {displayName}
                      {mobileRestockCount > 0 ? (
                        <span className="badge badge--restock mobile-restock-badge">
                          Stock Alert
                          {mobileRestockCount > 1 ? ` ${mobileRestockCount}` : ""}
                        </span>
                      ) : null}
                    </div>
                    {active ? (
                      <div className="mobile-thread-nav-sub">
                        {formatPhonePretty(active.phone)}
                      </div>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    className="mobile-nav-button"
                    onClick={() => setShowMobileMenu((prev) => !prev)}
                    aria-label="Open context"
                  >
                    Summary
                  </button>
                </div>

                <Thread
                  convo={active}
                  onOpenContext={() => setShowMobileMenu(true)}
                  onToggleContext={() => setShowMobileMenu((prev) => !prev)}
                  contextOpen={showMobileMenu}
                />
              </div>
            )}

            {active && showMobileMenu ? (
              <div className="mobile-right-overlay" onClick={() => setShowMobileMenu(false)}>
                <div className="mobile-right-panel-inner" onClick={(e) => e.stopPropagation()}>
                  <RightPanel
                    conversationId={active.id}
                    onClose={() => setShowMobileMenu(false)}
                  />
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {desktopListOpen ? (
              <div className="inbox-rail inbox-rail--list">
                <ConversationList
                  activeId={active ? active.id : null}
                  onPick={handlePick}
                  phoneFilter={phoneFromUrl}
                  onLoaded={handleLoaded}
                />
              </div>
            ) : null}

            <div className="inbox-focus-region">
              {active ? (
                <Thread
                  convo={active}
                  onOpenContext={() => setDesktopContextOpen(true)}
                  onToggleContext={() => setDesktopContextOpen((prev) => !prev)}
                  contextOpen={desktopContextOpen}
                  onToggleList={() => setDesktopListOpen((prev) => !prev)}
                  listOpen={desktopListOpen}
                />
              ) : (
                <div className="inbox-empty-state">
                  <div className="inbox-empty-kicker">Inbox cockpit</div>
                  <div className="inbox-empty-title">
                    Pick a conversation to start operating.
                  </div>
                  <div className="inbox-empty-copy">
                    Review customer history, payment status, delivery progress, and
                    internal notes from one focused working view.
                  </div>
                  {!desktopListOpen ? (
                    <button
                      type="button"
                      className="thread-header-action inbox-empty-action"
                      onClick={() => setDesktopListOpen(true)}
                    >
                      Show conversations
                    </button>
                  ) : null}
                </div>
              )}

              {active && desktopContextOpen ? (
                <>
                  <button
                    type="button"
                    className="inbox-context-scrim"
                    aria-label="Close summary"
                    onClick={() => setDesktopContextOpen(false)}
                  />
                  <div className="inbox-context-drawer">
                    <RightPanel
                      conversationId={active.id}
                      onClose={() => setDesktopContextOpen(false)}
                    />
                  </div>
                </>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
