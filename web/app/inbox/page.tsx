// web/app/inbox/page.tsx
"use client";

import { useState } from "react";
import ConversationList, { Convo } from "@/components/ConversationList";
import Thread from "@/components/Thread";
import RightPanel from "@/components/RightPanel";

export default function InboxPage() {
  const [active, setActive] = useState<Convo | null>(null);

  return (
    <div className="inbox-root">
      {/* Header */}
      <div className="inbox-header">
        <div className="inbox-header-left">
          <span className="inbox-header-title">Ujani Herbals Chatbot — Inbox</span>
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

      {/* Main 3-column content */}
      <div className="inbox-main">
        <ConversationList
          activeId={active ? active.id : null}
          onPick={setActive}
        />

        {active ? (
          <>
            <Thread convo={active} />
            <RightPanel conversationId={active.id} />
          </>
        ) : (
          <div className="center-muted">Select a conversation</div>
        )}
      </div>
    </div>
  );
}
