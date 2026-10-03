// New-game construction. Every region and rival exists from the start (other regions are
// locked for expansion but their economies, politics and rivals keep running).
import type { FactionState, GameState, GoodId, LotState, RegionId, RegionState } from './types';
import { REGION, REGIONS } from './data/regions';
import { BIZ, GOODS } from './data/businesses';
import { getCity } from './city';
import { allowedBiz } from './economy';
import { int, next, range, weighted } from './rng';
import { DAY, SAVE_VERSION } from './constants';

const lot = (owner: string, biz: string | null = null, level = 0): LotState => ({
  owner, biz, level, till: 0, manager: false, invested: 0, permitUntil: 0, frozenUntil: 0,
});

export function anchorPrice(regionId: RegionId, good: GoodId): number {
  const R = REGION[regionId];
  const g = GOODS.find((x) => x.id === good)!;
  return g.base * (R.produces.includes(good) ? 0.72 : R.demands.includes(good) ? 1.38 : 1);
}

function initRegion(s: GameState, regionId: RegionId, home: RegionId, index: number): RegionState {
  const R = REGION[regionId];
  const city = getCity(regionId);
  const lots: Record<string, LotState> = {};
  for (const def of city.lots) lots[def.id] = def.civic ? lot('civic') : lot('vacant');

  // Rivals claim lots that suit their focus categories.
  for (const rd of R.rivals) {
    const free = city.lots.filter((d) => lots[d.id].owner === 'vacant');
    const scored = free.map((d) => {
      const dist = R.districts.find((x) => x.id === d.district)!;
      const fit = Math.max(...rd.focus.map((c) => dist.fit[c] ?? 1));
      const big = d.footprint === 'small' ? 0 : d.footprint === 'medium' ? 0.35 : 0.6;
      return { d, score: fit + big + next(s) * 0.5 };
    }).sort((a, b) => b.score - a.score);
    for (const { d } of scored.slice(0, rd.startLots)) {
      const opts = allowedBiz(regionId, d).filter((b) => rd.focus.includes(b.category));
      const pool = opts.length ? opts : allowedBiz(regionId, d);
      const b = weighted(s, pool, (x) => x.tier);
      lots[d.id] = lot(rd.id, b.id, int(s, 4, 18));
    }
  }

  // The rest: NPC businesses or vacant lots.
  for (const def of city.lots) {
    if (lots[def.id].owner !== 'vacant') continue;
    const vacancy = R.layout.vacancy + (def.footprint === 'small' ? 0.1 : 0);
    if (next(s) < vacancy) continue;
    const dist = R.districts.find((x) => x.id === def.district)!;
    const b = weighted(s, allowedBiz(regionId, def), (x) => (dist.fit[x.category] ?? 1) / x.tier);
    lots[def.id] = lot('npc', b.id, int(s, 1, 10));
  }
  // Starters need somewhere to begin: guarantee ≥ 6 vacant small lots.
  const smallVacant = () => city.lots.filter((d) => d.footprint === 'small' && lots[d.id].owner === 'vacant').length;
  for (const def of city.lots) {
    if (smallVacant() >= 6) break;
    if (def.footprint === 'small' && lots[def.id].owner === 'npc') lots[def.id] = lot('vacant');
  }

  const factions: Record<string, FactionState> = {};
  for (const f of R.factions) factions[f.id] = { popularity: f.basePopularity, standing: 0, donated: 0, seats: 0 };
  const ruling = [...R.factions].sort((a, b) => b.basePopularity - a.basePopularity)[0].id;
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
  REGIONS.forEach((R, i) => { s.regions[R.id] = initRegion(s, R.id, home, i); });
  REGIONS.forEach((R) => R.rivals.forEach((rd, k) => {
    s.rivals[rd.id] = { id: rd.id, regionId: R.id, cash: rd.startCash, acquired: false, nextActAt: 8 + k * 2.3, lastAction: 'Watching the newcomer.' };
  }));
  return s;
}

export const bizName = (bizId: string | null) => (bizId ? BIZ[bizId].name : 'Empty lot');
