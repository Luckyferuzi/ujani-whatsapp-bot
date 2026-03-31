import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCatalogLookupCandidates,
  buildMultiProductMessagePayload,
  buildSingleProductMessagePayload,
} from "../src/whatsapp.ts";

test("buildSingleProductMessagePayload uses catalog product interactive shape", () => {
  const payload = buildSingleProductMessagePayload({
    to: "255700000001",
    body: "Take a look at this product",
    catalogId: "catalog-123",
    retailerId: "SKU-001",
  }) as any;

  assert.equal(payload.type, "interactive");
  assert.equal(payload.interactive?.type, "product");
  assert.equal(payload.interactive?.action?.catalog_id, "catalog-123");
  assert.equal(payload.interactive?.action?.product_retailer_id, "SKU-001");
});

test("buildMultiProductMessagePayload groups retailer ids into product list sections", () => {
  const payload = buildMultiProductMessagePayload({
    to: "255700000001",
    header: "Recommended products",
    body: "Choose any of these options",
    footer: "Reply here if you want help",
    catalogId: "catalog-123",
    sections: [
      {
        title: "Popular",
        retailerIds: ["SKU-001", "SKU-002"],
      },
    ],
  }) as any;

  assert.equal(payload.type, "interactive");
  assert.equal(payload.interactive?.type, "product_list");
  assert.equal(payload.interactive?.action?.catalog_id, "catalog-123");
  assert.deepEqual(payload.interactive?.action?.sections?.[0]?.product_items, [
    { product_retailer_id: "SKU-001" },
    { product_retailer_id: "SKU-002" },
  ]);
});

test("buildCatalogLookupCandidates prefers unique configured and phone-derived WABA ids", () => {
  const candidates = buildCatalogLookupCandidates({
    requestedWabaId: "waba-requested",
    configuredWabaId: "waba-requested",
    phoneDerivedWabaId: "waba-derived",
  });

  assert.deepEqual(candidates, ["waba-requested", "waba-derived"]);
});
