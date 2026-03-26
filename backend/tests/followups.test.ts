import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBroadcastAudienceFilterLabel,
  describeOrderActionReason,
  describeRestockFollowupReason,
  isUnpaidOrderCandidate,
} from "../src/services/followups.ts";

test("isUnpaidOrderCandidate detects remaining balances", () => {
  assert.equal(isUnpaidOrderCandidate({ total_tzs: 30000, paid_amount: 10000 }), true);
  assert.equal(isUnpaidOrderCandidate({ total_tzs: 30000, paid_amount: 30000 }), false);
});

test("describeOrderActionReason maps queue reasons by status", () => {
  assert.match(describeOrderActionReason("pending"), /pending/i);
  assert.match(describeOrderActionReason("preparing"), /preparing/i);
  assert.match(describeOrderActionReason("out_for_delivery"), /delivery/i);
});

test("describeRestockFollowupReason distinguishes in-stock from re-engagement", () => {
  assert.match(describeRestockFollowupReason(4), /back in stock/i);
  assert.match(describeRestockFollowupReason(0), /re-engagement/i);
});

test("buildBroadcastAudienceFilterLabel provides operator-friendly names", () => {
  assert.equal(buildBroadcastAudienceFilterLabel("marketing_eligible"), "Marketing eligible");
  assert.equal(buildBroadcastAudienceFilterLabel("all_previous_chatters"), "All previous chatters");
});
