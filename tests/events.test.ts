import { describe, it, expect } from 'vitest';
import { newGame } from '../src/core/state';
import { EVENTS, EVENT } from '../src/core/data/events';
import { REGIONS } from '../src/core/data/regions';
import { eventScale, eventView, resolveEvent, trigger } from '../src/core/events';
import { getCity } from '../src/core/city';
import { runBot } from './helpers/bot';

describe('F9 events with risky choices', () => {
  it('has at least 8 global and 6 per-region events, all well-formed', () => {
    expect(EVENTS.filter((e) => e.region === 'global' && !e.system).length).toBeGreaterThanOrEqual(8);
    for (const R of REGIONS) expect(EVENTS.filter((e) => e.region === R.id && !e.system).length, R.id).toBeGreaterThanOrEqual(6);
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
    for (const e of EVENTS) {
      expect(e.choices.length, e.id).toBeGreaterThanOrEqual(2);
      for (const c of e.choices) {
        expect(!!c.outcome !== !!c.risk, `${e.id}: exactly one of outcome/risk`).toBe(true);
        if (c.risk) { expect(c.risk.p).toBeGreaterThan(0); expect(c.risk.p).toBeLessThan(1); }
      }
    }
    const risky = EVENTS.filter((e) => e.choices.some((c) => c.risk)).length;
    expect(risky).toBeGreaterThanOrEqual(20);
  });

  it('amounts scale with the player\'s income', () => {
    const s = newGame('solenne', 2);
    const small = eventScale(s, 'solenne');
    expect(small).toBe(60);
    const lot = getCity('solenne').lots.find((d) => s.regions.solenne.lots[d.id].owner === 'vacant' && d.footprint !== 'small')!;
    Object.assign(s.regions.solenne.lots[lot.id], { owner: 'player', biz: 'hotel', level: 40, manager: true });
    s.rev++;
    expect(eventScale(s, 'solenne')).toBeGreaterThan(small * 100);
  });

  it('outcomes apply exactly: the charity gala costs 0.8 S and gives +10 rep', () => {
    const s = newGame('solenne', 2);
    s.cash = 10_000;
    trigger(s, 'gala', 'solenne');
    const S = Number(s.pendingEvent!.vars.S);
    const v = eventView(s)!;
    expect(v.choices[0].preview).toContain('−$');
    expect(resolveEvent(s, 0).ok).toBe(true);
    expect(s.cash).toBe(10_000 - Math.round(0.8 * S));
    expect(s.rep).toBe(10);
    expect(s.pendingEvent).toBeNull();
  });

  it('risky choices preview both branches and are seeded', () => {
    const run = () => {
      const s = newGame('verano', 99);
      s.cash = 1e5;
      trigger(s, 've_hurricane', 'verano');
      const view = eventView(s)!;
      expect(view.choices[1].risky).toBe(true);
      expect(view.choices[1].preview).toMatch(/55%: .* · 45%: /);
      return resolveEvent(s, 1).won;
    };
    expect(run()).toBe(run());
  });

  it('special outcomes work: selling to a rival and Ironhold wage deals', () => {
    const s = newGame('verano', 4);
    const lot = getCity('verano').lots.find((d) => s.regions.verano.lots[d.id].owner === 'vacant')!;
    Object.assign(s.regions.verano.lots[lot.id], { owner: 'player', biz: 'cafe', level: 3, till: 50 });
    trigger(s, 'rival_offer', 'verano', { rival: 'Azure Crown Resorts', rivalId: 'azure', lotId: lot.id, biz: 'Café', price: 99_999 });
    resolveEvent(s, 0);
    expect(s.regions.verano.lots[lot.id].owner).toBe('azure');
    expect(s.cash).toBe(99_999 + 50);
    const t = newGame('ironhold', 4);
    const mood = t.regions.ironhold.vars.unionMood;
    trigger(t, 'ih_raise', 'ironhold');
    resolveEvent(t, 0);
    expect(t.regions.ironhold.vars.wageDeal).toBeCloseTo(0.05, 9);
    expect(t.regions.ironhold.vars.unionMood).toBe(Math.min(100, mood + 25));
  });

  it('a played session encounters a steady stream of events', () => {
    const s = newGame('solenne', 12);
    runBot(s, 1800, { tapsPerSec: 4 });
    const seen = Object.keys(s.eventsSeen).filter((id) => !EVENT[id].system || id !== 'raid');
    expect(seen.length).toBeGreaterThanOrEqual(6);
  });
});
