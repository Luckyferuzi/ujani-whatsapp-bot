export const MAX_TEXT_CHARS = 1200;
export const MAX_LIST_TITLE = 24;
export const MAX_LIST_DESC = 72;
export const MAX_SECTION_TITLE = 24;
export const MAX_LIST_ROWS = 10;
export const MAX_BUTTON_TITLE = 20;

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

export type SafeButton = { id: string; title: string };

export function splitLongText(body: string, maxLen = MAX_TEXT_CHARS): string[] {
  const text = String(body ?? "").trim();
  if (!text) return [];
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    let cut = remaining.lastIndexOf("\n\n", maxLen);
    if (cut < Math.floor(maxLen * 0.6)) cut = remaining.lastIndexOf("\n", maxLen);
    if (cut < Math.floor(maxLen * 0.6)) cut = remaining.lastIndexOf(" ", maxLen);
    if (cut < Math.floor(maxLen * 0.6)) cut = maxLen;

    const part = remaining.slice(0, cut).trim();
    if (part) chunks.push(part);
    remaining = remaining.slice(cut).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export function splitTitleForTail(s: string): [string, string] {
  const seps = [" - ", "-", " — ", "—", " – ", "–"];
  for (const sep of seps) {
    const i = s.indexOf(sep);
    if (i > 0) return [s.slice(0, i).trim(), s.slice(i + sep.length).trim()];
  }
  return [s.trim(), ""];
}

export function clampRow(titleIn: string, descIn?: string) {
  let [name, tail] = splitTitleForTail(titleIn);
  let title = name;
  let desc = descIn || "";
  if (tail) desc = desc ? `${tail} • ${desc}` : tail;
  if (title.length > MAX_LIST_TITLE) title = title.slice(0, MAX_LIST_TITLE);
  if (desc.length > MAX_LIST_DESC) desc = desc.slice(0, MAX_LIST_DESC);
  return { title, description: desc || undefined };
}

export function normalizeListPayload(payload: SafeListPayload) {
  const rawSections = payload.sections || [];
  let remaining = MAX_LIST_ROWS;
  const sections: SafeListSection[] = [];

  for (const sec of rawSections) {
    if (!sec || remaining <= 0) break;

    const title = (sec.title || "").slice(0, MAX_SECTION_TITLE) || "-";
    const rawRows = sec.rows || [];
    if (!rawRows.length) continue;

    const rows: SafeListRow[] = rawRows.slice(0, remaining).map((row) => {
      const { title: rowTitle, description } = clampRow(row.title, row.description);
      return { id: row.id, title: rowTitle, description };
    });

    if (rows.length) {
      sections.push({ title, rows });
      remaining -= rows.length;
    }
  }

  return {
    ...payload,
    body: payload.body || " ",
    buttonText: (payload.buttonText || "Open").slice(0, MAX_BUTTON_TITLE),
    sections,
  };
}

export function normalizeButtons(buttons: SafeButton[]): SafeButton[] {
  return (buttons || []).slice(0, 3).map((button) => ({
    id: button.id,
    title: (button.title || "").slice(0, MAX_BUTTON_TITLE) || "•",
  }));
}
