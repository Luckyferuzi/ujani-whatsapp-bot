"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, Badge } from "./ui";
import type { Convo } from "./ConversationList";

type Conversation = Convo & {
  last_user_message_at: string;
};

export default function CustomerPanel({
  conversationId,
}: {
  conversationId: string | null;
}) {
  const [c, setC] = useState<Conversation | null>(null);

  const load = useCallback(async () => {
    if (!conversationId) return setC(null);
    const list = await api<Conversation[]>("/api/conversations");
    setC(list.find((x) => String(x.id) === String(conversationId)) ?? null);
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!conversationId || !c) {
    return null;
  }

  return (
    <div className="space-y-3">
      <Card className="p-4">
        <div className="text-xs uppercase text-ui-dim mb-1">Customer</div>
        <div className="font-semibold">{c.name || c.phone || "Mteja"}</div>
        <div className="text-xs text-ui-dim mt-1">
          Last message:{" "}
          {c.last_user_message_at
            ? new Date(c.last_user_message_at).toLocaleString()
            : "—"}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-ui-dim">Agent replies</div>
          <Badge>{c.agent_allowed ? "Enabled" : "Locked by bot"}</Badge>
        </div>
        <div className="text-xs text-ui-dim mt-2">
          Composer is {c.agent_allowed ? "enabled" : "locked until customer taps “Ongea na mhudumu”"}
        </div>
      </Card>
    </div>
  );
}
