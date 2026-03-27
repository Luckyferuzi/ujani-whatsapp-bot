import type { Convo } from "@/components/ConversationList";

export type ThreadProps = {
  convo: Convo;
  onOpenContext?: () => void;
  onToggleContext?: () => void;
  contextOpen?: boolean;
};

export type Msg = {
  id: string | number;
  conversation_id: string | number;
  direction: "in" | "inbound" | "out" | "outbound";
  type: string;
  body: string | null;
  status?: string | null;
  message_kind?: string | null;
  status_reason?: string | null;
  error_title?: string | null;
  error_details?: string | null;
  template_key?: string | null;
  template_name?: string | null;
  created_at: string;
};

export type ComposerNotice = {
  key: string;
  message: string;
  actionLabel: string | null;
};
