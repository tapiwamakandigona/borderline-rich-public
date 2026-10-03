import { describe, it, expect } from 'vitest';
import { newGame } from '../src/core/state';
import { acquireRival, buyRivalLot, canAcquire, richList, rivalAct, PRICE_WAR_MULT } from '../src/core/rivals';
import { derived, lotValue, rivalAsk, rivalNetWorth } from '../src/core/economy';
import { getCity } from '../src/core/city';
import { REGIONS } from '../src/core/data/regions';
import { advance } from '../src/core/sim';
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
});
