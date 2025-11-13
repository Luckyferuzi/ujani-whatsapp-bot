"use client";

import { useState } from "react";
import { API } from "@/lib/api";
import { Button, Textarea } from "./ui";

export default function Composer({
  conversationId,
  agentAllowed,
}: {
  conversationId: string | null;
  agentAllowed?: boolean;
}) {
  const [text, setText] = useState("");
  const disabled =
    !conversationId || !agentAllowed || text.trim().length === 0;

  async function send() {
    const body = { conversationId, text: text.trim() };
    await fetch(`${API}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setText("");
  }

  return (
    <div className="space-y-2">
      <Textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          agentAllowed
            ? "Type a message to the customer"
            : "Composer locked until customer taps “Ongea na mhudumu”"
        }
      />
      <Button disabled={disabled} onClick={send}>
        Send
      </Button>
    </div>
  );
}
