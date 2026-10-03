import { describe, it, expect } from 'vitest';
import { newGame } from '../src/core/state';
import { quote, ship, resolveShipment } from '../src/core/trade';
import { laws } from '../src/core/laws';
import { GOOD } from '../src/core/data/businesses';
import { REGION } from '../src/core/data/regions';
import { advance } from '../src/core/sim';
import type { GameState, Shipment } from '../src/core/types';

function setup(): GameState {
  const s = newGame('amberfield', 31);
  s.cash = 1e7;
  s.cargoLevel = 4;
  s.nextEventAt = 1e12;
  s.timers.churn = 1e12;
  for (const r of Object.values(s.rivals)) r.nextActAt = 1e12;
  return s;
}

describe('F6 trade and tariff avoidance', () => {
  it('four methods trade tariff cost against risk exactly as specified', () => {
    const s = setup();
    const V = 100 * s.regions.amberfield.market.grain;
    const tc = GOOD.grain.tariffClass;
    const exp = V * laws(s, 'amberfield').exportTariff * tc;
    const imp = V * laws(s, 'ironhold').importTariff * tc;
    const enf = laws(s, 'ironhold').enforcement;
    const legal = quote(s, 'grain', 100, 'ironhold', 'legal');
    const trans = quote(s, 'grain', 100, 'ironhold', 'transship');
    const under = quote(s, 'grain', 100, 'ironhold', 'undervalue');
    const smug = quote(s, 'grain', 100, 'ironhold', 'smuggle');
    expect(legal.exportTariff).toBeCloseTo(exp, 9);
    expect(legal.importTariff).toBeCloseTo(imp, 9);
    expect(legal.fee).toBeCloseTo(V * 0.03, 9);
    expect(legal.risk).toBe(0);
    expect(trans.importTariff).toBeCloseTo(imp * 0.4, 9);
    expect(trans.fee).toBeCloseTo(V * 0.08, 9);
    expect(trans.risk).toBeCloseTo(0.12 * enf, 9);
    expect(under.exportTariff + under.importTariff).toBeCloseTo((exp + imp) * 0.5, 9);
    expect(under.risk).toBeCloseTo(0.35 * enf, 9);
    expect(smug.exportTariff + smug.importTariff).toBe(0);
    expect(smug.risk).toBeCloseTo(0.1 + 0.45 * enf, 9);
    expect(legal.risk).toBeLessThan(trans.risk);
    expect(trans.risk).toBeLessThan(under.risk);
    expect(under.risk).toBeLessThan(smug.risk);
    expect(smug.upfront).toBeLessThan(legal.upfront);
  });

  it('heat raises risk and a bribe lowers it in corrupt regions', () => {
    const s = setup();
    const base = quote(s, 'grain', 100, 'redmesa', 'smuggle').risk;
    s.heat = 60;
    expect(quote(s, 'grain', 100, 'redmesa', 'smuggle').risk).toBeCloseTo(base + 0.3, 9);
    s.heat = 0;
    const bribed = quote(s, 'grain', 100, 'redmesa', 'smuggle', true);
    expect(bribed.risk).toBeCloseTo(base * (1 - 0.6 * REGION.redmesa.economy.corruption), 9);
    expect(bribed.bribe).toBeGreaterThan(0);
  });

  it('respects fleet capacity and shipping slots', () => {
    const s = setup();
    s.cargoLevel = 0;
    expect(quote(s, 'grain', 21, 'ironhold', 'legal').ok).toBe(false);
    expect(ship(s, 'grain', 20, 'ironhold', 'legal').ok).toBe(true);
    expect(ship(s, 'grain', 20, 'ironhold', 'legal').ok).toBe(false);
  });

  it('a legal shipment arrives on time and sells at the destination price', () => {
    const s = setup();
    const q = quote(s, 'grain', 100, 'ironhold', 'legal');
    const c0 = s.cash;
    expect(ship(s, 'grain', 100, 'ironhold', 'legal').ok).toBe(true);
    expect(c0 - s.cash).toBeCloseTo(q.upfront, 6);
    expect(s.shipments).toHaveLength(1);
    advance(s, q.seconds - 1);
    expect(s.shipments).toHaveLength(1);
    advance(s, 1.5);
    expect(s.shipments).toHaveLength(0);
    expect(s.cash).toBeGreaterThan(c0 - q.upfront);
  });

  const mk = (s: GameState, method: Shipment['method'], risk: number): Shipment => ({
    id: 99, good: 'electronics', qty: 50, from: 'neonvale', to: 'ironhold', method, cost: 10_000,
    value: 50 * s.regions.neonvale.market.electronics, tariffPaid: 0, bribed: false, risk, departAt: 0, arriveAt: 0,
  });

  it('caught smugglers lose the cargo, pay 50 % of value, gain heat and lose reputation', () => {
    const s = setup();
    const sh = mk(s, 'smuggle', 1);
    const c0 = s.cash;
    resolveShipment(s, sh);
    expect(s.cash).toBeCloseTo(c0 - sh.value * 0.5, 6);
    expect(s.heat).toBe(30);
    expect(s.rep).toBe(-10);
    expect(s.stats.caught).toBe(1);
  });

  it('uncaught smuggling sells the goods but still builds a little heat', () => {
    const s = setup();
    const price = s.regions.ironhold.market.electronics;
    const c0 = s.cash;
    resolveShipment(s, mk(s, 'smuggle', 0));
    expect(s.cash).toBeCloseTo(c0 + 50 * price, 6);
    expect(s.heat).toBe(4);
  });

  it('an audited undervalued invoice pays double the evaded tariff and still sells', () => {
    const s = setup();
    const sh = mk(s, 'undervalue', 1);
    const evaded = sh.value * laws(s, 'ironhold').importTariff * GOOD.electronics.tariffClass * 0.5;
    const price = s.regions.ironhold.market.electronics;
    const c0 = s.cash;
    resolveShipment(s, sh);
    expect(s.cash).toBeCloseTo(c0 + 50 * price - 2 * evaded, 6);
    expect(s.heat).toBe(15);
  });

  it('customs rolls are seeded: identical games get identical outcomes', () => {
    const run = () => {
      const s = setup();
      s.heat = 40;
      for (let i = 0; i < 6; i++) {
        resolveShipment(s, mk(s, 'smuggle', 0.5));
      }
      return [s.stats.caught, s.cash, s.heat];
    };
    expect(run()).toEqual(run());
  });

  it('heat decays about 7.5 per minute', () => {
    const s = setup();
    s.heat = 50;
    advance(s, 60);
    expect(s.heat).toBeCloseTo(42.5, 1);
  });
});
