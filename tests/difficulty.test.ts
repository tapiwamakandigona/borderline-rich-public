// Region identity + difficulty, measured with the REAL sim and the balance bot (critic findings #2, #11):
// (a) after 20 minutes each region's empire is built around its signature category, not the same
//     carts-and-kiosks everywhere; (b) the difficulty stars predict how fast you get rich
//     (purchasing-power net worth = net worth / cost index; geometric mean over seeds).
import { describe, it, expect } from 'vitest';
import { newGame } from '../src/core/state';
import { REGIONS, REGION } from '../src/core/data/regions';
import { BIZ } from '../src/core/data/businesses';
import { netWorth } from '../src/core/economy';
import { SIGNATURE_CATEGORY } from '../src/core/mechanics';
import { money } from '../src/core/format';
import { runBot } from './helpers/bot';
import type { RegionId } from '../src/core/types';

// Eight seeds, not three: the sim is chaotic (early luck compounds ~10x), and a 3-seed geometric mean
// flipped the Ironhold/Neon Vale verdict on noise after T12a (geometric-mean ratio with seeds 21/7/99:
// 1.16x; with all 8: 1.75x; the test needs > 1.25x).
const SEEDS = [21, 7, 99, 3, 5, 11, 42, 77];
const pp = {} as Record<RegionId, number[]>;
const share = {} as Record<RegionId, number[]>;

describe('region identity and difficulty (30 simulated minutes x 8 seeds per region)', () => {
  for (const R of REGIONS) {
    it(`${R.name}: plays around its signature`, () => {
      pp[R.id] = []; share[R.id] = [];
      for (const seed of SEEDS) {
        const s = newGame(R.id, seed);
        runBot(s, 20 * 60, { tapsPerSec: 4 });
        const mine = Object.values(s.regions[R.id].lots).filter((l) => l.owner === 'player' && l.biz);
        share[R.id].push(mine.filter((l) => BIZ[l.biz!].category === SIGNATURE_CATEGORY[R.id]).length / mine.length);
        runBot(s, 10 * 60, { tapsPerSec: 4 });
        pp[R.id].push(netWorth(s) / R.economy.costIndex);
      }
      console.log(`[difficulty] ${R.id.padEnd(10)} ${'★'.repeat(R.difficulty).padEnd(4)} pp@30m ${pp[R.id].map((v) => money(v)).join(' / ')} | ${SIGNATURE_CATEGORY[R.id]} share@20m ${share[R.id].map((v) => Math.round(v * 100) + '%').join(' / ')}`);
      // (a) the signature category is a big part of every 20-minute empire
      for (const v of share[R.id]) expect(v).toBeGreaterThanOrEqual(0.25);
    });
  }

  it('fewer difficulty stars always means a richer region (pairwise, geometric means, 25 % margin)', () => {
    const geo = (a: number[]) => Math.exp(a.reduce((x, v) => x + Math.log(v), 0) / a.length);
    for (const A of REGIONS) for (const B of REGIONS) {
      if (A.difficulty >= B.difficulty) continue;
      expect(geo(pp[A.id]), `${A.id} (${A.difficulty}★) vs ${B.id} (${B.difficulty}★)`).toBeGreaterThan(geo(pp[B.id]) * 1.25);
    }
    expect(REGION.amberfield.difficulty).toBe(1);
    expect(REGION.neonvale.difficulty).toBe(4);
  });
});
