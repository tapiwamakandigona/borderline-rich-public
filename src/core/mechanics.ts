// Region signature mechanics: the rules that make each starting region *play* differently.
import type { Category, GameState, OwnerId, RegionId } from './types';
import { DAY } from './constants';
import { laws } from './laws';
import { REGION } from './data/regions';
import { BIZ } from './data/businesses';
import { next } from './rng';
import { notify } from './notify';

/** The business category each region's signature mechanic acts on. Every region has a tier-1
 *  starter business in this category, so the mechanic shapes the first minutes of play. */
export const SIGNATURE_CATEGORY: Record<RegionId, Category> = {
  solenne: 'logistics', redmesa: 'energy', neonvale: 'tech', amberfield: 'agri', verano: 'hospitality', ironhold: 'industry',
};

// ── Port Solenne: Free Port ───────────────────────────────────────────────────
/** Legal exports from Solenne carry a free-port certificate: the destination's import tariff × this. */
export const FREE_PORT_CERT = 0.5;
/** Your Solenne logistics businesses earn +PORT_BONUS per shipment of yours moving through the port. */
export const PORT_BONUS = 0.2;
export const PORT_MAX_SHIPS = 3;
/** Traders based in Solenne start with this many shipping slots (everyone else: 1). */
export const SOLENNE_START_SLOTS = 2;
export const portShipments = (s: GameState) => s.shipments.filter((x) => x.from === 'solenne' || x.to === 'solenne').length;
export const portMult = (s: GameState) => 1 + PORT_BONUS * Math.min(PORT_MAX_SHIPS, portShipments(s));

// ── Amberfield: Seasons & Harvests ────────────────────────────────────────────
export const SEASONS = ['Planting', 'Growing', 'Harvest', 'Winter'] as const;
export const SEASON_MULT = [0.75, 1.0, 1.6, 0.5];
export const COOP_BONUS = 1.15;
export const seasonIndex = (t: number) => Math.floor(t / DAY) % 4;
export function coopActive(state: GameState): boolean {
  let n = 0;
  for (const l of Object.values(state.regions.amberfield.lots)) if (l.owner === 'player' && l.biz && BIZ[l.biz].category === 'agri') n++;
  return n >= 3;
}

// ── Isla Verano: tourist seasons & offshore shelter ───────────────────────────
export const highSeason = (t: number) => Math.floor(t / (2 * DAY)) % 2 === 0;
export const TOURISM_HIGH = 1.5;
export const TOURISM_LOW = 0.7;
export const tourismMult = (t: number) => (highSeason(t) ? TOURISM_HIGH : TOURISM_LOW);
export const HYPE_MIN = 0.7;
export const HYPE_MAX = 1.5;
export const FUEL_MIN = 0.6;
export const FUEL_MAX = 1.6;
export function ownsBiz(state: GameState, regionId: RegionId, bizId: string): boolean {
  return Object.values(state.regions[regionId].lots).some((l) => l.owner === 'player' && l.biz === bizId);
}
export const offshoreActive = (s: GameState) => s.regions.verano.vars.offshore && ownsBiz(s, 'verano', 'offshore');

// ── Red Mesa: permits & fuel index ────────────────────────────────────────────
export const PERMIT_BASE = 90;
export const PERMIT_PER_REG = 240;
/** Tier-1 (street) businesses wait this fraction of the full permit time. */
export const PERMIT_TIER1 = 0.4;
/** Seconds a new Red Mesa business sits idle waiting for its permit. Everything needs one —
 *  except the Fuel Pump (the territory runs on gas); street-level tier-1 trades wait less. */
export function permitWait(state: GameState, bizId?: string): number {
  const favour = state.regions.redmesa.factions.circle?.standing ?? 0;
  return permitSeconds(laws(state, 'redmesa').regulation, bizId) * (favour >= 50 ? 0.5 : 1);
}
/** Permit time for a regulation level (pure; also used for the region pitch). */
export function permitSeconds(regulation: number, bizId?: string): number {
  if (bizId === 'fuelpump') return 0;
  const tierMult = bizId && BIZ[bizId]?.tier === 1 ? PERMIT_TIER1 : 1;
  return Math.round((PERMIT_BASE + PERMIT_PER_REG * regulation) * tierMult);
}

// ── Ironhold: union mood & strikes ────────────────────────────────────────────
/** Below this union mood a strike can break out; it stops your industry & logistics. */
export const STRIKE_MOOD = 30;
export const STRIKE_SECS = 90;
export const strikeActive = (s: GameState, T = s.t) => s.regions.ironhold.vars.strikeUntil > T;

/** Multiplier a region's signature mechanic applies to a business category for an owner.
 *  T is the integer sim-second ("epoch") so incomes are a pure function of saved state. */
export function mechanicMult(state: GameState, regionId: RegionId, cat: Category, owner: OwnerId, T = Math.floor(state.t)): number {
  const v = state.regions[regionId].vars;
  switch (regionId) {
    case 'neonvale':
      return cat === 'tech' || cat === 'services' ? v.hype : 1;
    case 'redmesa':
      return cat === 'energy' ? v.fuelIndex : 1;
    case 'amberfield':
      if (cat !== 'agri') return 1;
      return SEASON_MULT[seasonIndex(T)] * (owner === 'player' && coopActive(state) ? COOP_BONUS : 1);
    case 'verano':
      return cat === 'hospitality' ? tourismMult(T) : 1;
    case 'ironhold':
      return owner === 'player' && (cat === 'industry' || cat === 'logistics') && strikeActive(state, T) ? 0 : 1;
    case 'solenne':
      return owner === 'player' && cat === 'logistics' ? portMult(state) : 1;
    default:
      return 1;
  }
}

/** Effective income-tax rate; the Verano offshore shelter cuts the player's tax elsewhere. */
/** The Verano offshore shelter multiplies your income tax outside Verano by this. */
export const OFFSHORE_TAX_MULT = 0.45;
export function taxRate(state: GameState, regionId: RegionId, owner: OwnerId): number {
  const base = laws(state, regionId).incomeTax;
  return owner === 'player' && regionId !== 'verano' && offshoreActive(state) ? base * OFFSHORE_TAX_MULT : base;
}

function playerIndustryCount(state: GameState): number {
  let n = 0;
  for (const l of Object.values(state.regions.ironhold.lots)) {
    if (l.owner !== 'player' || !l.biz) continue;
    const c = BIZ[l.biz].category;
    if (c === 'industry' || c === 'logistics') n++;
  }
  return n;
}

/** Per-step updates for the signature mechanics. Income-relevant variables only change on
 *  integer-second boundaries (or with a rev bump) so the income cache stays deterministic. */
export function mechanicsTick(state: GameState, dt: number): void {
  const second = Math.floor(state.t) !== Math.floor(state.t - dt);
  const steps = dt >= 1 ? Math.round(dt) : second ? 1 : 0;
  for (let k = 0; k < steps; k++) {
    // Neon Vale hype: slow sine wave + noise, clamped.
    const nv = state.regions.neonvale.vars;
    const target = 1.1 + 0.35 * Math.sin((2 * Math.PI * state.t) / 420);
    nv.hype += (target - nv.hype) * 0.25 + (next(state) - 0.5) * 0.03;
    nv.hype = Math.min(HYPE_MAX, Math.max(HYPE_MIN, nv.hype));
    // Red Mesa fuel index: mean-reverting random walk with fat tails.
    const rm = state.regions.redmesa.vars;
    rm.fuelIndex += (1 - rm.fuelIndex) * 0.01 + (next(state) - 0.5) * 0.09;
    rm.fuelIndex = Math.min(FUEL_MAX, Math.max(FUEL_MIN, rm.fuelIndex));
  }
  const nv = state.regions.neonvale.vars;
  if (nv.vcUntil > 0 && nv.vcUntil <= state.t) { nv.vcShare = 0; nv.vcUntil = 0; state.rev++; notify(state, 'Your VC revenue share in Neon Vale has ended.', 'info'); }

  // Ironhold union mood: erodes as your industrial footprint grows, recovers without it.
  const ih = state.regions.ironhold.vars;
  const n = playerIndustryCount(state);
  if (n > 0) ih.unionMood -= dt * 0.02 * (1 + n * 0.25) * Math.max(0.1, 1 - ih.wageDeal * 3.2);
  else ih.unionMood += (70 - ih.unionMood) * 0.005 * dt;
  ih.unionMood = Math.min(100, Math.max(0, ih.unionMood));
  if (ih.strikeUntil > 0 && ih.strikeUntil <= state.t) {
    ih.strikeUntil = 0;
    ih.unionMood = Math.min(100, ih.unionMood + 18);
    state.rev++;
    notify(state, 'The Ironhold strike is over. Mood recovers a little.', 'info');
  }
  if (n > 0 && !strikeActive(state) && ih.unionMood < STRIKE_MOOD && next(state) < Math.min(1, dt * 0.025)) {
    ih.strikeUntil = state.t + STRIKE_SECS;
    state.rev++;
    notify(state, `STRIKE! The Ironhold union walked out. Your industry & logistics there earn nothing for ${STRIKE_SECS} s.`, 'bad');
  }

// Verano offshore shelter keeps heat simmering.
  if (offshoreActive(state)) state.heat = Math.min(100, state.heat + dt * 0.02);
}

export const regionSummaryVars = (state: GameState, regionId: RegionId) => ({ ...state.regions[regionId].vars, name: REGION[regionId].signature.name });
