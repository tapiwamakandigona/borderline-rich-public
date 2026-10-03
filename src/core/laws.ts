import type { GameState, Laws, RegionId } from './types';
import { REGION } from './data/regions';

/** Current laws = region base laws overridden by the ruling faction's platform. */
export function laws(state: GameState, regionId: RegionId): Laws {
  const R = REGION[regionId];
  const ruling = R.factions.find((f) => f.id === state.regions[regionId].ruling);
  const p = ruling?.platform ?? {};
  return { ...R.baseLaws, ...p, categoryMods: { ...R.baseLaws.categoryMods, ...(p.categoryMods ?? {}) } };
}

export const costIndex = (regionId: RegionId) => REGION[regionId].economy.costIndex;
