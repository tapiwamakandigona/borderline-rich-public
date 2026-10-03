// Prices, income and net worth. Pure functions over GameState.
import type { BusinessDef, GameState, LotState, OwnerId, RegionId } from './types';
import { REGION, REGION_IDS } from './data/regions';
import { BIZ, BUSINESSES, FOOTPRINT_LAND, FOOTPRINT_MAX_TIER } from './data/businesses';
import { getCity, type LotDef } from './city';
import { laws, costIndex } from './laws';
import { mechanicMult, taxRate } from './mechanics';
import { MAX_LEVEL, TILL_SECONDS } from './constants';
import { BAL, spread } from './balance';

const GROWTH = BAL.upgradeGrowth;
/** Upkeep added to every player business once the empire passes BAL.overheadFree businesses. */
export const empireOverhead = (owned: number) => Math.min(BAL.overheadCap, BAL.overheadPerBiz * Math.max(0, owned - BAL.overheadFree));
/** Price level of customers: cheap regions also earn less per sale (see BAL.incomeElasticity). */
export const incomeIndex = (regionId: RegionId) => costIndex(regionId) ** BAL.incomeElasticity * (REGION[regionId].economy.spend ?? 1);
export const demandMult = (regionId: RegionId, cat: BusinessDef['category']) => spread(REGION[regionId].economy.demand[cat], BAL.demandSpread);
export function fitMult(regionId: RegionId, district: string, cat: BusinessDef['category']): number {
  const d = REGION[regionId].districts.find((x) => x.id === district);
  return spread(d?.fit[cat] ?? 1, BAL.fitSpread);
}

export function landPrice(state: GameState, regionId: RegionId, lot: LotDef): number {
  const d = REGION[regionId].districts.find((x) => x.id === lot.district)!;
  return Math.round(FOOTPRINT_LAND[lot.footprint] * costIndex(regionId) * d.land * laws(state, regionId).costMod);
}
export const bizCost = (state: GameState, regionId: RegionId, b: BusinessDef) =>
  Math.round(b.baseCost * costIndex(regionId) * laws(state, regionId).costMod);

/** Cost to go from `level` to `level + 1`. */
export const upgradeCost = (state: GameState, regionId: RegionId, b: BusinessDef, level: number) =>
  b.baseCost * costIndex(regionId) * laws(state, regionId).costMod * BAL.upgradeK * GROWTH ** (level - 1);

/** Cost of n consecutive upgrades starting at `level`. */
export function upgradeCostN(state: GameState, regionId: RegionId, b: BusinessDef, level: number, n: number): number {
  const a = upgradeCost(state, regionId, b, level);
  return (a * (GROWTH ** n - 1)) / (GROWTH - 1);
}
export function maxAffordable(state: GameState, regionId: RegionId, b: BusinessDef, level: number, cash: number): number {
  const a = upgradeCost(state, regionId, b, level);
  if (cash < a) return 0;
  const n = Math.floor(Math.log((cash * (GROWTH - 1)) / a + 1) / Math.log(GROWTH));
  return Math.max(0, Math.min(n, MAX_LEVEL - level));
}
export function milestoneMult(level: number): number {
  let m = 1;
  if (level >= 10) m *= 1.5;
  if (level >= 25) m *= 2;
  if (level >= 50) m *= 2;
  if (level >= 100) m *= 3;
  if (level >= 200) m *= 3;
  return m;
}
export const nextMilestone = (level: number) => [10, 25, 50, 100, 200].find((m) => m > level) ?? null;

export function bizValue(state: GameState, regionId: RegionId, b: BusinessDef, level: number): number {
  return (bizCost(state, regionId, b) + (level > 1 ? upgradeCostN(state, regionId, b, 1, level - 1) : 0)) * 0.85;
}
export function lotValue(state: GameState, regionId: RegionId, lotId: string): number {
  const def = getCity(regionId).lotById[lotId];
  const ls = state.regions[regionId].lots[lotId];
  const land = landPrice(state, regionId, def);
  return land + (ls.biz ? bizValue(state, regionId, BIZ[ls.biz], ls.level) : 0);
}
export const npcAsk = (state: GameState, regionId: RegionId, lotId: string) => Math.round(lotValue(state, regionId, lotId) * 1.2);
export function rivalAsk(state: GameState, regionId: RegionId, lotId: string): number {
  const owner = state.regions[regionId].lots[lotId].owner;
  const def = REGION[regionId].rivals.find((r) => r.id === owner);
  return Math.round(lotValue(state, regionId, lotId) * (1.4 + (def?.greed ?? 0.3)));
}
export const sellPrice = (state: GameState, regionId: RegionId, lotId: string) => Math.round(lotValue(state, regionId, lotId) * 0.7);

export function allowedBiz(regionId: RegionId, lot: LotDef): BusinessDef[] {
  const max = FOOTPRINT_MAX_TIER[lot.footprint];
  return BUSINESSES.filter((b) => b.tier <= max && (!b.regions || b.regions.includes(regionId)));
}

// ── Income ────────────────────────────────────────────────────────────────────
export interface LotIncome { gross: number; net: number; active: boolean; reason?: string; }
export interface Derived {
  t: number; rev: number;
  /** extra upkeep on every player business from empire size */
  overhead: number;
  lots: Record<RegionId, Record<string, LotIncome>>;
  player: number;
  playerByRegion: Record<RegionId, number>;
  rivals: Record<string, number>;
}

function buffMult(state: GameState, T: number, regionId: RegionId, cat: string, district: string, owner: OwnerId): number {
  let m = 1;
  for (const b of state.buffs) {
    if (b.until <= T) continue;
    if ((b.target ?? 'player') === 'player' && owner !== 'player') continue;
    if (b.regionId && b.regionId !== regionId) continue;
    if (b.category && b.category !== cat) continue;
    if (b.districtId && b.districtId !== district) continue;
    m *= b.mult;
  }
  return m;
}

type Counts = Map<string, Map<OwnerId, number>>;
/** District × category → owner → count, for competition and chain synergy. `hypo` swaps one lot. */
function regionCounts(state: GameState, regionId: RegionId, hypo?: { lotId: string; ls: LotState }): Counts {
  const rs = state.regions[regionId];
  const counts: Counts = new Map();
  for (const def of getCity(regionId).lots) {
    const ls = hypo && hypo.lotId === def.id ? hypo.ls : rs.lots[def.id];
    if (!ls.biz) continue;
    const key = def.district + '|' + BIZ[ls.biz].category;
    let m = counts.get(key);
    if (!m) counts.set(key, (m = new Map()));
    m.set(ls.owner, (m.get(ls.owner) ?? 0) + 1);
  }
  return counts;
}

/** THE income formula for one business (the sim and every UI estimate use this). */
function lotIncome(state: GameState, regionId: RegionId, def: LotDef, ls: LotState, counts: Counts, overhead: number, T: number): LotIncome {
  const R = REGION[regionId];
  const L = laws(state, regionId);
  const rs = state.regions[regionId];
  const b = BIZ[ls.biz!];
  const cat = b.category;
  const m = counts.get(def.district + '|' + cat)!;
  let total = 0;
  m.forEach((v) => (total += v));
  const own = m.get(ls.owner) ?? 0;
  const competition = 1 / (1 + 0.12 * (total - own));
  const synergy = ls.owner === 'npc' ? 1 : 1 + Math.min(0.25, 0.05 * (own - 1));
  let gross =
    b.baseIncome * ls.level * milestoneMult(ls.level) * incomeIndex(regionId) *
    demandMult(regionId, cat) * fitMult(regionId, def.district, cat) * (L.categoryMods[cat] ?? 1) *
    (b.tier <= 2 ? L.smallBizRelief : 1) * competition * synergy *
    mechanicMult(state, regionId, cat, ls.owner, T) * buffMult(state, T, regionId, cat, def.district, ls.owner);
  if (ls.owner === 'player') {
    gross *= 1 + state.rep / 500;
    if (state.entitlements.doubleIncome) gross *= 2;
  }
  const upkeep = 0.12 * R.economy.wageIndex * L.minWage * (ls.owner === 'player' && regionId === 'ironhold' ? 1 + rs.vars.wageDeal : 1) +
    (ls.owner === 'player' ? overhead : 0);
  let net = gross * Math.max(0.1, 1 - taxRate(state, regionId, ls.owner) - upkeep);
  if (ls.owner === 'player' && regionId === 'neonvale' && rs.vars.vcShare > 0) net *= 1 - rs.vars.vcShare;
  let active = true;
  let reason: string | undefined;
  if (ls.permitUntil > T) { active = false; reason = 'Awaiting permit'; }
  else if (ls.frozenUntil > T) { active = false; reason = 'Shut down'; }
  else if (gross <= 0) { active = false; reason = 'On strike'; }
  if (!active) { gross = 0; net = 0; }
  return { gross, net, active, reason };
}

function computeRegion(state: GameState, regionId: RegionId, out: Derived, T: number): void {
  const rs = state.regions[regionId];
  const counts = regionCounts(state, regionId);
  const res: Record<string, LotIncome> = {};
  let playerSum = 0;
  for (const def of getCity(regionId).lots) {
    const ls = rs.lots[def.id];
    if (!ls.biz) continue;
    const r = (res[def.id] = lotIncome(state, regionId, def, ls, counts, out.overhead, T));
    if (ls.owner === 'player') playerSum += r.net;
    else if (ls.owner !== 'npc') out.rivals[ls.owner] = (out.rivals[ls.owner] ?? 0) + r.net;
  }
  out.lots[regionId] = res;
  out.playerByRegion[regionId] = playerSum;
  out.player += playerSum;
}

/** What `bizId` at `level` on this lot would earn per second for YOU, right now: the sim's own
 *  formula with the lot swapped in (tax, upkeep, empire overhead, competition, chain synergy,
 *  laws, region mechanic, buffs, rep). Ignores a permit wait (shown separately). Critic #4. */
export function projectIncome(state: GameState, regionId: RegionId, lotId: string, bizId: string, level = 1): number {
  const def = getCity(regionId).lotById[lotId];
  const cur = state.regions[regionId].lots[lotId];
  const hypo: LotState = { ...cur, owner: 'player', biz: bizId, level, permitUntil: 0, frozenUntil: 0 };
  let owned = 0;
  for (const id of REGION_IDS) for (const l of Object.values(state.regions[id].lots)) if (l.owner === 'player' && l.biz) owned++;
  if (!(cur.owner === 'player' && cur.biz)) owned++;
  return lotIncome(state, regionId, def, hypo, regionCounts(state, regionId, { lotId, ls: hypo }), empireOverhead(owned), Math.floor(state.t)).net;
}

let cache: { state: GameState; d: Derived } | null = null;

/** Income snapshot. A pure function of (saved state, state.rev, integer sim-second), so it can be
 *  cached freely without breaking determinism across save/load. */
export function derived(state: GameState, force = false): Derived {
  const T = Math.floor(state.t);
  if (!force && cache && cache.state === state && cache.d.rev === state.rev && cache.d.t === T) return cache.d;
  let owned = 0;
  for (const id of REGION_IDS) for (const l of Object.values(state.regions[id].lots)) if (l.owner === 'player' && l.biz) owned++;
  const d: Derived = {
    t: T, rev: state.rev, lots: {} as Derived['lots'], player: 0,
    overhead: empireOverhead(owned),
    playerByRegion: {} as Derived['playerByRegion'], rivals: {},
  };
  for (const id of REGION_IDS) computeRegion(state, id, d, T);
  cache = { state, d };
  return d;
}

export const tillCap = (net: number) => net * TILL_SECONDS;

export function playerLots(state: GameState): { regionId: RegionId; lotId: string; ls: LotState }[] {
  const out: { regionId: RegionId; lotId: string; ls: LotState }[] = [];
  for (const regionId of REGION_IDS)
    for (const [lotId, ls] of Object.entries(state.regions[regionId].lots)) if (ls.owner === 'player') out.push({ regionId, lotId, ls });
  return out;
}

export function netWorth(state: GameState): number {
  let v = state.cash;
  for (const { regionId, lotId, ls } of playerLots(state)) v += lotValue(state, regionId, lotId) + ls.till;
  for (const s of state.shipments) v += s.value;
  return v;
}
export function rivalNetWorth(state: GameState, rivalId: string): number {
  const r = state.rivals[rivalId];
  if (!r || r.acquired) return 0;
  let v = r.cash;
  for (const [lotId, ls] of Object.entries(state.regions[r.regionId].lots)) if (ls.owner === rivalId) v += lotValue(state, r.regionId, lotId);
  return v;
}
