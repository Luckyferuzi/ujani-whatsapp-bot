import test from "node:test";
import assert from "node:assert/strict";

import {
  addOrder,
  computeSubtotal,
  computeTotal,
  getMostRecentOrderByName,
  listOrdersByName,
  setOrderProof,
} from "../src/orders.ts";

test("computeSubtotal and computeTotal include delivery fee for delivery orders", () => {
  const order = addOrder({
    customerName: "Subtotal Customer",
    phone: "255700000001",
    items: [
      { sku: "SKU-1", name: "Product 1", qty: 2, unitPrice: 10000 },
      { sku: "SKU-2", name: "Product 2", qty: 1, unitPrice: 5000 },
    ],
    delivery: {
      mode: "dar",
      district: "GPS",
      place: "Keko",
      km: 5,
      deliveryFee: 3000,
    },
  });

  assert.equal(computeSubtotal(order.items), 25000);
  assert.equal(computeTotal(order), 28000);
});

test("setOrderProof marks order as paid without mutating item totals", () => {
  const order = addOrder({
    customerName: "Proof Customer",
    items: [{ sku: "SKU-3", name: "Product 3", qty: 1, unitPrice: 15000 }],
    delivery: { mode: "pickup" },
  });

  setOrderProof(order, {
    type: "text",
    text: "John Doe",
    receivedAt: "2026-03-20T00:00:00.000Z",
  });

  assert.equal(order.status, "Paid");
  assert.equal(order.proof?.type, "text");
  assert.equal(computeTotal(order), 15000);
});

test("listOrdersByName returns newest order first", () => {
  const name = "Repeated Buyer";

  addOrder({
    customerName: name,
    items: [{ sku: "SKU-A", name: "Product A", qty: 1, unitPrice: 1000 }],
    delivery: { mode: "pickup" },
  });

  const newest = addOrder({
    customerName: name,
    items: [{ sku: "SKU-B", name: "Product B", qty: 1, unitPrice: 2000 }],
    delivery: { mode: "outside", region: "Morogoro", transportMode: "bus", deliveryFee: 5000 },
  });

  const matches = listOrdersByName(name);
  assert.equal(matches.length >= 2, true);
  assert.equal(matches[0]?.id, newest.id);
  assert.equal(getMostRecentOrderByName(name)?.id, newest.id);
});
