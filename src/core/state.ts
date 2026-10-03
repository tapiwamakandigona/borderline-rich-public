// New-game construction. Every region and rival exists from the start (other regions are
// locked for expansion but their economies, politics and rivals keep running).
import type { FactionState, GameState, GoodId, LotState, RegionId, RegionState } from './types';
import { REGION, REGIONS } from './data/regions';
import { BIZ, GOODS } from './data/businesses';
import { getCity } from './city';
import { allowedBiz, bizValue, landPrice } from './economy';
import { int, next, pick, range, weighted } from './rng';
import { DAY, SAVE_VERSION } from './constants';
import { SOLENNE_START_SLOTS } from './mechanics';
import { startingRuler } from './laws';

const lot = (owner: string, biz: string | null = null, level = 0): LotState => ({
  owner, biz, level, till: 0, manager: false, invested: 0, permitUntil: 0, frozenUntil: 0,
});

export function anchorPrice(regionId: RegionId, good: GoodId): number {
  const R = REGION[regionId];
  const g = GOODS.find((x) => x.id === good)!;
  return g.base * (R.produces.includes(good) ? 0.72 : R.demands.includes(good) ? 1.38 : 1);
}

/** Share of a rival's designed size (RivalDef.startWorth) that starts out as businesses; the rest is cash. */
export const RIVAL_START_HOLDINGS = 0.6;
/** No rival business starts above this level. */
export const RIVAL_START_MAX_LEVEL = 25;

/** Lots, businesses and cash for a region's rivals, sized from their design: each rival's net worth at
 *  t = 0 is its startWorth, so the biggest rival on paper is the biggest in the game and the Rich List
 *  starts as a race you can join (critic evaluation #2, finding 2). Rivals pick the lots that suit
 *  their focus best, then the biggest focus business their per-lot budget covers, levelled up to it.
 *  Returns what each rival spent; the rest of its startWorth is its cash. */
function seedRivals(s: GameState, regionId: RegionId): Record<string, number> {
  const R = REGION[regionId];
  const city = getCity(regionId);
  const lots = s.regions[regionId].lots;
  const spent: Record<string, number> = {};
  for (const rd of R.rivals) {
    spent[rd.id] = 0;
    const perLot = (rd.startWorth * RIVAL_START_HOLDINGS) / rd.startLots;
    const free = city.lots.filter((d) => lots[d.id].owner === 'vacant');
    const scored = free.map((d) => {
      const dist = R.districts.find((x) => x.id === d.district)!;
      const fit = Math.max(...rd.focus.map((c) => dist.fit[c] ?? 1));
      const big = d.footprint === 'small' ? 0 : d.footprint === 'medium' ? 0.35 : 0.6;
      return { d, score: fit + big + next(s) * 0.5 };
    }).sort((a, b) => b.score - a.score);
    let placed = 0;
    for (const { d } of scored) {
      if (placed >= rd.startLots) break;
      const cap = perLot * range(s, 0.75, 1.25);
      const land = landPrice(s, regionId, d);
      const focus = allowedBiz(regionId, d).filter((b) => rd.focus.includes(b.category));
      const fits = (focus.length ? focus : allowedBiz(regionId, d)).filter((b) => land + bizValue(s, regionId, b, 1) <= cap);
      if (!fits.length) continue;
      const top = Math.max(...fits.map((b) => b.tier));
      const b = pick(s, fits.filter((x) => x.tier === top));
      let level = 1;
      while (level < RIVAL_START_MAX_LEVEL && land + bizValue(s, regionId, b, level + 1) <= cap) level++;
      lots[d.id] = lot(rd.id, b.id, level);
      spent[rd.id] += land + bizValue(s, regionId, b, level);
      placed++;
    }
  }
  return spent;
}

/** NPC businesses on the lots rivals left, then guarantee ≥ 6 vacant small lots for starters. */
function seedNpcs(s: GameState, regionId: RegionId): void {
  const R = REGION[regionId];
  const city = getCity(regionId);
  const lots = s.regions[regionId].lots;
  for (const def of city.lots) {
    if (lots[def.id].owner !== 'vacant') continue;
    const vacancy = R.layout.vacancy + (def.footprint === 'small' ? 0.1 : 0);
    if (next(s) < vacancy) continue;
    const dist = R.districts.find((x) => x.id === def.district)!;
    const b = weighted(s, allowedBiz(regionId, def), (x) => (dist.fit[x.category] ?? 1) / x.tier);
    lots[def.id] = lot('npc', b.id, int(s, 1, 10));
  }
  const smallVacant = () => city.lots.filter((d) => d.footprint === 'small' && lots[d.id].owner === 'vacant').length;
  for (const def of city.lots) {
    if (smallVacant() >= 6) break;
    if (def.footprint === 'small' && lots[def.id].owner === 'npc') lots[def.id] = lot('vacant');
  }
}

function initRegion(s: GameState, regionId: RegionId, home: RegionId, index: number): RegionState {
  const R = REGION[regionId];
  const city = getCity(regionId);
  const lots: Record<string, LotState> = {};
  for (const def of city.lots) lots[def.id] = def.civic ? lot('civic') : lot('vacant');
  // Rivals and NPC businesses move in once every region exists (seedRivals prices lots with the region's laws).

  const factions: Record<string, FactionState> = {};
  for (const f of R.factions) factions[f.id] = { popularity: f.basePopularity, standing: 0, donated: 0, seats: 0 };
  const ruling = startingRuler(regionId);
  const market = {} as Record<GoodId, number>;
  for (const g of GOODS) market[g.id] = anchorPrice(regionId, g.id) * range(s, 0.92, 1.08);

  return {
    id: regionId,
    unlocked: regionId === home,
    lots,
    factions,
    ruling,
    nextElectionAt: R.government.electionEveryDays * DAY + index * 17,
    market,
    vars: { hype: 1.1, fuelIndex: 1, unionMood: 70, strikeUntil: 0, offshore: false, vcShare: 0, vcUntil: 0, insuredUntil: 0, wageDeal: 0 },
  };
}

export function newGame(home: RegionId, seed = 12345): GameState {
  const s = {
    version: SAVE_VERSION, seed, rng: seed | 0, t: 0, rev: 0,
    homeRegion: home, currentRegion: home,
    cash: 0, gold: 0, heat: 0, rep: 0,
    hustle: { level: 0, combo: 0, lastTapAt: -10 },
    vehicle: 'foot', vehiclesOwned: ['foot'], paint: null,
    regions: {} as GameState['regions'],
    rivals: {},
    shipments: [], shipSlots: 1, cargoLevel: 0, nextShipId: 1,
    buffs: [], pendingEvent: null, nextEventAt: 70, eventsSeen: {},
    goalIndex: 0,
    stats: { earned: 0, hustles: 0, collects: 0, shipments: 0, smuggled: 0, caught: 0, bizBought: 0, rivalLotsBought: 0, acquisitions: 0, donations: 0, peakNetWorth: 0, rankIndex: 0 },
    entitlements: { doubleIncome: false, nightShift: false, starterPack: false },
    processedTx: [],
    accountant: false, broker: false,
    notices: [], nextNoticeId: 1, lastSeenWall: 0,
    timers: { market: 15, churn: 30 },
  } as GameState;
  if (home === 'solenne') s.shipSlots = SOLENNE_START_SLOTS;
  REGIONS.forEach((R, i) => { s.regions[R.id] = initRegion(s, R.id, home, i); });
  const spent: Record<string, number> = {};
  REGIONS.forEach((R) => { Object.assign(spent, seedRivals(s, R.id)); seedNpcs(s, R.id); });
  REGIONS.forEach((R) => R.rivals.forEach((rd, k) => {
    s.rivals[rd.id] = { id: rd.id, regionId: R.id, cash: rd.startWorth - spent[rd.id], acquired: false, nextActAt: 8 + k * 2.3, lastAction: 'Watching the newcomer.' };
  }));
  return s;
}

export const bizName = (bizId: string | null) => (bizId ? BIZ[bizId].name : 'Empty lot');
