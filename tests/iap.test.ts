import { describe, it, expect } from 'vitest';
import { newGame } from '../src/core/state';
import { PRODUCTS } from '../src/iap/catalog';
import { canPurchase, fulfill, restoreEntitlements } from '../src/iap/fulfill';
import { SandboxStore, NativeStoreUnavailable, memoryKV } from '../src/iap/store';
import { derived } from '../src/core/economy';
import { getCity } from '../src/core/city';
import { GOLD_ITEMS, ship, useGold } from '../src/core/actions';
import { applyOffline } from '../src/core/offline';

describe('F11 in-app purchases', () => {
  it('catalog has gold packs, a one-time starter pack and two non-consumables', () => {
    expect(PRODUCTS.filter((p) => p.id.startsWith('br.gold.')).length).toBe(4);
    expect(PRODUCTS.find((p) => p.id === 'br.starter')?.oneTime).toBe(true);
    expect(PRODUCTS.filter((p) => p.type === 'nonconsumable').map((p) => p.id).sort()).toEqual(['br.golden_ledger', 'br.night_shift']);
    expect(new Set(PRODUCTS.map((p) => p.id)).size).toBe(PRODUCTS.length);
    for (const p of PRODUCTS) expect(p.usd).toBeGreaterThan(0);
  });

  it('fulfillment is idempotent per transaction id', () => {
    const s = newGame('solenne', 1);
    expect(fulfill(s, { transactionId: 't1', productId: 'br.gold.650' }).ok).toBe(true);
    expect(fulfill(s, { transactionId: 't1', productId: 'br.gold.650' })).toEqual({ ok: false, reason: 'duplicate' });
    expect(s.gold).toBe(650);
    expect(fulfill(s, { transactionId: 't2', productId: 'br.gold.120' }).ok).toBe(true);
    expect(s.gold).toBe(770);
    expect(fulfill(s, { transactionId: 't3', productId: 'nope' }).reason).toBe('unknown');
  });

  it('starter pack grants gold, a 24 h 2x boost and paint, and only once', () => {
    const s = newGame('solenne', 1);
    expect(canPurchase(s, 'br.starter')).toBe(true);
    fulfill(s, { transactionId: 's1', productId: 'br.starter' });
    expect(s.gold).toBe(400);
    expect(s.paint).toBe('gilded');
    expect(s.buffs.some((b) => b.mult === 2 && b.until === s.t + 86400)).toBe(true);
    expect(canPurchase(s, 'br.starter')).toBe(false);
    expect(fulfill(s, { transactionId: 's2', productId: 'br.starter' }).reason).toBe('already-owned');
    expect(s.gold).toBe(400);
  });

  it('Golden Ledger doubles income; Night Shift lifts offline earnings to 100 % / 24 h', () => {
    const s = newGame('solenne', 1);
    const lot = getCity('solenne').lots.find((d) => s.regions.solenne.lots[d.id].owner === 'vacant')!;
    Object.assign(s.regions.solenne.lots[lot.id], { owner: 'player', biz: 'cafe', level: 3, manager: true });
    s.rev++;
    const base = derived(s, true).player;
    fulfill(s, { transactionId: 'g1', productId: 'br.golden_ledger' });
    expect(derived(s, true).player).toBeCloseTo(base * 2, 6);
    const a = applyOffline(structuredClone(s), 30 * 3600);
    fulfill(s, { transactionId: 'n1', productId: 'br.night_shift' });
    const b = applyOffline(s, 30 * 3600);
    expect(a.seconds).toBe(8 * 3600);
    expect(b.seconds).toBe(24 * 3600);
    expect(b.rate).toBe(1);
    expect(b.earned).toBeGreaterThan(a.earned * 5);
  });

  it('restore re-applies owned non-consumables and is safe to repeat', () => {
    const s = newGame('solenne', 1);
    expect(restoreEntitlements(s, ['br.golden_ledger', 'br.night_shift'])).toHaveLength(2);
    expect(restoreEntitlements(s, ['br.golden_ledger', 'br.night_shift'])).toHaveLength(0);
    expect(s.entitlements).toMatchObject({ doubleIncome: true, nightShift: true });
  });

  it('sandbox store: confirm → success with a unique transaction, cancel → nothing, restore remembers non-consumables', async () => {
    let answer = true;
    const store = new SandboxStore(async () => answer, memoryKV());
    expect(store.isTestStore).toBe(true);
    const s = newGame('solenne', 1);
    const r1 = await store.purchase('br.gold.120');
    const r2 = await store.purchase('br.gold.120');
    expect(r1.status).toBe('success');
    if (r1.status !== 'success' || r2.status !== 'success') throw new Error('expected success');
    expect(r1.purchase.transactionId).not.toBe(r2.purchase.transactionId);
    fulfill(s, r1.purchase);
    fulfill(s, r2.purchase);
    expect(s.gold).toBe(240);
    answer = false;
    expect((await store.purchase('br.gold.7500')).status).toBe('cancelled');
    expect(s.gold).toBe(240);
    answer = true;
    await store.purchase('br.night_shift');
    expect(await store.restore()).toEqual(['br.night_shift']);
    expect((await new NativeStoreUnavailable().purchase()).status).toBe('failed');
  });

  it('gold sinks spend gold and apply their effects', () => {
    const s = newGame('solenne', 1);
    expect(useGold(s, 'lawyer').ok).toBe(false);
    s.gold = 1000;
    s.heat = 80;
    expect(useGold(s, 'lawyer').ok).toBe(true);
    expect(s.heat).toBe(20);
    expect(useGold(s, 'timewarp').ok).toBe(false);
    const lot = getCity('solenne').lots.find((d) => s.regions.solenne.lots[d.id].owner === 'vacant')!;
    Object.assign(s.regions.solenne.lots[lot.id], { owner: 'player', biz: 'kiosk', level: 2, manager: true });
    s.rev++;
    const inc = derived(s, true).player;
    const c0 = s.cash;
    expect(useGold(s, 'timewarp').ok).toBe(true);
    expect(s.cash - c0).toBeCloseTo(inc * 3600, 6);
    expect(useGold(s, 'turbo').ok).toBe(true);
    expect(derived(s, true).player).toBeCloseTo(inc * 2, 6);
    s.cash = 1e6;
    ship(s, 'seafood', 10, 'ironhold', 'legal');
    expect(useGold(s, 'express').ok).toBe(true);
    expect(s.shipments[0].arriveAt).toBe(s.t);
    const spent = GOLD_ITEMS.filter((g) => g.id !== 'timewarp').reduce((a, g) => a + g.gold, 0) + 40;
    expect(s.gold).toBe(1000 - spent);
  });
});
