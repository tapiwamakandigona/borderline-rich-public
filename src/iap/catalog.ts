// Product catalog. Store product ids must match App Store Connect / Google Play Console ids
// when real stores are wired (docs/IAP.md). Prices are display placeholders; real builds
// must show the localized price string returned by the store.

export type ProductType = 'consumable' | 'nonconsumable';
export interface Product {
  id: string;
  type: ProductType;
  title: string;
  blurb: string;
  usd: number;
  gold?: number;
  bonus?: string;
  oneTime?: boolean;
  highlight?: boolean;
}

export const PRODUCTS: Product[] = [
  { id: 'br.gold.120', type: 'consumable', title: 'Pocket of Gold', blurb: '120 gold', usd: 0.99, gold: 120 },
  { id: 'br.gold.650', type: 'consumable', title: 'Stack of Gold', blurb: '650 gold', usd: 4.99, gold: 650, bonus: '+8 %' },
  { id: 'br.gold.1400', type: 'consumable', title: 'Vault of Gold', blurb: '1,400 gold', usd: 9.99, gold: 1400, bonus: '+17 %', highlight: true },
  { id: 'br.gold.7500', type: 'consumable', title: 'Treasury of Gold', blurb: '7,500 gold', usd: 49.99, gold: 7500, bonus: '+25 %' },
  { id: 'br.starter', type: 'consumable', title: 'Starter Pack', blurb: '400 gold · 2× income for 24 h · Gilded paint', usd: 2.99, gold: 400, oneTime: true, highlight: true },
  { id: 'br.golden_ledger', type: 'nonconsumable', title: 'Golden Ledger', blurb: 'Permanent 2× income on every business', usd: 7.99 },
  { id: 'br.night_shift', type: 'nonconsumable', title: 'Night Shift', blurb: 'Offline earnings at 100 % for up to 24 h', usd: 3.99 },
];

export const PRODUCT: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
export const usd = (n: number) => `$${n.toFixed(2)}`;
