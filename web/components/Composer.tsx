"use client";
import { useState } from "react";
import { API } from "@/lib/api";
import { Button, Textarea } from "./ui";

export default function Composer({ conversationId, agentAllowed }: { conversationId: number | null, agentAllowed?: boolean }) {
  const [text, setText] = useState("");
  const disabled = !conversationId || !agentAllowed || text.trim().length === 0;

  async function send() {
    const body = { conversationId, text };
    await fetch(`${API}/api/send`, { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify(body) });
    setText("");
  }

  return (
    <div className="border-t border-ui.border p-3">
      {!agentAllowed && (<div className="text-ui.warn text-sm mb-2">Bot active — mteja abonyeze “Ongea na mhudumu” kwanza. (Composer locked)</div>)}
      <div className="flex items-end gap-3">
        <Textarea rows={2} placeholder={agentAllowed ? "Type a message…" : "Locked"} value={text} onChange={e => setText(e.target.value)} disabled={!agentAllowed} />
        <Button onClick={send} disabled={disabled} className="min-w-[110px]">Send</Button>
      </div>
    </div>
  );
}
