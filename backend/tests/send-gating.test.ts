import assert from "node:assert/strict";
import test from "node:test";

import {
  FREE_REPLY_WINDOW_MS,
  getFreeReplyWindowState,
  parseWhatsAppApiError,
} from "../src/routes/send.ts";

test("getFreeReplyWindowState allows sends inside the free reply window", () => {
  const now = Date.UTC(2026, 2, 26, 12, 0, 0);
  const lastInboundAt = new Date(now - 60 * 60 * 1000).toISOString();
  const state = getFreeReplyWindowState(lastInboundAt, now);

  assert.equal(state.allowed, true);
  assert.equal(state.state, "free_reply_open");
  assert.equal(state.remainingMs, FREE_REPLY_WINDOW_MS - 60 * 60 * 1000);
});

test("getFreeReplyWindowState blocks sends after the free reply window closes", () => {
  const now = Date.UTC(2026, 2, 26, 12, 0, 0);
  const lastInboundAt = new Date(now - FREE_REPLY_WINDOW_MS - 5 * 60 * 1000).toISOString();
  const state = getFreeReplyWindowState(lastInboundAt, now);

  assert.equal(state.allowed, false);
  assert.equal(state.state, "template_required");
  assert.equal(state.remainingMs, 0);
});

test("parseWhatsAppApiError extracts structured failure metadata", () => {
  const err = new Error(
    'WhatsApp API error 400: {"error":{"code":131047,"title":"Re-engagement message","error_data":{"details":"More than 24 hours have passed since the customer last replied."}}}'
  );

  const parsed = parseWhatsAppApiError(err);

  assert.equal(parsed.code, "131047");
  assert.equal(parsed.title, "Re-engagement message");
  assert.match(parsed.details ?? "", /24 hours/);
});
