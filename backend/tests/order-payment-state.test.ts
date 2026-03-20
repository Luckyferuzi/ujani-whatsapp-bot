import test from "node:test";
import assert from "node:assert/strict";

import {
  canTransitionOrderStatus,
  assertOrderStatusTransition,
} from "../src/orders.ts";
import {
  accumulatePaymentAmount,
  assertPaymentStatusTransition,
  canTransitionPaymentStatus,
  computeRemainingPayment,
} from "../src/payments.ts";

test("order status transition helper allows only expected business transitions", () => {
  assert.equal(canTransitionOrderStatus("pending", "verifying"), true);
  assert.equal(canTransitionOrderStatus("preparing", "out_for_delivery"), true);
  assert.equal(canTransitionOrderStatus("delivered", "pending"), false);
  assert.throws(() => assertOrderStatusTransition("cancelled", "pending"));
});

test("payment status transition helper protects terminal paid state", () => {
  assert.equal(canTransitionPaymentStatus("awaiting", "verifying"), true);
  assert.equal(canTransitionPaymentStatus("verifying", "paid"), true);
  assert.equal(canTransitionPaymentStatus("paid", "failed"), false);
  assert.throws(() => assertPaymentStatusTransition("paid", "failed"));
});

test("payment amount helpers accumulate installments and clamp remaining balance", () => {
  assert.equal(accumulatePaymentAmount(12000, 5000), 17000);
  assert.equal(computeRemainingPayment(30000, 12000), 18000);
  assert.equal(computeRemainingPayment(30000, 50000), 0);
});
