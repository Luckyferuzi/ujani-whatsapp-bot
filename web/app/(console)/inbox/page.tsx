"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ConversationList, { type Convo } from "@/components/ConversationList";
import Thread from "@/components/Thread";
import RightPanel from "@/components/RightPanel";
import { api } from "@/lib/api";
import { formatPhonePretty } from "@/lib/phone";

type MobileView = "list" | "chat";

const MOBILE_BREAKPOINT = 768;
const STORAGE_KEY = "ujani-inbox-active";
const STORAGE_MAX_AGE_MS = 10 * 60 * 1000;

function readSavedConversationId() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.id === "string" && typeof parsed.savedAt === "number" && Date.now() - parsed.savedAt < STORAGE_MAX_AGE_MS) {
      return parsed.id;
    }
  } catch {}
  return null;
}

function writeSavedConversationId(id: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, savedAt: Date.now() }));
  } catch {}
}

function clearSavedConversationId() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

export default function InboxPage() {
  const [active, setActive] = useState<Convo | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [desktopContextOpen, setDesktopContextOpen] = useState(true);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [restoreDone, setRestoreDone] = useState(false);
  const searchParams = useSearchParams();
  const phoneFromUrl = searchParams.get("phone");

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
    } else {
      setDesktopContextOpen(true);
    }

    try {
      await api(`/api/conversations/${convo.id}/read`, { method: "POST" });
    } catch (error) {
      console.error("Failed to mark conversation as read", error);
    }
  };

  const handleLoaded = (items: Convo[]) => {
    const list = items ?? [];

    if (active && !list.some((item) => item.id === active.id)) {
      setActive(null);
      clearSavedConversationId();
      setSavedId(null);
      if (isMobile) setMobileView("list");
    }

    if (phoneFromUrl) {
      if (!restoreDone) setRestoreDone(true);
      return;
    }

    if (restoreDone) return;

    if (savedId) {
      const match = list.find((item) => item.id === savedId);
      if (match) {
        setActive(match);
        if (isMobile) setMobileView("chat");
      } else {
        clearSavedConversationId();
        setSavedId(null);
      }
    }

    setRestoreDone(true);
  };

  const displayName = useMemo(() => {
    if (active?.name?.trim()) return active.name;
    return active ? formatPhonePretty(active.phone) : "";
  }, [active]);

  const mobileRestockCount = active?.restock_subscribed_count ?? 0;

  return (
    <div className="inbox-root">
      <div className="inbox-main">
        {isMobile ? (
          <>
            {mobileView === "list" || !active ? (
              <ConversationList activeId={active?.id ?? null} onPick={handlePick} phoneFilter={phoneFromUrl} onLoaded={handleLoaded} />
            ) : (
              <div className="mobile-thread-shell">
                <div className="mobile-thread-nav">
                  <button type="button" className="mobile-nav-button" onClick={() => setMobileView("list")}>Back</button>
                  <div className="mobile-thread-nav-main">
                    <div className="mobile-thread-nav-title">
                      {displayName}
                      {mobileRestockCount > 0 ? <span className="thread-inline-chip">Stock alert{mobileRestockCount > 1 ? ` ${mobileRestockCount}` : ""}</span> : null}
                    </div>
                    {active ? <div className="mobile-thread-nav-sub">{formatPhonePretty(active.phone)}</div> : null}
                  </div>
                  <button type="button" className="mobile-nav-button" onClick={() => setShowMobileMenu((value) => !value)}>Summary</button>
                </div>

                <Thread convo={active} onOpenContext={() => setShowMobileMenu(true)} onToggleContext={() => setShowMobileMenu((value) => !value)} contextOpen={showMobileMenu} />
              </div>
            )}

            {active && showMobileMenu ? (
              <div className="mobile-right-overlay" onClick={() => setShowMobileMenu(false)}>
                <div className="mobile-right-panel-inner" onClick={(event) => event.stopPropagation()}>
                  <RightPanel conversationId={active.id} conversation={active} onClose={() => setShowMobileMenu(false)} />
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <>
            <div className="inbox-rail inbox-rail--list">
              <ConversationList activeId={active?.id ?? null} onPick={handlePick} phoneFilter={phoneFromUrl} onLoaded={handleLoaded} />
            </div>

            <div className="inbox-focus-region">
              {active ? (
                <Thread convo={active} onOpenContext={() => setDesktopContextOpen(true)} onToggleContext={() => setDesktopContextOpen((value) => !value)} contextOpen={desktopContextOpen} />
              ) : (
                <div className="inbox-empty-state">
                  <div className="inbox-empty-kicker">Inbox</div>
                  <div className="inbox-empty-title">Pick a conversation to begin.</div>
                  <div className="inbox-empty-copy">Review customer history, payment status, delivery progress, and internal notes from one working view.</div>
                </div>
              )}

              {active && desktopContextOpen ? (
                <div className="inbox-summary-region">
                  <RightPanel conversationId={active.id} conversation={active} />
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
