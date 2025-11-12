'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import ConversationList, { type Conversation } from '@/components/ConversationList';
import Thread from '@/components/Thread';
import RightPanel from '@/components/RightPanel';
import { api } from '@/lib/api';
import Composer from '@/components/Composer';

export default function Inbox() {
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [convs, setConvs] = useState<Conversation[]>([]);

  const loadConvs = useCallback(async () => {
    const rows = await api<Conversation[]>('/api/conversations');
    setConvs(rows);
    if (rows.length && !currentId) setCurrentId(rows[0].id);
  }, [currentId]);

  useEffect(() => { void loadConvs(); }, [loadConvs]);

  const current = useMemo(() => convs.find((c) => c.id === currentId) || null, [convs, currentId]);
  const agentAllowed = Boolean((current as unknown as { agent_allowed?: boolean })?.agent_allowed ?? true);

  return (
    <div className="grid grid-cols-[320px_1fr_360px] h-[calc(100vh-56px)]">
      <div className="border-r border-ui.border"><ConversationList current={currentId} onPick={setCurrentId} /></div>
      <div className="flex flex-col">
        <div className="flex-1"><Thread conversationId={currentId} /></div>
        <Composer conversationId={currentId} agentAllowed={agentAllowed} />
      </div>
      <div className="border-l border-ui.border"><RightPanel conversationId={currentId} /></div>
    </div>
  );
}
