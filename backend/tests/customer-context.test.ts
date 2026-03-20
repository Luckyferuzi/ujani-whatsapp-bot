import test from "node:test";
import assert from "node:assert/strict";

import { buildConversationLifecycleTimeline } from "../src/customerContext.ts";
import { normalizeInternalNoteBody } from "../src/db/queries.ts";

test("conversation timeline marks resumed chats after long inactivity gaps", () => {
  const items = buildConversationLifecycleTimeline({
    conversationId: 15,
    customerId: 7,
    createdAt: "2026-03-20T08:00:00.000Z",
    messages: [
      {
        id: 1,
        direction: "inbound",
        type: "text",
        body: "Habari",
        created_at: "2026-03-20T08:01:00.000Z",
      },
      {
        id: 2,
        direction: "out",
        type: "text",
        body: "Karibu",
        created_at: "2026-03-20T08:03:00.000Z",
      },
      {
        id: 3,
        direction: "inbound",
        type: "text",
        body: "Natumia uthibitisho wa malipo",
        created_at: "2026-03-20T16:30:00.000Z",
      },
    ],
  });

  assert.equal(items[0]?.event_type, "conversation.started");
  assert.equal(items.some((item) => item.event_type === "conversation.resumed"), true);
});

test("conversation timeline does not add resumed event for short gaps", () => {
  const items = buildConversationLifecycleTimeline({
    conversationId: 22,
    createdAt: "2026-03-20T08:00:00.000Z",
    messages: [
      {
        id: 1,
        direction: "inbound",
        type: "text",
        body: "Hello",
        created_at: "2026-03-20T08:05:00.000Z",
      },
      {
        id: 2,
        direction: "inbound",
        type: "text",
        body: "Still here",
        created_at: "2026-03-20T10:00:00.000Z",
      },
    ],
  });

  assert.equal(items.filter((item) => item.event_type === "conversation.resumed").length, 0);
});

test("internal note normalization trims and collapses whitespace", () => {
  assert.equal(
    normalizeInternalNoteBody("  Payment proof checked   by   Amina \n\n awaiting rider "),
    "Payment proof checked by Amina awaiting rider"
  );
});
