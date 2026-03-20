import test from "node:test";
import assert from "node:assert/strict";

import {
  createSessionStore,
  DEFAULT_SESSION,
  type ChatSessionRepo,
  type ChatSessionRow,
} from "../src/session.ts";

function createFakeRepo(seed?: Map<string, ChatSessionRow>): ChatSessionRepo {
  const rows = seed ?? new Map<string, ChatSessionRow>();

  return {
    async get(waId) {
      return rows.get(waId) ?? null;
    },
    async upsert({ waId, payload, expiresAt }) {
      rows.set(waId, {
        wa_id: waId,
        payload: JSON.parse(JSON.stringify(payload)),
        expires_at: expiresAt.toISOString(),
      });
    },
    async delete(waId) {
      rows.delete(waId);
    },
    async clearExpired(before) {
      let count = 0;
      for (const [key, row] of rows.entries()) {
        const expiry = new Date(String(row.expires_at));
        if (!Number.isNaN(expiry.getTime()) && expiry.getTime() <= before.getTime()) {
          rows.delete(key);
          count += 1;
        }
      }
      return count;
    },
  };
}

test("session survives store recreation when backed by the same repo", async () => {
  const rows = new Map<string, ChatSessionRow>();
  const storeA = createSessionStore(createFakeRepo(rows));
  const storeB = createSessionStore(createFakeRepo(rows));

  await storeA.saveSession("255700000001", {
    ...DEFAULT_SESSION,
    lang: "en",
    state: "WAIT_PROOF",
    flow: "ASK_GPS",
    cart: [{ sku: "SKU-1", name: "Product 1", qty: 2, unitPrice: 10000 }],
    contact: { name: "Jane", phone: "255700000001" },
    price: 23000,
    lastOrderId: 44,
  });

  const restored = await storeB.loadSession("255700000001");

  assert.equal(restored.lang, "en");
  assert.equal(restored.state, "WAIT_PROOF");
  assert.equal(restored.flow, "ASK_GPS");
  assert.equal(restored.cart.length, 1);
  assert.equal(restored.contact.name, "Jane");
  assert.equal(restored.lastOrderId, 44);
});

test("expired sessions fall back safely to defaults", async () => {
  const rows = new Map<string, ChatSessionRow>([
    [
      "255700000002",
      {
        wa_id: "255700000002",
        payload: {
          ...DEFAULT_SESSION,
          state: "WAIT_PROOF",
          flow: "ASK_REGION_OUT",
          cart: [{ sku: "SKU-2", name: "Product 2", qty: 1, unitPrice: 5000 }],
        },
        expires_at: "2000-01-01T00:00:00.000Z",
      },
    ],
  ]);

  const store = createSessionStore(createFakeRepo(rows));
  const loaded = await store.loadSession("255700000002");

  assert.deepEqual(loaded, DEFAULT_SESSION);
  assert.equal(rows.has("255700000002"), false);
});

test("resetSession clears temporary flow state but preserves language preference", async () => {
  const rows = new Map<string, ChatSessionRow>();
  const store = createSessionStore(createFakeRepo(rows));

  await store.saveSession("255700000003", {
    ...DEFAULT_SESSION,
    lang: "en",
    state: "WAIT_PROOF",
    flow: "ASK_GPS",
    cart: [{ sku: "SKU-3", name: "Product 3", qty: 1, unitPrice: 12000 }],
    pending: { sku: "SKU-3", name: "Product 3", qty: 1, unitPrice: 12000 },
    contact: { name: "Alex", phone: "255700000003" },
    price: 15000,
  });

  const reset = await store.resetSession("255700000003");

  assert.equal(reset.lang, "en");
  assert.equal(reset.state, "IDLE");
  assert.equal(reset.flow, null);
  assert.deepEqual(reset.cart, []);
  assert.equal(reset.pending, null);
  assert.deepEqual(reset.contact, {});
});

test("clearExpiredSessions removes only expired rows", async () => {
  const rows = new Map<string, ChatSessionRow>([
    [
      "expired",
      {
        wa_id: "expired",
        payload: DEFAULT_SESSION,
        expires_at: "2000-01-01T00:00:00.000Z",
      },
    ],
    [
      "fresh",
      {
        wa_id: "fresh",
        payload: { ...DEFAULT_SESSION, lang: "en" },
        expires_at: "2999-01-01T00:00:00.000Z",
      },
    ],
  ]);

  const store = createSessionStore(createFakeRepo(rows));
  const cleared = await store.clearExpiredSessions();

  assert.equal(cleared, 1);
  assert.equal(rows.has("expired"), false);
  assert.equal(rows.has("fresh"), true);
});
