import assert from "node:assert/strict";
import test from "node:test";

import { serializeJsonSettingValue } from "../src/db/settings.ts";

test("serializeJsonSettingValue preserves top-level arrays as valid JSON text", () => {
  const serialized = serializeJsonSettingValue([
    {
      key: "payment_reminder_sw",
      metaTemplateName: "payment_reminder_live",
      languageCode: "sw",
      category: "payment_reminder",
      displayName: "Payment reminder",
      description: "Reminder copy",
      enabled: true,
      allowedLanguages: ["sw"],
      deprecated: false,
      sortOrder: 10,
      params: [
        {
          key: "amount_due",
          label: "Amount due",
          required: true,
        },
      ],
    },
  ]);

  assert.equal(typeof serialized, "string");
  const parsed = JSON.parse(serialized);
  assert.equal(Array.isArray(parsed), true);
  assert.equal(parsed[0]?.params?.[0]?.label, "Amount due");
  assert.equal(parsed[0]?.params?.[0]?.required, true);
});
