// src/menu.ts

function formatTZS(amount: number): string {
  return `${Math.round(amount).toLocaleString('sw-TZ')} TZS`;
}

export type ActionId =
  | 'BUY_NOW'
  | 'ADD_TO_CART'
  | 'MORE_DETAILS'
  | 'VIEW_CART'
  | 'CHECKOUT'
  | 'TRACK_BY_NAME'
  | 'TALK_TO_AGENT'
  | 'CHANGE_LANGUAGE'
  | 'BACK_TO_MENU';

export interface Product {
  sku: string;
  name: string;
  price: number;
  short?: string;
  children?: Product[];
}

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

export function getVariantsOf(sku: string): Product[] {
  const p = PRODUCTS.find(x => x.sku === sku);
  return p?.children ?? [];
}

export interface MenuRow {
  id: string;
  title: string;
  subtitle?: string;
}

export interface MenuSection {
  title: string;
  rows: MenuRow[];
}

export interface MenuModel {
  header?: string;
  footer?: string;
  sections: MenuSection[];
}

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
          { id: 'ACTION_VIEW_CART', title: t('menu.view_cart') },
          { id: 'ACTION_CHECKOUT', title: t('menu.checkout') },
          { id: 'ACTION_TRACK_BY_NAME', title: t('menu.track_by_name') },
          { id: 'ACTION_TALK_TO_AGENT', title: t('menu.talk_to_agent') },
          { id: 'ACTION_CHANGE_LANGUAGE', title: t('menu.change_language') },
        ],
      },
    ],
  };
}

export function buildProductMenu(t: (key: string) => string, product: Product): MenuModel {
  const rows: MenuRow[] = [
    { id: `BUY_${product.sku}`, title: t('menu.buy_now') },
    { id: `ADD_${product.sku}`, title: t('menu.add_to_cart') },
    { id: `DETAILS_${product.sku}`, title: t('menu.more_details') },
    { id: 'ACTION_VIEW_CART', title: t('menu.view_cart') },
    { id: 'ACTION_CHECKOUT', title: t('menu.checkout') },
    { id: 'ACTION_BACK', title: t('menu.back_to_menu') },
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
          { id: 'ACTION_CHECKOUT', title: t('menu.checkout') },
          { id: 'ACTION_BACK', title: t('menu.back_to_menu') },
        ],
      },
    ],
  };
}
