// web/app/inbox/page.tsx
"use client";

import { useState } from "react";
import ConversationList, { Convo } from "@/components/ConversationList";
import Thread from "@/components/Thread";
import RightPanel from "@/components/RightPanel";

export default function InboxPage() {
  const [active, setActive] = useState<Convo | null>(null);

  return (
    <div className="h-screen flex flex-col bg-[#f0f2f5]">
      {/* Top bar similar to your mock */}
      <div className="h-12 border-b bg-white px-4 flex items-center justify-between">
        <div className="font-semibold">Ujani Admin — Inbox</div>
        <div className="flex items-center gap-3">
          <button className="text-xs px-2 py-1 rounded border text-gray-600 hover:bg-gray-50">
            Minimize
          </button>
          <div className="text-xs text-gray-500">
            Agent: <span className="font-medium">Admin</span>{" "}
            <span className="text-green-600">• Online</span>
          </div>
        </div>
      </div>

      {/* Main 3-column area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: WhatsApp-style chat list */}
        <ConversationList onPick={setActive} activeId={active?.id ?? null} />

        {/* Middle + right */}
        {active ? (
          <>
            <Thread convo={active} />
            <RightPanel conversationId={active.id} />
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-gray-400">
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}
