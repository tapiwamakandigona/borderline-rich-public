import { describe, it, expect } from 'vitest';
import { newGame } from '../src/core/state';
import { serialize, deserialize } from '../src/core/save';
import { applyOffline, OFFLINE_CAP } from '../src/core/offline';
import { derived, tillCap } from '../src/core/economy';
import { getCity } from '../src/core/city';
import { ship } from '../src/core/actions';
import { fulfill } from '../src/iap/fulfill';

function withBiz(manager: boolean) {
  const s = newGame('solenne', 6);
  const lot = getCity('solenne').lots.find((d) => s.regions.solenne.lots[d.id].owner === 'vacant')!;
  Object.assign(s.regions.solenne.lots[lot.id], { owner: 'player', biz: 'cafe', level: 4, manager });
  s.rev++;
  return { s, lot: lot.id };
}

describe('F12 persistence and offline earnings', () => {
  it('managed businesses earn 50 % while away; nothing happens under 30 s', () => {
    const { s, lot } = withBiz(true);
    const net = derived(s, true).lots.solenne[lot].net;
    expect(applyOffline(s, 20).earned).toBe(0);
    const c0 = s.cash;
    const r = applyOffline(s, 3600);
    expect(r).toMatchObject({ seconds: 3600, capped: false, rate: 0.5 });
    expect(s.cash - c0).toBeCloseTo(net * 3600 * 0.5, 6);
    expect(s.t).toBeCloseTo(3600, 6);
  });

  it('offline time is capped at 8 hours without Night Shift', () => {
    const { s } = withBiz(true);
    const r = applyOffline(s, 3 * 86400);
    expect(r.seconds).toBe(OFFLINE_CAP);
    expect(r.capped).toBe(true);
  });

  it('unmanaged businesses only fill their till', () => {
    const { s, lot } = withBiz(false);
    const net = derived(s, true).lots.solenne[lot].net;
    const c0 = s.cash;
    applyOffline(s, 7200);
    expect(s.cash).toBe(c0);
    expect(s.regions.solenne.lots[lot].till).toBeCloseTo(tillCap(net), 6);
  });

  it('shipments in transit resolve while you are away', () => {
    const { s } = withBiz(true);
    s.cash = 1e6;
    ship(s, 'seafood', 10, 'ironhold', 'legal');
    expect(s.shipments).toHaveLength(1);
    applyOffline(s, 600);
    expect(s.shipments).toHaveLength(0);
    expect(s.notices.some((n) => n.text.includes('Seafood sold in Ironhold'))).toBe(true);
  });

  it('entitlements, gold and processed transactions survive save/load', () => {
    const { s } = withBiz(true);
    fulfill(s, { transactionId: 'tx-a', productId: 'br.night_shift' });
    fulfill(s, { transactionId: 'tx-b', productId: 'br.gold.650' });
    const b = deserialize(serialize(s))!;
    expect(b.entitlements.nightShift).toBe(true);
    expect(b.gold).toBe(650);
    expect(fulfill(b, { transactionId: 'tx-b', productId: 'br.gold.650' }).reason).toBe('duplicate');
  });

  it('repairs a save whose city layout gained or lost lots', () => {
    const { s } = withBiz(true);
    const raw = JSON.parse(serialize(s));
    const firstId = Object.keys(raw.s.regions.amberfield.lots)[0];
    delete raw.s.regions.amberfield.lots[firstId];
    raw.s.regions.amberfield.lots['amberfield-ghost'] = { owner: 'npc', biz: 'cafe', level: 1 };
    const b = deserialize(JSON.stringify(raw))!;
    expect(b.regions.amberfield.lots[firstId]).toBeDefined();
    expect(b.regions.amberfield.lots['amberfield-ghost']).toBeUndefined();
  });
});
