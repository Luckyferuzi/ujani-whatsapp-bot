import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWebhookStatusUpdate } from "../src/routes/webhook.ts";

test("normalizeWebhookStatusUpdate maps delivered and read states cleanly", () => {
  const delivered = normalizeWebhookStatusUpdate({
    id: "wamid.delivered",
    status: "delivered",
    conversation: {
      origin: {
        type: "user_initiated",
      },
    },
  });

  const read = normalizeWebhookStatusUpdate({
    id: "wamid.read",
    status: "read",
  });

  assert.equal(delivered.waMessageId, "wamid.delivered");
  assert.equal(delivered.status, "delivered");
  assert.equal(delivered.statusReason, "user_initiated");
  assert.equal(read.status, "read");
});

test("normalizeWebhookStatusUpdate preserves failure metadata from WhatsApp errors", () => {
  const failed = normalizeWebhookStatusUpdate({
    id: "wamid.failed",
    status: "failed",
    errors: [
      {
        code: 131047,
        title: "Re-engagement message",
        error_data: {
          details: "More than 24 hours have passed since the customer last replied.",
        },
      },
    ],
  });

  assert.equal(failed.waMessageId, "wamid.failed");
  assert.equal(failed.status, "failed");
  assert.equal(failed.errorCode, "131047");
  assert.equal(failed.errorTitle, "Re-engagement message");
  assert.match(failed.errorDetails ?? "", /24 hours/);
});
