import test from "node:test";
import assert from "node:assert/strict";

import {
  extractInteractiveSelection,
  isGreetingMenuTrigger,
} from "../src/services/chat/webhookProcessor.ts";

test("extractInteractiveSelection returns list reply id and title", () => {
  const out = extractInteractiveSelection({
    type: "interactive",
    interactive: {
      type: "list_reply",
      list_reply: {
        id: "ACTION_CHECKOUT",
        title: "Checkout",
      },
    },
  });

  assert.deepEqual(out, { id: "ACTION_CHECKOUT", title: "Checkout" });
});

test("extractInteractiveSelection returns button reply id and title", () => {
  const out = extractInteractiveSelection({
    type: "interactive",
    interactive: {
      type: "button_reply",
      button_reply: {
        id: "ACTION_BACK",
        title: "Back",
      },
    },
  });

  assert.deepEqual(out, { id: "ACTION_BACK", title: "Back" });
});

test("isGreetingMenuTrigger only fires for idle conversations without active flow", () => {
  assert.equal(isGreetingMenuTrigger("menu", "IDLE", null), true);
  assert.equal(isGreetingMenuTrigger(undefined, "IDLE", null), true);
  assert.equal(isGreetingMenuTrigger("hello", "WAIT_PROOF", null), false);
  assert.equal(isGreetingMenuTrigger("hello", "IDLE", "ASK_GPS"), false);
});
