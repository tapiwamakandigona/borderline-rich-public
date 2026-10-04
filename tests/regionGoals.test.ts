// T12e (critic #2 finding 8): each home region's first goals teach its signature mechanic.
import { describe, it, expect } from 'vitest';
import { newGame } from '../src/core/state';
import { GOALS, REGION_GOALS, goalsFor } from '../src/core/data/progression';
import { REGION_IDS } from '../src/core/data/regions';
import { STARTER, BIZ } from '../src/core/data/businesses';
import { SIGNATURE_CATEGORY } from '../src/core/mechanics';
import { progressCheck } from '../src/core/sim';
import { signWageDeal } from '../src/core/actions';
import { getCity } from '../src/core/city';

describe('T12e region goal chains', () => {
  it('every region weaves its two signature goals into the opening (after collect, after level 5)', () => {
    const texts = new Set<string>();
    for (const id of REGION_IDS) {
      const c = goalsFor(id);
      expect(c.length).toBe(GOALS.length + 2);
      expect(c.map((g) => g.id).indexOf(REGION_GOALS[id][0].id)).toBe(GOALS.findIndex((g) => g.id === 'collect') + 1);
      expect(c.map((g) => g.id).indexOf(REGION_GOALS[id][1].id)).toBe(GOALS.findIndex((g) => g.id === 'level5') + 2);
      for (const g of REGION_GOALS[id]) texts.add(g.text);
      // A fresh game has not done either yet.
      const s = newGame(id, 1);
      for (const g of REGION_GOALS[id]) expect(g.check(s), `${id} ${g.id}`).toBe(false);
      // The region starter belongs to the category the first goal asks for.
      expect(BIZ[STARTER[id]].category).toBe(SIGNATURE_CATEGORY[id]);
    }
    expect(texts.size).toBe(12); // six regions, twelve different goals
  });

  it('two starters complete the first signature goal and pay its reward', () => {
    for (const id of REGION_IDS) {
      const s = newGame(id, 1);
      const lots = getCity(id).lots.filter((l) => s.regions[id].lots[l.id].owner === 'vacant' && l.footprint === 'small').slice(0, 2);
      for (const l of lots) Object.assign(s.regions[id].lots[l.id], { owner: 'player', biz: STARTER[id], level: 1 });
      expect(REGION_GOALS[id][0].check(s), id).toBe(true);
      s.goalIndex = goalsFor(id).findIndex((g) => g.id === REGION_GOALS[id][0].id);
      progressCheck(s);
      expect(s.goalIndex, id).toBeGreaterThan(goalsFor(id).findIndex((g) => g.id === REGION_GOALS[id][0].id));
    }
  });

  it('Ironhold: signing a wage deal completes its signature goal', () => {
    const s = newGame('ironhold', 1);
    s.cash = 1e6;
    expect(signWageDeal(s).ok).toBe(true);
    expect(REGION_GOALS.ironhold[1].check(s)).toBe(true);
  });
});
