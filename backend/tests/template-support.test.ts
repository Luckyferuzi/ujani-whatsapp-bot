import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTemplatePreview,
  buildTemplateSuggestionCategory,
  classifyTemplateProviderError,
  validateTemplateParams,
} from "../src/routes/send.ts";
import {
  DEFAULT_INBOX_TEMPLATES,
  isInboxTemplateMapped,
  normalizeInboxTemplateRegistry,
} from "../src/runtime/companySettings.ts";
import { resolveInboxTemplateReadiness } from "../src/runtime/inboxTemplateReadiness.ts";

test("validateTemplateParams reports missing required template fields", () => {
  const template = DEFAULT_INBOX_TEMPLATES.find((item) => item.key === "payment_reminder_sw");
  assert.ok(template);

  const result = validateTemplateParams(template.params, {
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

test("default template registry does not pretend internal keys are Meta template names", () => {
  const template = DEFAULT_INBOX_TEMPLATES.find((item) => item.key === "payment_reminder_sw");
  assert.ok(template);
  assert.equal(template.metaTemplateName, null);
  assert.equal(isInboxTemplateMapped(template), false);
});

test("classifyTemplateProviderError marks language translation failures clearly", () => {
  const classified = classifyTemplateProviderError({
    code: "132001",
    title: "Template translation missing",
    details: "The template name exists but no translation was found for the requested language.",
  });

  assert.equal(classified.status, 409);
  assert.equal(classified.code, "template_language_unavailable");
});

test("classifyTemplateProviderError marks missing template names clearly", () => {
  const classified = classifyTemplateProviderError({
    code: "132001",
    title: "Template not found",
    details: "No template named payment_reminder_live exists in the business account.",
  });

  assert.equal(classified.status, 409);
  assert.equal(classified.code, "template_not_available");
});

test("resolveInboxTemplateReadiness marks unmapped defaults as not configured", () => {
  const template = DEFAULT_INBOX_TEMPLATES.find((item) => item.key === "payment_reminder_sw");
  assert.ok(template);

  const readiness = resolveInboxTemplateReadiness(template);

  assert.equal(readiness.can_send, false);
  assert.equal(readiness.status, "unmapped");
  assert.equal(readiness.reason_code, "template_config_missing");
});

test("resolveInboxTemplateReadiness marks fully mapped template as ready", () => {
  const readiness = resolveInboxTemplateReadiness({
    ...DEFAULT_INBOX_TEMPLATES[0],
    metaTemplateName: "payment_reminder_live",
    languageCode: "sw",
  });

  assert.equal(readiness.can_send, true);
  assert.equal(readiness.status, "ready");
  assert.equal(readiness.meta_template_name, "payment_reminder_live");
});

test("normalizeInboxTemplateRegistry backfills operational metadata for legacy records", () => {
  const [normalized] = normalizeInboxTemplateRegistry([
    {
      key: "payment_reminder_sw",
      metaTemplateName: "payment_reminder_live",
      languageCode: "sw",
      category: "payment_reminder",
      enabled: true,
      params: DEFAULT_INBOX_TEMPLATES[0]?.params ?? [],
    },
  ]);

  assert.equal(normalized.displayName, "Payment reminder");
  assert.equal(normalized.description?.length ? true : false, true);
  assert.deepEqual(normalized.allowedLanguages, ["sw"]);
  assert.equal(normalized.deprecated, false);
  assert.equal(normalized.sortOrder, 10);
});

test("resolveInboxTemplateReadiness flags disallowed configured languages", () => {
  const readiness = resolveInboxTemplateReadiness({
    ...DEFAULT_INBOX_TEMPLATES[0],
    metaTemplateName: "payment_reminder_live",
    languageCode: "en",
    allowedLanguages: ["sw"],
  });

  assert.equal(readiness.can_send, false);
  assert.equal(readiness.status, "invalid");
  assert.equal(readiness.reason_code, "template_language_not_allowed");
  assert.deepEqual(readiness.blockers, ["template_language_not_allowed"]);
});
