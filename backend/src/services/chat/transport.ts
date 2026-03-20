import {
  sendButtonsMessage,
  sendListMessage,
  sendText,
  getRememberedPhoneNumberId,
} from "../../whatsapp.js";
import {
  getOrCreateConversationForPhone,
  insertOutboundMessage,
  upsertCustomerByWa,
} from "../../db/queries.js";
import { emit } from "../../sockets.js";
import {
  MAX_BUTTON_TITLE,
  MAX_TEXT_CHARS,
  splitLongText,
} from "../../utils/messageSafety.js";

const MAX_LIST_TITLE = 24;
const MAX_LIST_DESC = 72;
const MAX_SECTION_TITLE = 24;
const MAX_LIST_ROWS = 10;

export type SafeListRow = { id: string; title: string; description?: string };
export type SafeListSection = { title: string; rows: SafeListRow[] };
export type SafeListPayload = {
  to: string;
  header?: string;
  body: string;
  footer?: string;
  buttonText: string;
  sections: SafeListSection[];
};

export type Button = { id: string; title: string };

function splitTitleForTail(s: string): [string, string] {
  const seps = [" â€” ", " â€“ ", " - ", "â€”", "â€“", "-"];
  for (const sep of seps) {
    const i = s.indexOf(sep);
    if (i > 0) return [s.slice(0, i).trim(), s.slice(i + sep.length).trim()];
  }
  return [s.trim(), ""];
}

function clampRow(titleIn: string, descIn?: string) {
  let [name, tail] = splitTitleForTail(titleIn);
  let title = name;
  let desc = descIn || "";
  if (tail) desc = desc ? `${tail} â€¢ ${desc}` : tail;
  if (title.length > MAX_LIST_TITLE) title = title.slice(0, MAX_LIST_TITLE);
  if (desc.length > MAX_LIST_DESC) desc = desc.slice(0, MAX_LIST_DESC);
  return { title, description: desc || undefined };
}

export async function sendBotText(
  user: string,
  body: string,
  phoneNumberId?: string | null
) {
  await sendText(user, body, { phoneNumberId: phoneNumberId ?? null });

  try {
    const { id: customerId } = await upsertCustomerByWa(user, undefined, user);
    const conversationId = await getOrCreateConversationForPhone(
      customerId,
      phoneNumberId ?? null
    );

    const inserted = await insertOutboundMessage(conversationId, "text", body);

    emit("message.created", {
      conversation_id: conversationId,
      message: inserted,
    });
    emit("conversation.updated", {});
  } catch (err) {
    console.error("[chat.transport] failed to log bot message:", err);
  }
}

export async function sendLongTextSafe(
  user: string,
  body: string,
  phoneNumberId?: string | null
) {
  const chunks = splitLongText(body, MAX_TEXT_CHARS);
  for (const chunk of chunks) {
    await sendBotText(user, chunk, phoneNumberId ?? null);
  }
}

export async function sendListMessageSafe(p: SafeListPayload) {
  const rawSections = p.sections || [];
  let remaining = MAX_LIST_ROWS;
  const sections: SafeListSection[] = [];

  for (const sec of rawSections) {
    if (!sec) continue;
    if (remaining <= 0) break;

    const title = (sec.title || "").slice(0, MAX_SECTION_TITLE) || "â€”";
    const rawRows = sec.rows || [];
    if (!rawRows.length) continue;

    const rows: SafeListRow[] = rawRows.slice(0, remaining).map((r) => {
      const { title: rowTitle, description } = clampRow(r.title, r.description);
      return { id: r.id, title: rowTitle, description };
    });

    if (rows.length) {
      sections.push({ title, rows });
      remaining -= rows.length;
    }
  }

  if (!sections.length) {
    return sendBotText(p.to, p.body || " ");
  }

  await sendListMessage({
    to: p.to,
    header: p.header,
    body: p.body || " ",
    footer: p.footer,
    buttonText: (p.buttonText || "Open").slice(0, MAX_BUTTON_TITLE),
    sections,
  } as any);

  const summaryPayload = {
    kind: "menu",
    subtype: "list",
    header: p.header || null,
    body: p.body || null,
    sections: sections.map((sec) => ({
      title: sec.title || null,
      rows: (sec.rows || []).map((r) => r.title || ""),
    })),
  };

  const summaryBody = `[MENU]${JSON.stringify(summaryPayload)}`;

  try {
    const { id: customerId } = await upsertCustomerByWa(p.to, undefined, p.to);
    const conversationId = await getOrCreateConversationForPhone(
      customerId,
      getRememberedPhoneNumberId(p.to) ?? null
    );
    const inserted = await insertOutboundMessage(conversationId, "text", summaryBody);

    emit("message.created", {
      conversation_id: conversationId,
      message: inserted,
    });
    emit("conversation.updated", {});
  } catch (err) {
    console.error("[chat.transport] failed to log list menu:", err);
  }
}

export async function sendButtonsMessageSafe(
  to: string,
  body: string,
  buttons: Button[]
) {
  const trimmed = (buttons || []).slice(0, 3).map((b) => ({
    id: b.id,
    title: (b.title || "").slice(0, MAX_BUTTON_TITLE) || "â€¢",
  }));

  if (!trimmed.length) {
    return sendBotText(to, body);
  }

  await sendButtonsMessage(to, (body || " ").slice(0, 1000), trimmed);

  const summaryPayload = {
    kind: "menu",
    subtype: "buttons",
    header: null,
    body: body || null,
    buttons: trimmed.map((b) => b.title),
  };

  const summaryBody = `[MENU]${JSON.stringify(summaryPayload)}`;

  try {
    const { id: customerId } = await upsertCustomerByWa(to, undefined, to);
    const conversationId = await getOrCreateConversationForPhone(
      customerId,
      getRememberedPhoneNumberId(to) ?? null
    );
    const inserted = await insertOutboundMessage(conversationId, "text", summaryBody);

    emit("message.created", {
      conversation_id: conversationId,
      message: inserted,
    });
    emit("conversation.updated", {});
  } catch (err) {
    console.error("[chat.transport] failed to log buttons menu:", err);
  }
}
