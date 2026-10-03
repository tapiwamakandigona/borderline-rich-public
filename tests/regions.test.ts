import { describe, it, expect } from 'vitest';
import { REGIONS, REGION } from '../src/core/data/regions';
import { EVENTS } from '../src/core/data/events';
import { getCity } from '../src/core/city';
import { newGame } from '../src/core/state';
import { derived } from '../src/core/economy';
import { laws } from '../src/core/laws';
import { DAY } from '../src/core/constants';
import { quote } from '../src/core/trade';
import { buyVacant, expeditePermit, toggleOffshore } from '../src/core/actions';
import { advance } from '../src/core/sim';
import { HYPE_MAX, HYPE_MIN, SEASON_MULT, TOURISM_HIGH, TOURISM_LOW, mechanicsTick } from '../src/core/mechanics';
import type { GameState, RegionId } from '../src/core/types';

/** Put a player business directly on the first vacant lot that allows it. */
function place(s: GameState, r: RegionId, bizId: string, level = 1): string {
  const city = getCity(r);
  const lot = city.lots.find((d) => s.regions[r].lots[d.id].owner === 'vacant' && (d.footprint !== 'small' || ['cart', 'kiosk', 'farmstand', 'laundromat', 'guesthouse', 'gasstation', 'machineshop', 'cafe', 'freight', 'appstudio', 'offshore', 'boutique'].includes(bizId)))!;
  Object.assign(s.regions[r].lots[lot.id], { owner: 'player', biz: bizId, level, manager: true, permitUntil: 0 });
  s.rev++;
  return lot.id;
}
const inc = (s: GameState, r: RegionId, lotId: string) => derived(s, true).lots[r][lotId].net;

describe('F3 six genuinely different starting regions', () => {
  it('has six regions with distinct governments, signatures and themes of play', () => {
    expect(REGIONS).toHaveLength(6);
    expect(new Set(REGIONS.map((r) => r.signature.name)).size).toBe(6);
    expect(new Set(REGIONS.map((r) => r.government.name)).size).toBe(6);
    expect(new Set(REGIONS.map((r) => r.government.kind)).size).toBe(3);
    expect(new Set(REGIONS.map((r) => r.hustle.label)).size).toBe(6);
    expect(new Set(REGIONS.map((r) => r.difficulty))).toEqual(new Set([1, 2, 3, 4]));
  });

  it('every region has factions, named rivals, five districts and region-only events', () => {
    for (const r of REGIONS) {
      expect(r.factions.length, r.id).toBeGreaterThanOrEqual(2);
      expect(r.rivals.length, r.id).toBeGreaterThanOrEqual(2);
      expect(r.districts).toHaveLength(5);
      for (const rv of r.rivals) expect(r.factions.some((f) => f.id === rv.favFaction), rv.id).toBe(true);
      const own = EVENTS.filter((e) => e.region === r.id && !e.system);
      expect(own.length, r.id).toBeGreaterThanOrEqual(6);
    }
  });

  it('economy and law profiles are pairwise distinct', () => {
    const sig = (r: (typeof REGIONS)[number]) => JSON.stringify([r.economy.costIndex, r.economy.wageIndex, r.economy.corruption, r.baseLaws.incomeTax, r.baseLaws.importTariff, r.produces, r.demands]);
    expect(new Set(REGIONS.map(sig)).size).toBe(6);
    const topDemand = REGIONS.map((r) => Object.entries(r.economy.demand).sort((a, b) => b[1] - a[1])[0][0]);
    expect(new Set(topDemand).size).toBe(6);
  });

  it('every city layout has starter lots, a late-game ceiling, a City Hall and unique ids', () => {
    for (const r of REGIONS) {
      const c = getCity(r.id);
      expect(new Set(c.lots.map((l) => l.id)).size).toBe(c.lots.length);
      expect(c.lots.filter((l) => l.footprint === 'small').length, r.id).toBeGreaterThanOrEqual(12);
      expect(c.lots.filter((l) => l.footprint === 'tower').length, r.id).toBeGreaterThanOrEqual(1);
      expect(c.lots.filter((l) => l.footprint === 'large').length, r.id).toBeGreaterThanOrEqual(2);
      expect(c.lots.filter((l) => l.civic === 'cityhall')).toHaveLength(1);
      expect(new Set(c.lots.map((l) => l.district)).size, r.id).toBeGreaterThanOrEqual(4);
      const s = newGame(r.id, 3);
      const vacantSmall = c.lots.filter((l) => l.footprint === 'small' && s.regions[r.id].lots[l.id].owner === 'vacant').length;
      expect(vacantSmall, r.id).toBeGreaterThanOrEqual(6);
    }
  });

  it('Amberfield: harvest-season farm income is a multiple of winter income', () => {
    const s = newGame('amberfield', 1);
    const lot = place(s, 'amberfield', 'farmstand');
    s.t = 2 * DAY + 1; s.rev++;
    const harvest = inc(s, 'amberfield', lot);
    s.t = 3 * DAY + 1; s.rev++;
    const winter = inc(s, 'amberfield', lot);
    expect(harvest / winter).toBeCloseTo(SEASON_MULT[2] / SEASON_MULT[3], 5);
    expect(harvest / winter).toBeGreaterThanOrEqual(3);
  });

  it('Neon Vale: tech income rides the hype index', () => {
    const s = newGame('neonvale', 1);
    const lot = place(s, 'neonvale', 'appstudio');
    s.regions.neonvale.vars.hype = HYPE_MIN; s.rev++;
    const low = inc(s, 'neonvale', lot);
    s.regions.neonvale.vars.hype = HYPE_MAX; s.rev++;
    expect(inc(s, 'neonvale', lot) / low).toBeCloseTo(HYPE_MAX / HYPE_MIN, 5);
    expect(HYPE_MAX / HYPE_MIN).toBeGreaterThanOrEqual(2);
  });

  it('Red Mesa: tier-2 businesses wait for a permit unless you bribe (heat up)', () => {
    const s = newGame('redmesa', 1);
    s.cash = 1e6;
    const lot = getCity('redmesa').lots.find((d) => s.regions.redmesa.lots[d.id].owner === 'vacant' && d.footprint === 'small')!;
    expect(buyVacant(s, 'redmesa', lot.id, 'gasstation').ok).toBe(true);
    expect(s.regions.redmesa.lots[lot.id].permitUntil).toBeGreaterThan(s.t + 30);
    expect(inc(s, 'redmesa', lot.id)).toBe(0);
    const heat = s.heat;
    expect(expeditePermit(s, lot.id).ok).toBe(true);
    expect(s.heat).toBeGreaterThan(heat);
    expect(inc(s, 'redmesa', lot.id)).toBeGreaterThan(0);
    // The same business elsewhere opens instantly.
    const t = newGame('solenne', 1);
    t.cash = 1e6;
    const l2 = getCity('solenne').lots.find((d) => t.regions.solenne.lots[d.id].owner === 'vacant' && d.footprint === 'small')!;
    buyVacant(t, 'solenne', l2.id, 'gasstation');
    expect(t.regions.solenne.lots[l2.id].permitUntil).toBe(0);
  });

  it('Isla Verano: tourist seasons swing hospitality and offshore shelter cuts tax elsewhere', () => {
    const s = newGame('verano', 1);
    s.regions.solenne.unlocked = true;
    const hotel = place(s, 'verano', 'guesthouse');
    s.t = 10; s.rev++;
    const high = inc(s, 'verano', hotel);
    s.t = 2 * DAY + 10; s.rev++;
    expect(high / inc(s, 'verano', hotel)).toBeCloseTo(TOURISM_HIGH / TOURISM_LOW, 5);
    expect(TOURISM_HIGH / TOURISM_LOW).toBeGreaterThanOrEqual(2);
    const cafe = place(s, 'solenne', 'cafe');
    const before = inc(s, 'solenne', cafe);
    expect(toggleOffshore(s, true).ok).toBe(false);
    place(s, 'verano', 'offshore');
    expect(toggleOffshore(s, true).ok).toBe(true);
    expect(inc(s, 'solenne', cafe)).toBeGreaterThan(before);
    const heat = s.heat;
    advance(s, 60);
    expect(s.heat).toBeGreaterThan(heat);
  });

  it('Ironhold: union mood erodes with industry and a strike zeroes industrial income', () => {
    const s = newGame('ironhold', 1);
    const shop = place(s, 'ironhold', 'machineshop');
    const mood = s.regions.ironhold.vars.unionMood;
    for (let i = 0; i < 600; i++) mechanicsTick(s, 0.1);
    expect(s.regions.ironhold.vars.unionMood).toBeLessThan(mood);
    expect(inc(s, 'ironhold', shop)).toBeGreaterThan(0);
    s.regions.ironhold.vars.strikeUntil = s.t + 60; s.rev++;
    expect(inc(s, 'ironhold', shop)).toBe(0);
  });

  it('Port Solenne: free-port imports pay no import tariff and transshipping undercuts legal tariffs', () => {
    const s = newGame('amberfield', 1);
    expect(laws(s, 'solenne').importTariff).toBe(0);
    s.cargoLevel = 3;
    const toSolenne = quote(s, 'grain', 100, 'solenne', 'legal');
    expect(toSolenne.importTariff).toBe(0);
    const legal = quote(s, 'grain', 100, 'ironhold', 'legal');
    const trans = quote(s, 'grain', 100, 'ironhold', 'transship');
    expect(trans.importTariff).toBeCloseTo(legal.importTariff * 0.4, 6);
    expect(trans.seconds).toBe(legal.seconds + 40);
    expect(REGION.solenne.government.permanentInfluence).toBe(true);
  });
});
