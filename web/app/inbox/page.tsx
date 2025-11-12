"use client";
import { useState } from "react";
import ConversationList, { Convo } from "@/components/ConversationList";
import Thread from "@/components/Thread";
import RightPanel from "@/components/RightPanel";

export default function InboxPage() {
  const [active, setActive] = useState<Convo | null>(null);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="h-12 border-b bg-white px-4 flex items-center justify-between">
        <div className="font-semibold">Ujani Admin — Inbox</div>
        <div className="flex items-center gap-3">
          <button className="text-xs px-2 py-1 rounded border hover:bg-gray-50">Minimize</button>
          <div className="text-xs text-green-700 bg-green-100 px-2 py-1 rounded">Agent: Admin • Online</div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex">
        <ConversationList onPick={setActive} activeId={active?.id} />
        {active ? (
          <>
            <Thread convo={active} />
            <RightPanel conversationId={active.id} />
          </>
        ) : (
          <div className="flex-1 grid place-items-center text-gray-400">Select a conversation</div>
        )}
      </div>
    </div>
  );
}
