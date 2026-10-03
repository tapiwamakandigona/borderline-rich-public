import { describe, it, expect } from 'vitest';
import { newGame } from '../src/core/state';
import { getCity } from '../src/core/city';
import { BIZ } from '../src/core/data/businesses';
import {
  allowedBiz, bizCost, derived, landPrice, lotValue, maxAffordable, milestoneMult, npcAsk, projectIncome, upgradeCost, upgradeCostN,
} from '../src/core/economy';
import { REGIONS } from '../src/core/data/regions';
import { STARTER } from '../src/core/data/businesses';
import { buyRivalLot } from '../src/core/rivals';
import { buyNpc, buyVacant, collect, hireManager, managerCost, upgradeLot } from '../src/core/actions';
import { advance, step } from '../src/core/sim';
import { DT, TILL_SECONDS } from '../src/core/constants';
import type { GameState } from '../src/core/types';

const R = 'solenne' as const;
function vacantSmall(s: GameState) {
  return getCity(R).lots.find((d) => s.regions[R].lots[d.id].owner === 'vacant' && d.footprint === 'small')!;
}
const net = (s: GameState, id: string) => derived(s, true).lots[R][id].net;
/** Freeze the rest of the world (events, rival moves, NPC churn) so accounting can be exact. */
function quiet(s: GameState) {
  s.nextEventAt = 1e12;
  s.timers.churn = 1e12;
  for (const r of Object.values(s.rivals)) r.nextActAt = 1e12;
}

describe('F5 businesses, lots, upgrades, managers', () => {
  it('buying a vacant lot charges land + business and rejects businesses too big for the lot', () => {
    const s = newGame(R, 2);
    s.cash = 1e9;
    const lot = vacantSmall(s);
    expect(buyVacant(s, R, lot.id, 'hotel').ok).toBe(false);
    const cost = landPrice(s, R, lot) + bizCost(s, R, BIZ.cafe);
    const before = s.cash;
    expect(buyVacant(s, R, lot.id, 'cafe').ok).toBe(true);
    expect(before - s.cash).toBe(cost);
    expect(s.regions[R].lots[lot.id]).toMatchObject({ owner: 'player', biz: 'cafe', level: 1 });
    expect(buyVacant(s, R, lot.id, 'cafe').ok).toBe(false);
  });

  it('cannot buy what you cannot afford', () => {
    const s = newGame(R, 2);
    expect(buyVacant(s, R, vacantSmall(s).id, 'cart').ok).toBe(false);
    expect(s.cash).toBe(0);
  });

  it('NPC businesses sell at 1.2x their value and keep their level', () => {
    const s = newGame(R, 2);
    s.cash = 1e9;
    const id = Object.keys(s.regions[R].lots).find((k) => s.regions[R].lots[k].owner === 'npc')!;
    const level = s.regions[R].lots[id].level;
    expect(npcAsk(s, R, id)).toBe(Math.round(lotValue(s, R, id) * 1.2));
    const ask = npcAsk(s, R, id);
    expect(buyNpc(s, R, id).ok).toBe(true);
    expect(1e9 - s.cash).toBe(ask);
    expect(s.regions[R].lots[id].level).toBe(level);
  });

  it('upgrades cost a geometric series; x10 and max work', () => {
    const s = newGame(R, 2);
    s.cash = 1e9;
    const lot = vacantSmall(s);
    buyVacant(s, R, lot.id, 'kiosk');
    const b = BIZ.kiosk;
    const single = upgradeCost(s, R, b, 1);
    let sum = 0;
    for (let l = 1; l < 11; l++) sum += upgradeCost(s, R, b, l);
    expect(upgradeCostN(s, R, b, 1, 10)).toBeCloseTo(sum, 6);
    const c0 = s.cash;
    expect(upgradeLot(s, R, lot.id, 1).ok).toBe(true);
    expect(c0 - s.cash).toBeCloseTo(single, 6);
    expect(upgradeLot(s, R, lot.id, 10).levels).toBe(10);
    expect(s.regions[R].lots[lot.id].level).toBe(12);
    s.cash = upgradeCostN(s, R, b, 12, 7) + 1;
    expect(maxAffordable(s, R, b, 12, s.cash)).toBe(7);
    expect(upgradeLot(s, R, lot.id, 'max').levels).toBe(7);
  });

  it('income jumps at the level-10 milestone (and keeps compounding at 25/50/100)', () => {
    expect(milestoneMult(9)).toBe(1);
    expect(milestoneMult(10)).toBeGreaterThanOrEqual(1.5);
    expect(milestoneMult(25)).toBeGreaterThan(milestoneMult(10));
    expect(milestoneMult(100)).toBeGreaterThan(milestoneMult(50));
    const s = newGame(R, 2);
    s.cash = 1e9;
    const lot = vacantSmall(s);
    buyVacant(s, R, lot.id, 'kiosk');
    upgradeLot(s, R, lot.id, 8);
    const at9 = net(s, lot.id);
    upgradeLot(s, R, lot.id, 1);
    expect(net(s, lot.id) / at9).toBeCloseTo((10 * milestoneMult(10)) / 9, 6);
  });

  it('unmanaged income fills a till capped at 120 s; collecting moves it to cash; managers bank it', () => {
    const s = newGame(R, 2);
    s.cash = 1e6;
    const lot = vacantSmall(s);
    buyVacant(s, R, lot.id, 'cafe');
    quiet(s);
    const n = net(s, lot.id);
    const cash0 = s.cash;
    advance(s, 300);
    const ls = s.regions[R].lots[lot.id];
    expect(ls.till).toBeCloseTo(n * TILL_SECONDS, 6);
    // A till never shrinks when income later drops (e.g. a competitor opens next door).
    const full = ls.till;
    s.buffs.push({ id: 'test', label: 'slump', mult: 0.2, until: s.t + 100, target: 'player' });
    s.rev++;
    advance(s, 5);
    expect(ls.till).toBe(full);
    s.buffs = [];
    s.rev++;
    const got = collect(s, R, lot.id);
    expect(got).toBeGreaterThan(0);
    expect(ls.till).toBe(0);
    expect(s.cash).toBeGreaterThan(cash0);
    const mc = managerCost(s, R, lot.id);
    expect(mc).toBe(2 * bizCost(s, R, BIZ.cafe));
    expect(hireManager(s, R, lot.id).ok).toBe(true);
    // Exact accounting: with events off, cash must grow by the integral of this lot's live income
    // (which already includes any rival price war that lands during the window).
    s.pendingEvent = null;
    const c1 = s.cash;
    let expected = 0;
    for (let i = 0; i < 600; i++) {
      step(s, DT);
      expected += derived(s).lots[R][lot.id].net * DT;
    }
    expect(ls.till).toBe(0);
    expect(expected).toBeGreaterThan(0);
    expect(s.cash - c1).toBeCloseTo(expected, 6);
  });

  it('competition from other owners lowers income; a chain in the district raises it', () => {
    const s = newGame(R, 2);
    s.cash = 1e9;
    const city = getCity(R);
    // Find a district with at least 3 free small lots.
    const byD = new Map<string, string[]>();
    for (const d of city.lots) if (s.regions[R].lots[d.id].owner === 'vacant' && d.footprint === 'small') byD.set(d.district, [...(byD.get(d.district) ?? []), d.id]);
    const [district, ids] = [...byD.entries()].find(([, v]) => v.length >= 3)!;
    // Clear the whole retail category from the district so the baseline has zero competition.
    for (const d of city.lots) {
      const ls = s.regions[R].lots[d.id];
      if (d.district === district && ls.biz && BIZ[ls.biz].category === 'retail') Object.assign(ls, { owner: 'vacant', biz: null, level: 0 });
    }
    buyVacant(s, R, ids[0], 'kiosk');
    const alone = net(s, ids[0]);
    Object.assign(s.regions[R].lots[ids[1]], { owner: 'bellamy', biz: 'kiosk', level: 3 });
    s.rev++;
    expect(net(s, ids[0]) / alone).toBeCloseTo(1 / 1.12, 6);
    Object.assign(s.regions[R].lots[ids[1]], { owner: 'vacant', biz: null, level: 0 });
    buyVacant(s, R, ids[2], 'kiosk');
    expect(net(s, ids[0]) / alone).toBeCloseTo(1.05, 6);
  });

  it('the lot card estimate is what the business really earns once bought (every region, critic #4)', () => {
    for (const Rg of REGIONS) {
      const r = Rg.id;
      for (const bizId of [STARTER[r], 'cart', 'kiosk']) {
        const s = newGame(r, 5);
        quiet(s);
        s.cash = 1e7;
        s.rep = 20; // rep, overhead and synergy are part of the real formula too
        const city = getCity(r);
        const lot = city.lots.find((d) => s.regions[r].lots[d.id].owner === 'vacant' && allowedBiz(r, d).some((b) => b.id === bizId))!;
        const est = projectIncome(s, r, lot.id, bizId);
        expect(buyVacant(s, r, lot.id, bizId).ok, `${r} ${bizId}`).toBe(true);
        s.regions[r].lots[lot.id].permitUntil = 0; // Red Mesa: compare once the permit has cleared
        s.rev++;
        const real = derived(s, true).lots[r][lot.id].net;
        expect(real, `${r} ${bizId}`).toBeGreaterThan(0);
        expect(est / real, `${r} ${bizId}: estimate ${est} vs real ${real}`).toBeCloseTo(1, 9);
      }
      // Buying an existing business: the "for you" figure matches too.
      const s = newGame(r, 5);
      quiet(s);
      s.cash = 1e13;
      const rivalLot = getCity(r).lots.find((d) => s.rivals[s.regions[r].lots[d.id].owner])!;
      const ls = s.regions[r].lots[rivalLot.id];
      const est = projectIncome(s, r, rivalLot.id, ls.biz!, ls.level);
      expect(buyRivalLot(s, r, rivalLot.id).ok).toBe(true);
      expect(est / derived(s, true).lots[r][rivalLot.id].net, `${r} rival lot`).toBeCloseTo(1, 9);
    }
  });
});

