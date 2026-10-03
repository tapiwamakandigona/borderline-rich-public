// Store abstraction. The web build uses a clearly-labelled sandbox store (no real money). Native
// builds swap in an adapter backed by cordova-plugin-purchase (see docs/IAP.md, milestone M3).
import { PRODUCTS, PRODUCT, type Product } from './catalog';
import type { Purchase } from './fulfill';

export type PurchaseOutcome =
  | { status: 'success'; purchase: Purchase }
  | { status: 'cancelled' }
  | { status: 'failed'; error: string };

export interface Store {
  readonly kind: 'sandbox' | 'native';
  readonly isTestStore: boolean;
  products(): Product[];
  priceLabel(productId: string): string;
  purchase(productId: string): Promise<PurchaseOutcome>;
  restore(): Promise<string[]>;
}

export interface KeyValue { get(k: string): string | null; set(k: string, v: string): void; }
export const memoryKV = (): KeyValue => {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => void m.set(k, v) };
};

/** Sandbox store: simulates a platform payment sheet via an injected confirm() and remembers
 *  owned non-consumables so "Restore purchases" can be exercised end-to-end on the web. */
export class SandboxStore implements Store {
  readonly kind = 'sandbox' as const;
  readonly isTestStore = true;
  private counter = 0;
  constructor(
    private confirm: (p: Product) => Promise<boolean>,
    private kv: KeyValue = memoryKV(),
    private idSource: () => string = () => Math.random().toString(36).slice(2, 10),
  ) {}
  products() { return PRODUCTS; }
  priceLabel(id: string) { const p = PRODUCT[id]; return p ? `$${p.usd.toFixed(2)}` : '—'; }
  async purchase(productId: string): Promise<PurchaseOutcome> {
    const p = PRODUCT[productId];
    if (!p) return { status: 'failed', error: 'Unknown product' };
    const ok = await this.confirm(p);
    if (!ok) return { status: 'cancelled' };
    const purchase = { transactionId: `sbx_${Date.now().toString(36)}_${++this.counter}_${this.idSource()}`, productId };
    if (p.type === 'nonconsumable') {
      const owned = new Set(JSON.parse(this.kv.get('br.sandbox.owned') ?? '[]') as string[]);
      owned.add(productId);
      this.kv.set('br.sandbox.owned', JSON.stringify([...owned]));
    }
    return { status: 'success', purchase };
  }
  async restore(): Promise<string[]> { return JSON.parse(this.kv.get('br.sandbox.owned') ?? '[]') as string[]; }
}

/** Native adapter placeholder: reports itself unavailable until the purchase plugin is
 *  installed and products exist in the store consoles. Never fakes a successful payment. */
export class NativeStoreUnavailable implements Store {
  readonly kind = 'native' as const;
  readonly isTestStore = false;
  products() { return PRODUCTS; }
  priceLabel() { return '—'; }
  async purchase(): Promise<PurchaseOutcome> { return { status: 'failed', error: 'Store not configured in this build.' }; }
  async restore(): Promise<string[]> { return []; }
}
