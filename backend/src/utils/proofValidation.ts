export function isValidManualPaymentProofText(input: string): boolean {
  const words = String(input ?? "")
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  return words.length >= 2 && words.length <= 3;
}
