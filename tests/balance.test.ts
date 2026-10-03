// Balance runs the REAL sim with a scripted player (tests/helpers/bot.ts).
import { describe, it, expect } from 'vitest';
import { newGame } from '../src/core/state';
import { REGIONS, REGION } from '../src/core/data/regions';
import { netWorth } from '../src/core/economy';
import { money } from '../src/core/format';
import { runBot } from './helpers/bot';
import type { RegionId } from '../src/core/types';

describe('F4 start from zero', () => {
  it('first business: every region starts at $0 and a 4-taps/s player opens a business in 10-90 s', () => {
    for (const R of REGIONS) {
      const s = newGame(R.id, 11);
      expect(s.cash, R.id).toBe(0);
      const log = runBot(s, 120, { tapsPerSec: 4 });
      expect(log.firstBizAt, R.id).not.toBeNull();
      expect(log.firstBizAt!, R.id).toBeGreaterThanOrEqual(10);
      expect(log.firstBizAt!, R.id).toBeLessThanOrEqual(90);
    }
  });
});

describe('F17 balance pacing (45 simulated minutes)', () => {
  const results = {} as Record<RegionId, number>;
  for (const R of REGIONS) {
    it(`${R.name}: net worth lands in $50K-$50M with no NaN or negative cash`, () => {
      const s = newGame(R.id, 21);
      const log = runBot(s, 45 * 60, { tapsPerSec: 4 });
      const nw = netWorth(s);
      results[R.id] = nw;
      console.log(`[balance] ${R.id.padEnd(10)} nw=${money(nw).padStart(8)} biz=${s.stats.bizBought} rank=${s.stats.rankIndex} firstBiz=${log.firstBizAt?.toFixed(1)}s events=${Object.keys(s.eventsSeen).length}`);
      expect(log.nanSeen).toBe(false);
      expect(log.minCash).toBeGreaterThanOrEqual(0);
      expect(nw).toBeGreaterThanOrEqual(50_000);
      expect(nw).toBeLessThanOrEqual(50_000_000);
    });
  }
  it('the easy region outpaces the expert region in purchasing-power terms (net worth / cost index)', () => {
    const easy = results.amberfield / REGION.amberfield.economy.costIndex;
    const expert = results.neonvale / REGION.neonvale.economy.costIndex;
    expect(easy).toBeGreaterThan(expert);
  });
});
