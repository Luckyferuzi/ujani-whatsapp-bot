// web/lib/threadModel.ts

export type RawMsg = {
  id: string | number;
  conversation_id: string | number;
  direction: "in" | "inbound" | "out" | "outbound";
  type: string;
  body: string | null;
  status?: string | null;
  created_at: string;
};

export type ProductNameMap = Record<string, string>;

export type UiActor = "customer" | "bot" | "admin";

export type ParsedMenu = {
  introLines: string[];
  sections: { title: string; options: string[] }[];
};

export type UiContent =
  | { kind: "text"; text: string }
  | { kind: "menu"; menu: ParsedMenu }
  | { kind: "selection"; text: string }
  | { kind: "location"; lat: number; lng: number; url: string }
  | { kind: "media"; mediaKind: "image" | "video" | "audio" | "document"; mediaId: string }
  | { kind: "event"; text: string };

export type UiMessage = {
  rawId: string | number;
  conversationId: string | number;
  createdAt: string;
  status?: string | null;
  actor: UiActor;
  content: UiContent;
};

export type LocalEvent = {
  id: string;
  created_at: string;
  text: string;
};

export type ThreadItem =
  | { kind: "day"; id: string; label: string }
  | { kind: "event"; id: string; createdAt: string; text: string }
  | { kind: "message"; id: string; ui: UiMessage; showBotLabel: boolean };

function isInbound(direction: RawMsg["direction"]) {
  return direction === "in" || direction === "inbound";
}

function dayKeyFromIso(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown-day";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function labelForDayKey(dayKey: string) {
  if (dayKey === "unknown-day") return "";
  const [y, m, d] = dayKey.split("-").map((v) => Number(v));
  const date = new Date(y, (m || 1) - 1, d || 1);

  const now = new Date();
  const todayKey = dayKeyFromIso(now.toISOString());

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const yesterdayKey = dayKeyFromIso(yesterday.toISOString());

  if (dayKey === todayKey) return "Today";
  if (dayKey === yesterdayKey) return "Yesterday";

  // Example: "Mon, 12 Jan 2026"
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Menus stored as JSON: [MENU]{...}
 */
export function parseMenuFromJsonBody(body: string): ParsedMenu | null {
  const match = body.match(/^\[MENU\](.+)$/);
  if (!match) return null;

  try {
    const payload = JSON.parse(match[1]);

    if (!payload || payload.kind !== "menu") return null;

    const introLines: string[] = [];
    const header = typeof payload.header === "string" ? payload.header.trim() : "";
    const text = typeof payload.body === "string" ? payload.body.trim() : "";

    if (header) introLines.push(header);
    if (text && text !== header) introLines.push(text);

    const sections: ParsedMenu["sections"] = [];

    // Buttons menus
    if (payload.subtype === "buttons" && Array.isArray(payload.buttons)) {
      const opts = (payload.buttons as unknown[])
        .filter((v): v is string => typeof v === "string")
        .map((s) => s.trim())
        .filter(Boolean);

      if (opts.length) {
        sections.push({ title: text || header || "", options: opts });
      }
    }

    // List menus
    if (payload.subtype === "list" && Array.isArray(payload.sections)) {
      for (const sec of payload.sections as any[]) {
        const secTitle = typeof sec?.title === "string" ? sec.title.trim() : "";
        const rows = Array.isArray(sec?.rows) ? sec.rows : [];
        const opts = rows
          .map((r: any) => (typeof r === "string" ? r : typeof r?.title === "string" ? r.title : ""))
          .map((s: string) => s.trim())
          .filter(Boolean);

        if (opts.length) {
          sections.push({ title: secTitle || text || header || "", options: opts });
        }
      }
    }

    if (!sections.length) return null;
    return { introLines, sections };
  } catch {
    return null;
  }
}

/**
 * Menus stored as plain text:
 * Title:
 * • Option
 * • Option
 */
export function parseMenuFromPlainBody(body: string): ParsedMenu | null {
  if (!body) return null;

  const rawLines = body.split("\n");
  const trimmed = rawLines.map((l) => l.trim());

  const hasBullet = trimmed.some((l) => l.startsWith("• "));
  if (!hasBullet) return null;

  let firstHeaderIndex = -1;
  for (let i = 0; i < trimmed.length; i++) {
    const line = trimmed[i];
    if (!line) continue;
    if (line.endsWith(":")) {
      firstHeaderIndex = i;
      break;
    }
  }
  if (firstHeaderIndex === -1) return null;

  const introLines = trimmed.slice(0, firstHeaderIndex).filter(Boolean);
  const sections: ParsedMenu["sections"] = [];

  let i = firstHeaderIndex;
  while (i < trimmed.length) {
    while (i < trimmed.length && !trimmed[i]) i++;
    if (i >= trimmed.length) break;

    const headerLine = trimmed[i];
    if (!headerLine.endsWith(":")) break;

    const title = headerLine.slice(0, -1);
    i++;

    const options: string[] = [];
    while (i < trimmed.length) {
      const line = trimmed[i];

      if (!line) {
        i++;
        continue;
      }

      if (line.endsWith(":")) break;
      if (line.startsWith("• ")) options.push(line.slice(2).trim());

      i++;
    }

    if (options.length) sections.push({ title, options });
  }

  if (!sections.length) return null;
  return { introLines, sections };
}

export function formatInteractiveDisplay(
  raw: string,
  products: ProductNameMap
): string {
  const id = raw.trim();
  if (!id) return "";

  const nameForSku = (sku: string) => products[sku] ?? sku;

  // Product selection
  if (id.startsWith("PRODUCT_")) {
    const sku = id.slice("PRODUCT_".length);
    return `Selected product: ${nameForSku(sku)}`;
  }

  // Add to cart
  if (id.startsWith("ADD_")) {
    const sku = id.slice("ADD_".length);
    return `Added to cart: ${nameForSku(sku)}`;
  }

  // Buy now
  if (id.startsWith("BUY_")) {
    const sku = id.slice("BUY_".length);
    return `Buy now: ${nameForSku(sku)}`;
  }

  // Main actions
  if (id === "ACTION_VIEW_CART") return "Opened cart";
  if (id === "ACTION_CHECKOUT") return "Started checkout";
  if (id === "ACTION_TRACK_BY_NAME") return "Track order by name";
  if (id === "ACTION_TALK_TO_AGENT") return "Requested an agent";
  if (id === "ACTION_FAQ") return "Opened FAQs";
  if (id === "ACTION_BACK") return "Back to main menu";

  return `Selected: ${id}`;
}

function normalizeOneMessage(
  msg: RawMsg,
  ctx: {
    products: ProductNameMap;
    resolveOutboundActor?: (m: RawMsg) => UiActor;
  }
): UiMessage {
  const body = msg.body ?? "";
  const inbound = isInbound(msg.direction);

  // Event markers supported (optional)
  if (msg.type === "event" || body.startsWith("EVENT:") || body.startsWith("[EVENT]")) {
    const text = body.replace(/^\[EVENT\]\s?/, "").replace(/^EVENT:\s?/, "").trim();
    return {
      rawId: msg.id,
      conversationId: msg.conversation_id,
      createdAt: msg.created_at,
      status: msg.status ?? null,
      actor: "admin",
      content: { kind: "event", text: text || "Event" },
    };
  }

  // Actor
  let actor: UiActor = "customer";
  if (!inbound) {
    actor = ctx.resolveOutboundActor ? ctx.resolveOutboundActor(msg) : "admin";
  }

  // 1) Menu (JSON summary)
  const jsonMenu = parseMenuFromJsonBody(body);
  if (jsonMenu) {
    return {
      rawId: msg.id,
      conversationId: msg.conversation_id,
      createdAt: msg.created_at,
      status: msg.status ?? null,
      actor,
      content: { kind: "menu", menu: jsonMenu },
    };
  }

  // 2) Menu (plain bullets) — usually bot
  const plainMenu = parseMenuFromPlainBody(body);
  if (plainMenu && !inbound) {
    return {
      rawId: msg.id,
      conversationId: msg.conversation_id,
      createdAt: msg.created_at,
      status: msg.status ?? null,
      actor,
      content: { kind: "menu", menu: plainMenu },
    };
  }

  // 3) Interactive selection
  // Newer inbound interactive stores the title in body and type="interactive"
  if (inbound && msg.type === "interactive") {
    const title = (body || "").trim();
    const display = title ? `Selected: ${title}` : "Selected an option";
    return {
      rawId: msg.id,
      conversationId: msg.conversation_id,
      createdAt: msg.created_at,
      status: msg.status ?? null,
      actor: "customer",
      content: { kind: "selection", text: display },
    };
  }

  // Older fallback: [interactive:ID]
  const interactiveMatch = body.match(/^\[interactive:(.+)\]$/);
  if (interactiveMatch) {
    const id = interactiveMatch[1];
    return {
      rawId: msg.id,
      conversationId: msg.conversation_id,
      createdAt: msg.created_at,
      status: msg.status ?? null,
      actor: inbound ? "customer" : actor,
      content: { kind: "selection", text: formatInteractiveDisplay(id, ctx.products) },
    };
  }

  // 4) Location
  if (body.startsWith("LOCATION ")) {
    const raw = body.substring("LOCATION ".length).trim();
    const [latStr, lngStr] = raw.split(",").map((p) => p.trim());
    const lat = Number(latStr);
    const lng = Number(lngStr);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      const url = `https://www.google.com/maps?q=${lat},${lng}`;
      return {
        rawId: msg.id,
        conversationId: msg.conversation_id,
        createdAt: msg.created_at,
        status: msg.status ?? null,
        actor: inbound ? "customer" : actor,
        content: { kind: "location", lat, lng, url },
      };
    }
  }

  // 5) Media marker: MEDIA:kind:id
  const mediaMatch = body.match(/^MEDIA:([a-z]+):(.+)$/);
  if (mediaMatch) {
    const mediaKind = mediaMatch[1] as "image" | "video" | "audio" | "document";
    const mediaId = mediaMatch[2];
    if (mediaKind && mediaId) {
      return {
        rawId: msg.id,
        conversationId: msg.conversation_id,
        createdAt: msg.created_at,
        status: msg.status ?? null,
        actor: inbound ? "customer" : actor,
        content: { kind: "media", mediaKind, mediaId },
      };
    }
  }

  // 6) Default text
  return {
    rawId: msg.id,
    conversationId: msg.conversation_id,
    createdAt: msg.created_at,
    status: msg.status ?? null,
    actor: inbound ? "customer" : actor,
    content: { kind: "text", text: body },
  };
}

export function buildThreadItems(input: {
  messages: RawMsg[];
  events?: LocalEvent[];
  products: ProductNameMap;
  resolveOutboundActor?: (m: RawMsg) => UiActor;
}): ThreadItem[] {
  const { messages, events = [], products, resolveOutboundActor } = input;

  const safeMsgs = Array.isArray(messages) ? messages : [];
  const safeEvents = Array.isArray(events) ? events : [];

  // Merge messages + local events into a chronological stream.
  // We never store events in DB here — they are purely UI helpers.
  const stream: Array<
    | { kind: "msg"; createdAt: string; msg: RawMsg }
    | { kind: "evt"; createdAt: string; evt: LocalEvent }
  > = [];

  for (const m of safeMsgs) stream.push({ kind: "msg", createdAt: m.created_at, msg: m });
  for (const e of safeEvents) stream.push({ kind: "evt", createdAt: e.created_at, evt: e });

  stream.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const items: ThreadItem[] = [];
  let lastDay = "";
  let lastActor: UiActor | null = null;

  for (const x of stream) {
    const dayKey = dayKeyFromIso(x.createdAt);

    if (dayKey !== lastDay) {
      lastDay = dayKey;
      const label = labelForDayKey(dayKey);
      items.push({ kind: "day", id: `day-${dayKey}`, label });
      lastActor = null; // reset grouping at day boundary
    }

    if (x.kind === "evt") {
      items.push({
        kind: "event",
        id: x.evt.id,
        createdAt: x.evt.created_at,
        text: x.evt.text,
      });
      continue;
    }

    const ui = normalizeOneMessage(x.msg, { products, resolveOutboundActor });

    // Show a small label only when Bot begins speaking (keeps admins oriented)
    const showBotLabel = ui.actor === "bot" && lastActor !== "bot";

    items.push({
      kind: "message",
      id: `msg-${String(ui.rawId)}`,
      ui,
      showBotLabel,
    });

    lastActor = ui.actor;
  }

  return items;
}
