// web/app/inbox/page.tsx
"use client";

import { useState } from "react";
import ConversationList, { Convo } from "@/components/ConversationList";
import Thread from "@/components/Thread";
import RightPanel from "@/components/RightPanel";
import { api } from "@/lib/api";

export default function InboxPage() {
  const [active, setActive] = useState<Convo | null>(null);

  const handlePick = async (convo: Convo) => {
    // update selected conversation in the UI
    setActive(convo);

    // mark this conversation as read in the backend
    try {
      await api(`/api/conversations/${convo.id}/read`, {
        method: "POST",
      });
    } catch (err) {
      console.error("Failed to mark conversation as read", err);
    }
  };

  return (
    <div className="inbox-root">
      {/* Header */}
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

      {/* Main 3-column content */}
      <div className="inbox-main">
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
      </div>
    </div>
  );
}
