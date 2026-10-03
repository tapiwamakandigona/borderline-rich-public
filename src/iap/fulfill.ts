// Grants purchases into game state. Idempotent per transaction id, so a replayed receipt,
// a double callback or a restore can never double-grant.
import type { GameState } from '../core/types';
import { PRODUCT } from './catalog';
import { notify } from '../core/notify';

export interface Purchase { transactionId: string; productId: string; }
export interface FulfillResult { ok: boolean; granted?: string; reason?: 'duplicate' | 'unknown' | 'already-owned'; }

export function canPurchase(state: GameState, productId: string): boolean {
  const p = PRODUCT[productId];
  if (!p) return false;
  if (productId === 'br.starter') return !state.entitlements.starterPack;
  if (productId === 'br.golden_ledger') return !state.entitlements.doubleIncome;
  if (productId === 'br.night_shift') return !state.entitlements.nightShift;
  return true;
}

export function fulfill(state: GameState, purchase: Purchase): FulfillResult {
  const p = PRODUCT[purchase.productId];
  if (!p) return { ok: false, reason: 'unknown' };
  if (state.processedTx.includes(purchase.transactionId)) return { ok: false, reason: 'duplicate' };
  if (!canPurchase(state, p.id) && p.type === 'consumable') return { ok: false, reason: 'already-owned' };
  state.processedTx.push(purchase.transactionId);
  if (state.processedTx.length > 500) state.processedTx.splice(0, state.processedTx.length - 500);
  let granted = '';
  switch (p.id) {
    case 'br.starter':
      state.gold += p.gold!;
      state.entitlements.starterPack = true;
      state.paint = 'gilded';
      state.buffs.push({ id: `iap:starter:${purchase.transactionId}`, label: 'Starter boost ×2', mult: 2, until: state.t + 24 * 3600, target: 'player' });
      granted = `${p.gold} gold, 2× income for 24 h and Gilded paint`;
      break;
    case 'br.golden_ledger':
      state.entitlements.doubleIncome = true;
      granted = 'Golden Ledger: permanent 2× income';
      break;
    case 'br.night_shift':
      state.entitlements.nightShift = true;
      granted = 'Night Shift: 100 % offline earnings for 24 h';
      break;
    default:
      state.gold += p.gold ?? 0;
      granted = `${p.gold} gold`;
  }
  state.rev++;
  notify(state, `Purchase complete — ${granted}. Thank you!`, 'good');
  return { ok: true, granted };
}

/** Re-applies owned non-consumables (from the store's restore call). Safe to repeat. */
export function restoreEntitlements(state: GameState, ownedProductIds: string[]): string[] {
  const restored: string[] = [];
  if (ownedProductIds.includes('br.golden_ledger') && !state.entitlements.doubleIncome) { state.entitlements.doubleIncome = true; restored.push('br.golden_ledger'); }
  if (ownedProductIds.includes('br.night_shift') && !state.entitlements.nightShift) { state.entitlements.nightShift = true; restored.push('br.night_shift'); }
  if (restored.length) { state.rev++; notify(state, `Restored ${restored.length} purchase${restored.length > 1 ? 's' : ''}.`, 'good'); }
  return restored;
}
