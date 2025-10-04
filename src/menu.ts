// src/menu.ts
// Menu + product helpers aligned with webhook.ts expectations

export type Product = {
  id: string;
  priceTZS: number;
};

export const PROMAX_PRICE_TZS = 350_000;

// Main products shown in the list menu
export const PRODUCTS: Product[] = [
  // UPDATED names and price
  { id: 'product_kiboko', priceTZS: 140_000 }, // Ujani ya kupaka — Kiboko ya Kibamia
  { id: 'product_furaha', priceTZS: 110_000 }, // Ujani ya kunywa — Furaha ya Ndoa (FIXED)
  // Pro Max (category row) is informational; sub-packages below.
];

// Pro Max sub-packages
export const PROMAX_PACKAGES = [
  { id: 'promax_a' },
  { id: 'promax_b' },
  { id: 'promax_c' },
];

const PROMAX_SET = new Set(['promax_a', 'promax_b', 'promax_c']);

export function isProMaxPackageId(id: string): boolean {
  return PROMAX_SET.has((id || '').toLowerCase());
}

export function formatTZS(amount: number): string {
  return new Intl.NumberFormat('sw-TZ', {
    style: 'currency',
    currency: 'TZS',
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.floor(amount || 0)));
}

// Human titles (keep requested Swahili phrasing in both locales for clarity)
export function productTitle(productId: string, _lang: 'en' | 'sw'): string {
  const id = (productId || '').toLowerCase();
  if (id === 'product_kiboko') return 'Ujani ya kupaka — Kiboko ya Kibamia';
  if (id === 'product_furaha') return 'Ujani ya kunywa — Furaha ya Ndoa';
  if (id === 'product_promax') return 'Ujani Pro Max (A/B/C)';
  return productId;
}

export function productSummary(productId: string, lang: 'en' | 'sw'): string {
  const id = (productId || '').toLowerCase();
  const price = PRODUCTS.find(p => p.id === id)?.priceTZS ?? 0;

  if (id === 'product_kiboko') {
    return (lang === 'en'
      ? `Topical pack *Kiboko ya Kibamia*\nPrice: ${formatTZS(price)}`
      : `Pakiti ya kupaka *Kiboko ya Kibamia*\nBei: ${formatTZS(price)}`);
  }
  if (id === 'product_furaha') {
    return (lang === 'en'
      ? `Oral pack *Furaha ya Ndoa*\nPrice: ${formatTZS(price)}`
      : `Pakiti ya kunywa *Furaha ya Ndoa*\nBei: ${formatTZS(price)}`);
  }
  if (id === 'product_promax') {
    return (lang === 'en'
      ? `Ujani Pro Max — choose package A/B/C. Total ${formatTZS(PROMAX_PRICE_TZS)}.`
      : `Ujani Pro Max — chagua pakiti A/B/C. Bei jumla ${formatTZS(PROMAX_PRICE_TZS)}.`);
  }
  return '';
}

export function promaxPackageTitle(packageId: string, lang: 'en' | 'sw'): string {
  const id = (packageId || '').toLowerCase();
  if (id === 'promax_a') return lang === 'en' ? 'Package A' : 'Pakiti A';
  if (id === 'promax_b') return lang === 'en' ? 'Package B' : 'Pakiti B';
  if (id === 'promax_c') return lang === 'en' ? 'Package C' : 'Pakiti C';
  return packageId;
}

export function promaxPackageSummary(packageId: string, lang: 'en' | 'sw'): string {
  const id = (packageId || '').toLowerCase();
  if (id === 'promax_a') return lang === 'en' ? '3 topical medicines' : 'Dawa 3 za kupaka';
  if (id === 'promax_b') return lang === 'en' ? '3 oral medicines' : 'Dawa 3 za kunywa';
  if (id === 'promax_c') return lang === 'en' ? '2 topical + 2 oral' : '2 za kupaka + 2 za kunywa';
  return '';
}
