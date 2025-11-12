"use client";
import CustomerPanel from "./CustomerPanel";
export default function RightPanel({ conversationId }: { conversationId: number | null }) {
  return <div className="h-full overflow-auto scroll-thin"><CustomerPanel conversationId={conversationId} /></div>;
}
