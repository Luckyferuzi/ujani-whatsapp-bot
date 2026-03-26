import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTemplatePreview,
  buildTemplateSuggestionCategory,
  validateTemplateParams,
} from "../src/routes/send.ts";
import { DEFAULT_INBOX_TEMPLATES } from "../src/runtime/companySettings.ts";

test("validateTemplateParams reports missing required template fields", () => {
  const template = DEFAULT_INBOX_TEMPLATES.find((item) => item.key === "payment_reminder_sw");
  assert.ok(template);

  const result = validateTemplateParams(template.parameter_meta, {
    customer_name: "Amina",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ["order_code", "amount_due"]);
});

test("buildTemplatePreview produces readable payment reminder summaries", () => {
  const template = DEFAULT_INBOX_TEMPLATES.find((item) => item.key === "payment_reminder_sw");
  assert.ok(template);

  const preview = buildTemplatePreview(template, {
    customer_name: "Amina",
    order_code: "UJ-102",
    amount_due: "12,000 TZS",
  });

  assert.match(preview, /Amina/);
  assert.match(preview, /UJ-102/);
  assert.match(preview, /12,000 TZS/);
});

test("buildTemplateSuggestionCategory prioritizes unpaid order reminders first", () => {
  const category = buildTemplateSuggestionCategory({
    latestOrder: {
      status: "pending",
      totalTzs: 30000,
      paidAmount: 10000,
      paymentStatus: "awaiting",
    },
    restockItems: ["Neem Oil"],
  });

  assert.equal(category, "payment_reminder");
});
