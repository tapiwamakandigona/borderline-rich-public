import { describe, it, expect } from 'vitest';
import { REGIONS, REGION } from '../src/core/data/regions';
import { EVENTS } from '../src/core/data/events';
import { getCity } from '../src/core/city';
import { newGame } from '../src/core/state';
import { derived } from '../src/core/economy';
import { costIndex, laws } from '../src/core/laws';
import { DAY } from '../src/core/constants';
import { quote } from '../src/core/trade';
import { buyVacant, expeditePermit, managerCost, signWageDeal, toggleOffshore, vacantPrice } from '../src/core/actions';
import { advance } from '../src/core/sim';
import {
  FREE_PORT_CERT, FUEL_MAX, FUEL_MIN, HYPE_MAX, HYPE_MIN, PERMIT_TIER1, PORT_BONUS, PORT_MAX_SHIPS, SEASON_MULT, SIGNATURE_CATEGORY,
  SOLENNE_START_SLOTS, TOURISM_HIGH, TOURISM_LOW, mechanicMult, mechanicsTick, permitWait,
  WAGE_DEAL_MAX, WAGE_DEAL_SHIELD, FRIEND_STANDING, ENEMY_STANDING, favour,
} from '../src/core/mechanics';
import { BIZ, STARTER } from '../src/core/data/businesses';
import { bizCost, demandMult, landPrice, licenceMult, lotValue } from '../src/core/economy';
import { regionFacts, xf } from '../src/core/pitch';
import { ship } from '../src/core/trade';
import type { GameState, RegionId } from '../src/core/types';
import { THEMES } from '../src/world/themes';

/** Put a player business directly on the first vacant lot that allows it. */
function place(s: GameState, r: RegionId, bizId: string, level = 1): string {
  const city = getCity(r);
  const lot = city.lots.find((d) => s.regions[r].lots[d.id].owner === 'vacant' && (d.footprint !== 'small' || BIZ[bizId].tier <= 2))!;
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

  it('every region has its own visual theme (architecture, outskirts, palette)', () => {
    const ids = REGIONS.map((r) => r.id);
    const rgb = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const dist = (a: number, b: number) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));
    for (const id of ids) expect(THEMES[id].id).toBe(id);
    // Architecture and landscape: every region has a unique roof style, window style and outskirts.
    for (const key of ['roofStyle', 'windowStyle', 'outskirts'] as const) {
      expect(new Set(ids.map((id) => THEMES[id][key])).size).toBe(6);
    }
    // Palette: any two regions differ clearly in ground or sky colour (RGB distance > 40).
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = THEMES[ids[i]], b = THEMES[ids[j]];
      const d = Math.max(dist(a.ground, b.ground), dist(a.sky.day.zenith, b.sky.day.zenith), dist(a.walls[0], b.walls[0]));
      expect(d, `${ids[i]} vs ${ids[j]}`).toBeGreaterThan(40);
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

  it('every region opens with its own signature starter business, and the signature rule moves its income', () => {
    for (const R of REGIONS) {
      const b = BIZ[STARTER[R.id]];
      expect(b.tier, R.id).toBe(1);
      expect(b.category, R.id).toBe(SIGNATURE_CATEGORY[R.id]);
      expect(b.regions, R.id).toEqual([R.id]);
      // The starter's category is one the region's economy favours.
      expect(demandMult(R.id, b.category), R.id).toBeGreaterThan(1.1);
    }
    expect(new Set(Object.values(STARTER)).size).toBe(6);
    // Each mechanic reaches the starter (tier 1), not just late-game businesses.
    const s = newGame('solenne', 1);
    const m = (r: RegionId, set: () => void) => { set(); s.rev++; return mechanicMult(s, r, SIGNATURE_CATEGORY[r], 'player', Math.floor(s.t)); };
    expect(m('neonvale', () => { s.regions.neonvale.vars.hype = HYPE_MAX; }) / m('neonvale', () => { s.regions.neonvale.vars.hype = HYPE_MIN; })).toBeGreaterThan(1.5);
    expect(m('redmesa', () => { s.regions.redmesa.vars.fuelIndex = FUEL_MAX; }) / m('redmesa', () => { s.regions.redmesa.vars.fuelIndex = FUEL_MIN; })).toBeGreaterThan(1.5);
    expect(m('amberfield', () => { s.t = 2 * DAY + 1; }) / m('amberfield', () => { s.t = 3 * DAY + 1; })).toBeGreaterThan(2);
    expect(m('verano', () => { s.t = 1; }) / m('verano', () => { s.t = 2 * DAY + 1; })).toBeGreaterThan(1.5);
    expect(m('ironhold', () => { s.regions.ironhold.vars.strikeUntil = s.t + 50; })).toBe(0);
    s.regions.ironhold.vars.strikeUntil = 0;
    expect(m('solenne', () => { s.shipments = []; })).toBe(1);
  });

  it('region cards: prose makes no numeric claims; every number comes from the live rules', () => {
    for (const R of REGIONS) {
      for (const text of [R.signature.summary, ...R.pros, ...R.cons]) expect(text, `${R.id}: "${text}"`).not.toMatch(/[×%]|\d/);
      const facts = regionFacts(R.id);
      expect(facts.length, R.id).toBeGreaterThanOrEqual(4);
      const demand = facts.find((f) => f.label.endsWith('demand'))!;
      expect(demand.value, R.id).toBe(xf(demandMult(R.id, SIGNATURE_CATEGORY[R.id])));
      expect(facts[0].value, R.id).toBe(BIZ[STARTER[R.id]].name);
    }
    const val = (r: RegionId, label: string) => regionFacts(r).find((f) => f.label === label)!.value;
    expect(val('neonvale', 'Hype on tech & services')).toBe(`${xf(HYPE_MIN)} – ${xf(HYPE_MAX)}`);
    expect(val('amberfield', 'Farm seasons')).toBe(SEASON_MULT.map(xf).join(' → '));
    expect(val('verano', 'Tourist seasons')).toBe(`${xf(TOURISM_HIGH)} high / ${xf(TOURISM_LOW)} low`);
    expect(val('redmesa', 'Fuel index on energy')).toBe(`${xf(FUEL_MIN)} – ${xf(FUEL_MAX)}`);
    const s = newGame('redmesa', 1);
    expect(val('redmesa', 'Permit wait')).toContain(`~${permitWait(s)} s`);
  });

  it('Port Solenne: a Solenne trader gets export certificates, a port bonus while ships move, and two slots', () => {
    const s = newGame('solenne', 1);
    expect(s.shipSlots).toBe(SOLENNE_START_SLOTS);
    expect(newGame('ironhold', 1).shipSlots).toBe(1);
    s.cash = 1e6;
    const legal = quote(s, 'textiles', 20, 'ironhold', 'legal');
    s.currentRegion = 'amberfield';
    const fromElsewhere = quote(s, 'textiles', 20, 'ironhold', 'legal');
    s.currentRegion = 'solenne';
    expect(legal.importTariff / legal.value).toBeCloseTo((fromElsewhere.importTariff / fromElsewhere.value) * FREE_PORT_CERT, 6);
    const stall = place(s, 'solenne', 'cratestall');
    const base = inc(s, 'solenne', stall);
    expect(ship(s, 'textiles', 20, 'ironhold', 'legal').ok).toBe(true);
    expect(inc(s, 'solenne', stall) / base).toBeCloseTo(1 + PORT_BONUS, 6);
    expect(ship(s, 'seafood', 20, 'neonvale', 'legal').ok).toBe(true);
    expect(inc(s, 'solenne', stall) / base).toBeCloseTo(1 + 2 * PORT_BONUS, 6);
    expect(PORT_MAX_SHIPS).toBeGreaterThanOrEqual(2);
  });

  it('Red Mesa: every new business needs a permit except the Fuel Pump; street stalls wait less', () => {
    const s = newGame('redmesa', 1);
    s.cash = 1e6;
    s.t = 137.4; // mid-game clock: "no permit" must mean no wait at all, not "until now"
    const smalls = getCity('redmesa').lots.filter((d) => s.regions.redmesa.lots[d.id].owner === 'vacant' && d.footprint === 'small');
    expect(buyVacant(s, 'redmesa', smalls[0].id, 'fuelpump').ok).toBe(true);
    expect(s.regions.redmesa.lots[smalls[0].id].permitUntil).toBe(0);
    expect(inc(s, 'redmesa', smalls[0].id)).toBeGreaterThan(0);
    expect(buyVacant(s, 'redmesa', smalls[1].id, 'cart').ok).toBe(true);
    const wait = s.regions.redmesa.lots[smalls[1].id].permitUntil - s.t;
    expect(wait).toBeGreaterThan(20);
    expect(wait).toBeCloseTo(permitWait(s) * PERMIT_TIER1, 0);
  });

  it('Ironhold: wage deals cost real money, escalate, cap out, and only slow the union down', () => {
    const s = newGame('ironhold', 2);
    s.nextEventAt = 1e12; s.timers.churn = 1e12;
    for (const r of Object.values(s.rivals)) r.nextActAt = 1e12;
    for (let k = 0; k < 10; k++) place(s, 'ironhold', 'machineshop', 5);
    expect(signWageDeal(s).ok).toBe(false); // broke: the union wants money up front
    s.cash = 1e7;
    const costs: number[] = [];
    for (let k = 0; k < 3; k++) { const c0 = s.cash; expect(signWageDeal(s).ok).toBe(true); costs.push(c0 - s.cash); }
    expect(costs[0]).toBeGreaterThan(0);
    expect(costs[2]).toBeGreaterThan(costs[0]);
    expect(signWageDeal(s).ok).toBe(false); // ceiling
    let struck = false;
    for (let m = 0; m < 40 && !struck; m++) { advance(s, 60); struck = s.regions.ironhold.vars.strikeUntil > 0 || s.notices.some((n) => n.text.startsWith('STRIKE')); }
    expect(struck).toBe(true); // three maxed-out deals delay strikes; they don't switch them off
    expect(WAGE_DEAL_MAX * WAGE_DEAL_SHIELD).toBeLessThan(0.5);
  });

  it('standing with the party in power matters in every region (tax, customs, Red Mesa permits)', () => {
    for (const R of REGIONS) {
      const s = newGame(R.id, 3);
      const lot = place(s, R.id, STARTER[R.id]);
      const rs = s.regions[R.id];
      const ruling = rs.ruling;
      const net0 = inc(s, R.id, lot);
      rs.factions[ruling].standing = FRIEND_STANDING; s.rev++;
      expect(favour(s, R.id), R.id).toBe('friend');
      expect(inc(s, R.id, lot), R.id).toBeGreaterThan(net0);
      rs.factions[ruling].standing = ENEMY_STANDING; s.rev++;
      expect(favour(s, R.id), R.id).toBe('enemy');
      expect(inc(s, R.id, lot), R.id).toBeLessThan(net0);
    }
    // Customs: smuggling into a region whose rulers hate you is riskier.
    const s = newGame('amberfield', 3);
    s.cargoLevel = 3;
    const r0 = quote(s, 'grain', 50, 'ironhold', 'smuggle').risk;
    s.regions.ironhold.factions[s.regions.ironhold.ruling].standing = -40;
    expect(quote(s, 'grain', 50, 'ironhold', 'smuggle').risk).toBeGreaterThan(r0);
    // Red Mesa: refusing the governor's nephew (standing -15 twice) makes permits slower.
    const t = newGame('redmesa', 3);
    const w0 = permitWait(t, 'gasstation');
    t.regions.redmesa.factions.circle.standing = -30;
    expect(permitWait(t, 'gasstation')).toBeGreaterThan(w0);
  });

  it('Neon Vale: street carts need a vendor medallion, so phone repair is the cheaper opener', () => {
    const s = newGame('neonvale', 1);
    const smalls = getCity('neonvale').lots.filter((d) => d.footprint === 'small' && s.regions.neonvale.lots[d.id].owner === 'vacant');
    expect(smalls.length).toBeGreaterThan(0);
    for (const d of smalls) expect(vacantPrice(s, 'neonvale', d.id, 'cart'), d.id).toBeGreaterThan(vacantPrice(s, 'neonvale', d.id, 'repairstall'));
    // Only the licensed business pays: the same cart costs list price in every other region.
    const list = (r: RegionId, biz: string) => BIZ[biz].baseCost * costIndex(r) * laws(newGame(r, 1), r).costMod;
    expect(licenceMult('neonvale', 'cart')).toBeGreaterThan(2);
    expect(bizCost(s, 'neonvale', BIZ.cart) / list('neonvale', 'cart')).toBeCloseTo(licenceMult('neonvale', 'cart'), 2);
    expect(Math.abs(bizCost(s, 'neonvale', BIZ.repairstall) - list('neonvale', 'repairstall'))).toBeLessThanOrEqual(0.5);
    for (const R of REGIONS) if (R.id !== 'neonvale') expect(Math.abs(bizCost(newGame(R.id, 1), R.id, BIZ.cart) - list(R.id, 'cart')), R.id).toBeLessThanOrEqual(0.5);
    // The medallion is part of what the lot is worth, but a manager's wage follows the business.
    s.cash = 1e6;
    expect(buyVacant(s, 'neonvale', smalls[0].id, 'cart').ok).toBe(true);
    expect(Math.abs(managerCost(s, 'neonvale', smalls[0].id) - 2 * list('neonvale', 'cart'))).toBeLessThanOrEqual(1);
    expect(lotValue(s, 'neonvale', smalls[0].id)).toBeGreaterThan(landPrice(s, 'neonvale', smalls[0]) + list('neonvale', 'cart'));
    // The region card states the rule from the live data.
    expect(regionFacts('neonvale').find((f) => f.label === 'Vendor medallion')?.value).toBe(`${BIZ.cart.name} ${xf(licenceMult('neonvale', 'cart'))} to open`);
  });
});

