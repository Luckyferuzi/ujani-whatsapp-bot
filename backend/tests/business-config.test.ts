import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_COMPANY_SETTINGS,
  getBusinessTextOverride,
  getConfiguredPaymentMethods,
  resolveLocalizedBusinessText,
  type CompanySettings,
} from "../src/runtime/companySettings.ts";

test("resolveLocalizedBusinessText prefers requested language and falls back safely", () => {
  assert.equal(
    resolveLocalizedBusinessText({ sw: "Habari", en: "Hello" }, "sw", "fallback"),
    "Habari"
  );
  assert.equal(
    resolveLocalizedBusinessText({ en: "Hello" }, "sw", "fallback"),
    "Hello"
  );
  assert.equal(resolveLocalizedBusinessText({}, "en", "fallback"), "fallback");
});

test("getConfiguredPaymentMethods prefers company settings over env fallback", () => {
  const settings: CompanySettings = {
    ...DEFAULT_COMPANY_SETTINGS,
    business_content: {
      ...DEFAULT_COMPANY_SETTINGS.business_content,
      payment_methods: [
        { id: "PAY_CUSTOM", label: "M-Pesa", value: "255700123456 • Demo Shop" },
      ],
      text_overrides: {},
    },
  };

  const methods = getConfiguredPaymentMethods(settings, {
    LIPA_NAMBA_TILL: "111222",
  } as NodeJS.ProcessEnv);

  assert.deepEqual(methods, [
    { id: "PAY_CUSTOM", label: "M-Pesa", value: "255700123456 • Demo Shop" },
  ]);
});

test("business text overrides can replace selected branded copy", () => {
  const settings: CompanySettings = {
    ...DEFAULT_COMPANY_SETTINGS,
    business_content: {
      ...DEFAULT_COMPANY_SETTINGS.business_content,
      text_overrides: {
        "faq.intro": {
          sw: "Maswali ya kawaida kuhusu biashara yetu.",
        },
      },
    },
  };

  assert.equal(
    getBusinessTextOverride("faq.intro", "sw", settings),
    "Maswali ya kawaida kuhusu biashara yetu."
  );
});
