import test from "node:test";
import assert from "node:assert/strict";

process.env.BASE_LAT = process.env.BASE_LAT || "-6.8394";
process.env.BASE_LNG = process.env.BASE_LNG || "39.2744";
process.env.DELIVERY_RATE_PER_KM = "1000";
process.env.DELIVERY_ROUND_TO = "500";
process.env.SERVICE_RADIUS_KM = "12";
process.env.LIPA_NAMBA_TILL = "111222";
process.env.VODA_LNM_TILL = "333444";
process.env.VODA_P2P_MSISDN = "255700000000";

const { buildPaymentMessage } = await import("../src/payments.ts");
const { feeForDarDistance, isOutsideServiceRadius } = await import("../src/delivery.ts");

test("feeForDarDistance rounds by configured step and enforces a minimum non-zero fee", () => {
  assert.equal(feeForDarDistance(0), 0);
  assert.equal(feeForDarDistance(0.1), 500);
  assert.equal(feeForDarDistance(1.6), 1500);
  assert.equal(feeForDarDistance(2.8), 3000);
});

test("isOutsideServiceRadius respects the configured service radius", () => {
  assert.equal(isOutsideServiceRadius(11.9), false);
  assert.equal(isOutsideServiceRadius(12), false);
  assert.equal(isOutsideServiceRadius(12.1), true);
});

test("buildPaymentMessage includes configured payment rails and proof instructions", () => {
  const message = buildPaymentMessage(45600);

  assert.match(message, /45,600/);
  assert.match(message, /MIXXBYYAS LIPANAMB/);
  assert.match(message, /VODALIPANMBA/);
  assert.match(message, /Voda P2P/);
  assert.match(message, /screenshot/i);
});
