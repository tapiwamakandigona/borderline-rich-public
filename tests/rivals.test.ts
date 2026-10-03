import { describe, it, expect } from 'vitest';
import { newGame, RIVAL_START_HOLDINGS, RIVAL_START_MAX_LEVEL } from '../src/core/state';
import {
  acquireRival, buyRivalLot, canAcquire, richList, rivalAct, warBuyoutCost, OFFER_MIN_VALUE, PRICE_WAR_MULT, RIVAL_EVENTS_AFTER,
} from '../src/core/rivals';
import { derived, lotValue, netWorth, rivalAsk, rivalNetWorth } from '../src/core/economy';
import { getCity } from '../src/core/city';
import { REGION, REGIONS } from '../src/core/data/regions';
import { advance } from '../src/core/sim';
import { resolveEvent, trigger } from '../src/core/events';
import { money } from '../src/core/format';
import type { GameState, RegionId } from '../src/core/types';

const footprint = (s: GameState, r: RegionId, owner: string) =>
  Object.values(s.regions[r].lots).filter((l) => l.owner === owner).reduce((a, l) => a + 1 + l.level, 0);

describe('F8 rival companies and the Rich List', () => {
  it('rivals grow on their own: more lots or levels after 20 minutes in most regions', () => {
    const s = newGame('solenne', 8);
    s.nextEventAt = 1e12;
    const before: Record<string, number> = {};
    for (const R of REGIONS) for (const rv of R.rivals) before[rv.id] = footprint(s, R.id, rv.id);
    advance(s, 1200);
    const grew = REGIONS.filter((R) => R.rivals.some((rv) => footprint(s, R.id, rv.id) > before[rv.id]));
    expect(grew.length).toBeGreaterThanOrEqual(5);
    const lobbied = REGIONS.some((R) => Object.values(s.regions[R.id].factions).some((f) => f.donated > 0));
    expect(lobbied).toBe(true);
  });

  it('you can buy a rival property at its asking price', () => {
    const s = newGame('solenne', 8);
    s.cash = 1e9;
    const [lotId, ls] = Object.entries(s.regions.solenne.lots).find(([, l]) => l.owner === 'vance')!;
    const ask = rivalAsk(s, 'solenne', lotId);
    expect(ask).toBeGreaterThan(lotValue(s, 'solenne', lotId) * 1.4);
    const rc = s.rivals.vance.cash;
    expect(buyRivalLot(s, 'solenne', lotId).ok).toBe(true);
    expect(ls.owner).toBe('player');
    expect(s.rivals.vance.cash).toBeCloseTo(rc + ask, 6);
    expect(1e9 - s.cash).toBe(ask);
  });

  it('acquiring a whole rival needs 1.5x their net worth and 1.3x in cash, then absorbs everything', () => {
    const s = newGame('amberfield', 8);
    expect(canAcquire(s, 'fieldstone').ok).toBe(false);
    const nw = rivalNetWorth(s, 'fieldstone');
    s.cash = nw * 1.5;
    expect(canAcquire(s, 'fieldstone').ok).toBe(true);
    const theirLots = Object.values(s.regions.amberfield.lots).filter((l) => l.owner === 'fieldstone').length;
    const mine = () => Object.values(s.regions.amberfield.lots).filter((l) => l.owner === 'player').length;
    expect(acquireRival(s, 'fieldstone').ok).toBe(true);
    expect(mine()).toBe(theirLots);
    expect(s.rivals.fieldstone.acquired).toBe(true);
    expect(richList(s).some((e) => e.id === 'fieldstone')).toBe(false);
    expect(s.stats.acquisitions).toBe(1);
  });

  it('aggressive rivals start price wars that cut your income in that district by 35 %', () => {
    const s = newGame('solenne', 3);
    s.t = RIVAL_EVENTS_AFTER + 1; // wars wait ten minutes and need a buyout you could afford (T12a)
    s.cash = 1e9;
    const city = getCity('solenne');
    // Set up the trigger condition explicitly: Vance and the player both sell logistics in one district.
    const district = 'dockyards';
    const [theirs, mineDef] = city.lots.filter((d) => d.district === district && !d.civic).slice(0, 2);
    Object.assign(s.regions.solenne.lots[theirs.id], { owner: 'vance', biz: 'freight', level: 5, manager: true });
    Object.assign(s.regions.solenne.lots[mineDef.id], { owner: 'player', biz: 'freight', level: 3, manager: true });
    s.rev++;
    const before = derived(s, true).lots.solenne[mineDef.id].net;
    let i = 0;
    while (!s.buffs.some((b) => b.id.startsWith('war:vance')) && i++ < 2000) { s.pendingEvent = null; rivalAct(s, 'vance'); }
    expect(s.buffs.some((b) => b.id.startsWith('war:vance'))).toBe(true);
    s.rev++;
    expect(derived(s, true).lots.solenne[mineDef.id].net / before).toBeCloseTo(PRICE_WAR_MULT, 6);
  });

  it('rivals make offers for your businesses through the event system', () => {
    const s = newGame('verano', 3);
    s.t = RIVAL_EVENTS_AFTER + 1; // rivals give a newcomer ten minutes before bidding (T10g)
    const lot = getCity('verano').lots.find((d) => s.regions.verano.lots[d.id].owner === 'vacant')!;
    Object.assign(s.regions.verano.lots[lot.id], { owner: 'player', biz: 'cafe', level: 4 });
    let i = 0;
    while (s.pendingEvent?.defId !== 'rival_offer' && i++ < 3000) { s.pendingEvent = null; rivalAct(s, 'azure'); }
    expect(s.pendingEvent?.defId).toBe('rival_offer');
    expect(Number(s.pendingEvent!.vars.price)).toBeGreaterThanOrEqual(lotValue(s, 'verano', lot.id) * 1.4 - 1);
    expect(Number(s.pendingEvent!.vars.S)).toBeGreaterThan(0);
  });

  it('the Rich List ranks you against every rival on the continent', () => {
    const s = newGame('ironhold', 1);
    const list = richList(s);
    expect(list).toHaveLength(1 + REGIONS.reduce((a, r) => a + r.rivals.length, 0));
    for (let i = 1; i < list.length; i++) expect(list[i - 1].netWorth).toBeGreaterThanOrEqual(list[i].netWorth);
    expect(list[list.length - 1].isPlayer).toBe(true);
  });

  it('buying the rival out of the district ends their price war (as the toast says)', () => {
    const s = newGame('solenne', 3);
    s.t = RIVAL_EVENTS_AFTER + 1; // wars wait ten minutes and need a buyout you could afford (T12a)
    s.cash = 1e9;
    const city = getCity('solenne');
    const district = 'dockyards';
    for (const d of city.lots) if (d.district === district && s.regions.solenne.lots[d.id].owner === 'vance') Object.assign(s.regions.solenne.lots[d.id], { owner: 'npc' });
    const [theirs, mineDef] = city.lots.filter((d) => d.district === district && !d.civic).slice(0, 2);
    Object.assign(s.regions.solenne.lots[theirs.id], { owner: 'vance', biz: 'freight', level: 5, manager: true });
    Object.assign(s.regions.solenne.lots[mineDef.id], { owner: 'player', biz: 'freight', level: 3, manager: true });
    s.rev++;
    const before = derived(s, true).lots.solenne[mineDef.id].net;
    let i = 0;
    while (!s.buffs.some((b) => b.id.startsWith('war:vance')) && i++ < 2000) { s.pendingEvent = null; rivalAct(s, 'vance'); }
    expect(s.buffs.some((b) => b.id.startsWith('war:vance'))).toBe(true);
    expect(s.notices.at(-1)!.text).toContain('Buy out their logistics business in Dockyards');
    s.cash = 1e9;
    expect(buyRivalLot(s, 'solenne', theirs.id).ok).toBe(true);
    expect(s.buffs.some((b) => b.id.startsWith('war:vance'))).toBe(false);
    expect(s.notices.some((n) => n.text.startsWith('Price war over'))).toBe(true);
    s.rev++;
    expect(derived(s, true).lots.solenne[mineDef.id].net).toBeGreaterThan(before * 0.99);
  });

  it('rivals neither bid nor sabotage in the first ten minutes, and never bid for a street cart', () => {
    const pendingId = (s: GameState): string => s.pendingEvent?.defId ?? '';
    for (const r of ['verano', 'redmesa', 'solenne'] as const) {
      const s = newGame(r, 4);
      const [cartLot, bigLot] = getCity(r).lots.filter((d) => s.regions[r].lots[d.id].owner === 'vacant' && !d.civic);
      Object.assign(s.regions[r].lots[cartLot.id], { owner: 'player', biz: 'cart', level: 1 });
      Object.assign(s.regions[r].lots[bigLot.id], { owner: 'player', biz: 'freight', level: 10, manager: true });
      s.rev++;
      expect(lotValue(s, r, bigLot.id)).toBeGreaterThan(OFFER_MIN_VALUE * 2);
      const ids = Object.keys(s.rivals).filter((id) => s.rivals[id].regionId === r);
      const act = (n: number): Set<string> => {
        const seen = new Set<string>();
        for (let k = 0; k < n; k++) { for (const id of ids) s.rivals[id].cash = 1e9; s.pendingEvent = null; rivalAct(s, ids[k % ids.length]); seen.add(pendingId(s)); }
        return seen;
      };
      // Before ten minutes: a juicy target, bottomless rival pockets, and still no bid or sabotage.
      const early = act(3000);
      expect(early.has('rival_offer') || early.has('sabotage'), r).toBe(false);
      // After ten minutes the same target draws bids, so it was the clock that held them back.
      s.t = RIVAL_EVENTS_AFTER + 1;
      expect(act(3000).has('rival_offer'), r).toBe(true);
      // A street cart on its own is beneath them.
      Object.assign(s.regions[r].lots[bigLot.id], { owner: 'vacant', biz: null, level: 0, manager: false });
      s.rev++;
      expect(act(3000).has('rival_offer'), r).toBe(false);
    }
  });
});

describe('T12a rivals play fair (critic evaluation #2, findings 1-3)', () => {
  it('rivals start at their designed size, so the biggest on paper is the biggest in the game', () => {
    for (const seed of [21, 7, 99, 3, 8]) {
      const s = newGame('solenne', seed);
      for (const R of REGIONS) {
        for (const rd of R.rivals) {
          const lots = Object.values(s.regions[R.id].lots).filter((l) => l.owner === rd.id);
          expect(lots.length, `${seed} ${rd.id} lots`).toBe(rd.startLots);
          for (const l of lots) expect(l.level, `${seed} ${rd.id}`).toBeLessThanOrEqual(RIVAL_START_MAX_LEVEL);
          // Net worth = its design, split between businesses and cash (no billion-dollar seed luck).
          expect(rivalNetWorth(s, rd.id) / rd.startWorth, `${seed} ${rd.id}`).toBeCloseTo(1, 6);
          expect(s.rivals[rd.id].cash, `${seed} ${rd.id}`).toBeGreaterThanOrEqual(rd.startWorth * (1 - 1.25 * RIVAL_START_HOLDINGS) - 1);
        }
        const byDesign = [...R.rivals].sort((a, b) => b.startWorth - a.startWorth)[0].id;
        const byWorth = [...R.rivals].sort((a, b) => rivalNetWorth(s, b.id) - rivalNetWorth(s, a.id))[0].id;
        expect(byWorth, `${seed} ${R.id}`).toBe(byDesign);
      }
    }
  });

  it('rivals never spend money they do not have', () => {
    // Every rival on the continent, nearly broke and acting hundreds of times.
    const s = newGame('verano', 21);
    s.t = RIVAL_EVENTS_AFTER + 1;
    let low = Infinity;
    for (const [id, r] of Object.entries(s.rivals)) {
      const ci = REGION[r.regionId].economy.costIndex;
      for (const start of [500, 20_000, 400_000, 5_000_000]) {
        r.cash = start * ci;
        for (let k = 0; k < 200; k++) { s.pendingEvent = null; rivalAct(s, id); low = Math.min(low, r.cash); }
      }
    }
    expect(low).toBeGreaterThanOrEqual(0);
    // And over half an hour of the real sim.
    for (const seed of [21, 7]) {
      const g = newGame('solenne', seed);
      for (let t = 0; t < 1800; t += 30) {
        advance(g, 30);
        for (const r of Object.values(g.rivals)) expect(r.cash, `${seed} ${r.id} at ${t + 30}s`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('an offer the rival can no longer cover falls through instead of putting them in debt', () => {
    const s = newGame('verano', 4);
    const lot = getCity('verano').lots.find((d) => s.regions.verano.lots[d.id].owner === 'vacant')!;
    Object.assign(s.regions.verano.lots[lot.id], { owner: 'player', biz: 'cafe', level: 3, till: 50 });
    trigger(s, 'rival_offer', 'verano', { rival: 'Azure Crown Resorts', rivalId: 'azure', lotId: lot.id, biz: 'Café', price: 99_999 });
    s.rivals.azure.cash = 50_000; // spent since the offer
    resolveEvent(s, 0);
    expect(s.regions.verano.lots[lot.id].owner).toBe('player');
    expect(s.rivals.azure.cash).toBe(50_000);
    expect(s.cash).toBe(0);
    expect(s.notices.at(-1)!.text).toContain('backed out');
  });

  it('price wars wait ten minutes, and only start where buying the rival out costs no more than you are worth', () => {
    const s = newGame('solenne', 3);
    const city = getCity('solenne');
    const district = 'dockyards';
    for (const d of city.lots) if (d.district === district && s.regions.solenne.lots[d.id].owner === 'vance') Object.assign(s.regions.solenne.lots[d.id], { owner: 'npc' });
    const [theirs, mine] = city.lots.filter((d) => d.district === district && !d.civic).slice(0, 2);
    Object.assign(s.regions.solenne.lots[theirs.id], { owner: 'vance', biz: 'freight', level: 30, manager: true });
    Object.assign(s.regions.solenne.lots[mine.id], { owner: 'player', biz: 'freight', level: 3, manager: true });
    s.rev++;
    const war = () => s.buffs.some((b) => b.id.startsWith('war:vance'));
    const act = (n: number) => { for (let i = 0; i < n && !war(); i++) { s.pendingEvent = null; rivalAct(s, 'vance'); } return war(); };
    const cost = () => warBuyoutCost(s, 'solenne', 'vance', district, 'logistics');
    // A newcomer, even a rich one, gets ten minutes of peace.
    s.cash = cost() * 3;
    expect(act(2000)).toBe(false);
    // After ten minutes, a fight you could not answer still doesn't start.
    s.t = RIVAL_EVENTS_AFTER + 1;
    s.cash = 0;
    expect(netWorth(s)).toBeLessThan(cost());
    expect(act(2000)).toBe(false);
    // Once buying them out is within your means, the war comes and the toast names the price.
    s.cash = cost() * 3;
    expect(act(2000)).toBe(true);
    expect(cost()).toBeLessThanOrEqual(netWorth(s));
    expect(s.notices.at(-1)!.text).toContain(`Buy out their logistics business in Dockyards (about ${money(cost())}) to end it.`);
  });
});
