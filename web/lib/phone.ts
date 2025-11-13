// web/lib/phone.ts
export function formatPhonePretty(raw?: string) {
  if (!raw) return "—";
  // Normalize: keep leading + and digits
  const digits = raw.replace(/[^\d+]/g, "");
  // Simple TZ style grouping if it looks like +255XXXXXXXXX
  if (digits.startsWith("+255") && digits.length >= 10) {
    const body = digits.slice(4); // after +255
    // 3-3-3 style: 7xx xxx xxx or 6xx xxx xxx
    return `+255 ${body.slice(0, 3)} ${body.slice(3, 6)} ${body.slice(6)}`;
  }
  // Generic +CC groupings (fallback)
  if (digits.startsWith("+") && digits.length > 7) {
    return digits.replace(/(\+\d{1,3})(\d{3})(\d{3})(\d+)/, "$1 $2 $3 $4");
  }
  // Local fallback: 0xx xxx xxx
  if (digits.length === 10 && digits.startsWith("0")) {
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  }
  return digits;
}

export function telHref(raw?: string) {
  if (!raw) return "#";
  const digits = raw.replace(/[^\d+]/g, "");
  return `tel:${digits}`;
}
