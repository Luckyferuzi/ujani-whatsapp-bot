import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_BUTTON_TITLE,
  MAX_LIST_ROWS,
  MAX_LIST_TITLE,
  normalizeButtons,
  normalizeListPayload,
  splitLongText,
} from "../src/utils/messageSafety.ts";
import { isValidManualPaymentProofText } from "../src/utils/proofValidation.ts";

test("splitLongText keeps each chunk under the configured limit", () => {
  const input = Array.from({ length: 60 }, (_, i) => `Segment ${i}`).join(" ");
  const chunks = splitLongText(input, 40);

  assert.equal(chunks.length > 1, true);
  assert.equal(chunks.every((chunk) => chunk.length <= 40), true);
});

test("normalizeListPayload enforces WhatsApp row and title limits", () => {
  const rows = Array.from({ length: 14 }, (_, i) => ({
    id: `row-${i}`,
    title: `Very Long Product Title ${i} - Special Offer Section`,
    description: `Description ${i}`.repeat(8),
  }));

  const normalized = normalizeListPayload({
    to: "255700000000",
    body: "Choose a product",
    buttonText: "Open the product chooser right now",
    sections: [{ title: "Extremely long section title for test coverage", rows }],
  });

  const totalRows = normalized.sections.reduce((sum, section) => sum + section.rows.length, 0);

  assert.equal(totalRows, MAX_LIST_ROWS);
  assert.equal(
    normalized.sections.every((section) =>
      section.rows.every((row) => row.title.length <= MAX_LIST_TITLE)
    ),
    true
  );
});

test("normalizeButtons limits interactive button count and titles", () => {
  const normalized = normalizeButtons([
    { id: "1", title: "First button title that is too long" },
    { id: "2", title: "Second button title that is too long" },
    { id: "3", title: "Third button title that is too long" },
    { id: "4", title: "Fourth button should be dropped" },
  ]);

  assert.equal(normalized.length, 3);
  assert.equal(normalized.every((button) => button.title.length <= MAX_BUTTON_TITLE), true);
});

test("payment proof text validator only accepts two or three names", () => {
  assert.equal(isValidManualPaymentProofText("John"), false);
  assert.equal(isValidManualPaymentProofText("John Doe"), true);
  assert.equal(isValidManualPaymentProofText("John Michael Doe"), true);
  assert.equal(isValidManualPaymentProofText("John Michael Extra Doe"), false);
});
