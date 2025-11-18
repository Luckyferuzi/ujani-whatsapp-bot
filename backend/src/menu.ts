// src/menu.ts
// Product catalog + menu builders (aligned to original flow & i18n keys)

function formatTZS(amount: number): string {
  return `${Math.round(amount).toLocaleString('sw-TZ')} TZS`;
}

// Action IDs are referenced by the webhook; keep them stable.
export type ActionId =
  | 'ACTION_VIEW_CART'
  | 'ACTION_CHECKOUT'
  | 'ACTION_TRACK_BY_NAME'
  | 'ACTION_TALK_TO_AGENT'
  | 'ACTION_CHANGE_LANGUAGE'
  | 'ACTION_BACK'
  | 'ACTION_FAQ'
  | `PRODUCT_${string}`
  | `BUY_${string}`
  | `ADD_${string}`
  | `DETAILS_${string}`
  | `VARIANTS_${string}`;

export type Product = {
  sku: string;
  name: string;
  price: number;
  short?: string;         // short subtitle in product list
  children?: Product[];   // variants (e.g., Pro Max A/B/C)
};

/**
 * Catalog (from your ZIP):
 * - Kiboko: 140,000 TZS
 * - Furaha ya Ndoa: 110,000 TZS
 * - Ujani Pro Max (and A/B/C variants): 350,000 TZS
 */
export const PRODUCTS: Product[] = [
  {
    sku: 'KIBOKO',
    name: 'Ujani Kiboko',
    price: 140_000,
    short: 'Kiboko — ' + formatTZS(140_000),
  },
  {
    sku: 'FURAHA',
    name: 'Furaha ya Ndoa',
    price: 110_000,
    short: 'Furaha ya Ndoa — ' + formatTZS(110_000),
  },
  {
    sku: 'PROMAX',
    name: 'Ujani Pro Max',
    price: 350_000,
    short: 'Pro Max — ' + formatTZS(350_000),
    children: [
      {
        sku: 'PROMAX_A',
        name: 'Pro Max — A',
        price: 350_000,
        short: 'Pro Max A — ' + formatTZS(350_000),
      },
      {
        sku: 'PROMAX_B',
        name: 'Pro Max — B',
        price: 350_000,
        short: 'Pro Max B — ' + formatTZS(350_000),
      },
      {
        sku: 'PROMAX_C',
        name: 'Pro Max — C',
        price: 350_000,
        short: 'Pro Max C — ' + formatTZS(350_000),
      },
    ],
  },
];

// -------- Catalog helpers --------

export function getProductBySku(sku: string): Product | undefined {
  for (const p of PRODUCTS) {
    if (p.sku === sku) return p;
    if (p.children) {
      const c = p.children.find(ch => ch.sku === sku);
      if (c) return c;
    }
  }
  return undefined;
}

export function getTopLevelProducts(): Product[] {
  return PRODUCTS;
}

/**
 * For flows where a variant tap should still display/price using the parent
 * product (e.g., summary lines), map PROMAX_* back to PROMAX.
 */
export function resolveProductForSku(sku: string): Product | undefined {
  if (sku?.startsWith('PROMAX_')) return getProductBySku('PROMAX');
  return getProductBySku(sku);
}

// -------- Menu model used by webhook.ts → sendListMessage --------

export type MenuRow = { id: ActionId; title: string; subtitle?: string };
export type MenuSection = { title: string; rows: MenuRow[] };
export type MenuModel = {
  header: string;
  footer?: string;
  sections: MenuSection[];
};

/**
 * Main menu:
 * - Products (each row: PRODUCT_<SKU>)
 * - Actions (view cart, checkout, track, agent, language)
 *
 * i18n keys expected (already present in your i18n.ts):
 *  - menu.header
 *  - menu.footer
 *  - menu.products_section
 *  - menu.actions_section
 *  - menu.view_cart
 *  - menu.checkout
 *  - menu.track_by_name
 *  - menu.talk_to_agent
 *  - menu.change_language
 *  - menu.back_to_menu  (used elsewhere)
 */
export function buildMainMenu(t: (key: string) => string): MenuModel {
  return {
    header: t('menu.header'),
    footer: t('menu.footer'),
    sections: [
      {
        title: t('menu.products_section'),
        rows: getTopLevelProducts().map(p => ({
          id: `PRODUCT_${p.sku}`,
          title: `${p.name} — ${formatTZS(p.price)}`,
          subtitle: p.short || undefined,
        })),
      },
      {
        title: t('menu.actions_section'),
        rows: [
          { id: 'ACTION_VIEW_CART',      title: t('menu.view_cart') },
          { id: 'ACTION_CHECKOUT',       title: t('menu.checkout') },
          { id: 'ACTION_TRACK_BY_NAME',  title: t('menu.track_by_name') },
          { id: 'ACTION_FAQ',            title: t('menu.faq') },
          { id: 'ACTION_TALK_TO_AGENT',  title: t('menu.talk_to_agent') },
          { id: 'ACTION_CHANGE_LANGUAGE',title: t('menu.change_language') },
        ],
      },
    ],
  };
}

/**
 * Product action menu for a single product:
 * - BUY_<SKU>, ADD_<SKU>, DETAILS_<SKU>, plus view cart / checkout / back
 *
 * Also shows a "choose variant" row when the product has children.
 *
 * i18n keys used:
 *  - menu.buy_now
 *  - menu.add_to_cart
 *  - menu.more_details
 *  - menu.view_cart
 *  - menu.checkout
 *  - menu.back_to_menu
 *  - menu.choose_variant
 */
export function buildProductMenu(t: (key: string) => string, product: Product): MenuModel {
  const rows: MenuRow[] = [
    { id: `BUY_${product.sku}`,      title: t('menu.buy_now') },
    { id: `ADD_${product.sku}`,      title: t('menu.add_to_cart') },
    { id: `DETAILS_${product.sku}`,  title: t('menu.more_details') },
    { id: 'ACTION_VIEW_CART',        title: t('menu.view_cart') },
    { id: 'ACTION_CHECKOUT',         title: t('menu.checkout') },
    { id: 'ACTION_BACK',             title: t('menu.back_to_menu') },
  ];

  if (product.children?.length) {
    rows.unshift({ id: `VARIANTS_${product.sku}`, title: t('menu.choose_variant') });
  }

  return {
    header: `${product.name} — ${formatTZS(product.price)}`,
    footer: t('menu.footer'),
    sections: [{ title: t('menu.actions_section'), rows }],
  };
}

/**
 * Variant selector for a parent with children (e.g., Pro Max A/B/C).
 *
 * i18n keys used:
 *  - menu.choose_variant
 */
export function buildVariantMenu(t: (key: string) => string, parent: Product): MenuModel {
  const variants = parent.children ?? [];
  return {
    header: `${parent.name}`,
    footer: t('menu.footer'),
    sections: [
      {
        title: t('menu.choose_variant'),
        rows: variants.map(v => ({
          id: `PRODUCT_${v.sku}`,
          title: `${v.name} — ${formatTZS(v.price)}`,
          subtitle: v.short || undefined,
        })),
      },
      {
        title: t('menu.actions_section'),
        rows: [
          { id: 'ACTION_VIEW_CART', title: t('menu.view_cart') },
          { id: 'ACTION_CHECKOUT',  title: t('menu.checkout') },
          { id: 'ACTION_BACK',      title: t('menu.back_to_menu') },
        ],
      },
    ],
  };
}
