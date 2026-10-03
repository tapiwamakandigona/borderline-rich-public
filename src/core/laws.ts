import type { GameState, Laws, RegionId } from './types';
import { REGION } from './data/regions';

/** Laws = region base laws overridden by the ruling faction's platform. */
export function lawsFor(regionId: RegionId, rulingFaction: string): Laws {
  const R = REGION[regionId];
  const ruling = R.factions.find((f) => f.id === rulingFaction);
  const p = ruling?.platform ?? {};
  return { ...R.baseLaws, ...p, categoryMods: { ...R.baseLaws.categoryMods, ...(p.categoryMods ?? {}) } };
}
export const laws = (state: GameState, regionId: RegionId): Laws => lawsFor(regionId, state.regions[regionId].ruling);
/** The faction in power when a new game starts (highest base popularity). */
export const startingRuler = (regionId: RegionId) => [...REGION[regionId].factions].sort((a, b) => b.basePopularity - a.basePopularity)[0].id;

export const costIndex = (regionId: RegionId) => REGION[regionId].economy.costIndex;
