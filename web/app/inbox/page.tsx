"use client";

import { useState } from "react";
import ConversationList, { Convo } from "@/components/ConversationList";
import Thread from "@/components/Thread";
import RightPanel from "@/components/RightPanel";

export default function InboxPage() {
  const [active, setActive] = useState<Convo | null>(null);

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-[#f0f2f5]">
      {/* Header inside inbox (like WhatsApp web top bar) */}
      <div className="h-12 border-b bg-white px-4 flex items-center justify-between">
        <div className="font-semibold">Ujani Admin — Inbox</div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <button className="px-2 py-1 rounded border border-gray-300 hover:bg-gray-50">
            Minimize
          </button>
          <span>
            Agent: <span className="font-medium text-gray-700">Admin</span>{" "}
            <span className="text-green-600">• Online</span>
          </span>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden">
        <ConversationList
          onPick={setActive}
          activeId={active ? active.id : null}
        />
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
