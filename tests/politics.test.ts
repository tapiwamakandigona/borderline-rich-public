import { describe, it, expect } from 'vitest';
import { newGame } from '../src/core/state';
import { laws } from '../src/core/laws';
import { buyGuildSeat, guildSeatCost, politicalAction, runElection, winChances } from '../src/core/politics';
import { derived } from '../src/core/economy';
import { getCity } from '../src/core/city';
import { REGION } from '../src/core/data/regions';
import { DAY } from '../src/core/constants';
import { advance } from '../src/core/sim';
import type { GameState } from '../src/core/types';

const quiet = (s: GameState) => { s.nextEventAt = 1e12; s.timers.churn = 1e12; for (const r of Object.values(s.rivals)) r.nextActAt = 1e12; };

describe('F7 politics', () => {
  it('the ruling faction\'s platform sets the laws', () => {
    const s = newGame('solenne', 1);
    s.regions.solenne.ruling = 'freetraders';
    expect(laws(s, 'solenne')).toMatchObject({ importTariff: 0, exportTariff: 0, incomeTax: 0.1, enforcement: 0.3 });
    s.regions.solenne.ruling = 'dockhands';
    expect(laws(s, 'solenne')).toMatchObject({ minWage: 1.3, incomeTax: 0.17, enforcement: 0.6 });
  });

  it('changing the government changes business income (Amberfield farm subsidies)', () => {
    const s = newGame('amberfield', 1);
    const lot = getCity('amberfield').lots.find((d) => s.regions.amberfield.lots[d.id].owner === 'vacant')!;
    Object.assign(s.regions.amberfield.lots[lot.id], { owner: 'player', biz: 'farmstand', level: 5, manager: true });
    s.t = DAY + 1;
    s.regions.amberfield.ruling = 'farmers'; s.rev++;
    const farmers = derived(s, true).lots.amberfield[lot.id].net;
    s.regions.amberfield.ruling = 'agricorp'; s.rev++;
    const agricorp = derived(s, true).lots.amberfield[lot.id].net;
    const F = REGION.amberfield.factions;
    const pf = F.find((f) => f.id === 'farmers')!.platform;
    const pa = F.find((f) => f.id === 'agricorp')!.platform;
    const u = 0.12 * REGION.amberfield.economy.wageIndex * REGION.amberfield.baseLaws.minWage;
    const expected = (pf.categoryMods!.agri! * (1 - pf.incomeTax! - u)) / (pa.categoryMods!.agri! * (1 - pa.incomeTax! - u));
    expect(farmers / agricorp).toBeCloseTo(expected, 6);
    expect(Math.abs(farmers / agricorp - 1)).toBeGreaterThan(0.03);
  });

  it('donations raise a party\'s odds until the vote, then reset', () => {
    const s = newGame('neonvale', 1);
    s.cash = 1e7;
    const before = winChances(s, 'neonvale').housing;
    expect(politicalAction(s, 'neonvale', 'housing', 500_000).ok).toBe(true);
    const after = winChances(s, 'neonvale').housing;
    expect(after).toBeGreaterThan(before + 0.05);
    expect(s.regions.neonvale.factions.housing.standing).toBeGreaterThan(0);
    runElection(s, 'neonvale');
    expect(s.regions.neonvale.factions.housing.donated).toBe(0);
    expect(winChances(s, 'neonvale').housing).toBeLessThan(after);
  });

  it('Solenne guild seats are permanent, escalate in price, and survive elections', () => {
    const s = newGame('solenne', 1);
    s.cash = 1e8;
    expect(politicalAction(s, 'solenne', 'freetraders', 10_000).ok).toBe(false);
    const c1 = guildSeatCost(s);
    const before = winChances(s, 'solenne').freetraders;
    expect(buyGuildSeat(s, 'freetraders').ok).toBe(true);
    expect(guildSeatCost(s)).toBeGreaterThan(c1);
    buyGuildSeat(s, 'freetraders');
    const after = winChances(s, 'solenne').freetraders;
    expect(after).toBeGreaterThan(before);
    for (let i = 0; i < 3; i++) runElection(s, 'solenne');
    expect(s.regions.solenne.factions.freetraders.seats).toBe(2);
  });

  it('Red Mesa elections are rigged toward the incumbent and gifts raise heat', () => {
    const s = newGame('redmesa', 1);
    expect(s.regions.redmesa.ruling).toBe('circle');
    expect(winChances(s, 'redmesa').circle).toBeGreaterThan(0.7);
    s.cash = 1e7;
    politicalAction(s, 'redmesa', 'circle', 10_000);
    expect(s.heat).toBe(REGION.redmesa.government.actionHeat);
  });

  it('gifting under a Reform government eventually triggers a scandal', () => {
    const s = newGame('redmesa', 5);
    s.cash = 1e9;
    s.regions.redmesa.ruling = 'reform';
    for (let i = 0; i < 25; i++) politicalAction(s, 'redmesa', 'circle', 10_000);
    expect(s.rep).toBeLessThan(0);
    expect(s.notices.some((n) => n.text.startsWith('Scandal!'))).toBe(true);
  });

  it('elections run on each region\'s own schedule', () => {
    const s = newGame('amberfield', 1);
    quiet(s);
    const nv = s.regions.neonvale.nextElectionAt;
    const am = s.regions.amberfield.nextElectionAt;
    expect(nv).toBeLessThan(am);
    advance(s, nv + 1);
    expect(s.regions.neonvale.nextElectionAt).toBeGreaterThan(nv);
    expect(s.regions.amberfield.nextElectionAt).toBe(am);
    expect(s.notices.some((n) => n.kind === 'politics' && n.text.startsWith('Neon Vale'))).toBe(true);
  });
});
