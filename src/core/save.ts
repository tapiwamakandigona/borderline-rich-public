// Versioned, migration-safe save format. Storage itself is injected by the host (localStorage on
// web, Capacitor Preferences on native) so the core stays pure.
import type { GameState, LotState } from './types';
import { REGION_IDS, REGION } from './data/regions';
import { getCity } from './city';
import { SAVE_VERSION } from './constants';

type Migration = (s: Record<string, unknown>) => Record<string, unknown>;
/** MIGRATIONS[v] upgrades a v-save to v+1. Add one whenever SAVE_VERSION is bumped. */
export const MIGRATIONS: Record<number, Migration> = {};

export function serialize(state: GameState): string {
  return JSON.stringify({ v: SAVE_VERSION, s: state });
}

function isNum(x: unknown): x is number { return typeof x === 'number' && Number.isFinite(x); }

/** Repairs lot tables if a city layout changed between versions; drops unknown lots. */
function reconcileLots(s: GameState): void {
  for (const id of REGION_IDS) {
    const city = getCity(id);
    const rs = s.regions[id];
    const lots: Record<string, LotState> = {};
    for (const def of city.lots) {
      const old = rs.lots[def.id];
      lots[def.id] = old ?? { owner: def.civic ? 'civic' : 'vacant', biz: null, level: 0, till: 0, manager: false, invested: 0, permitUntil: 0, frozenUntil: 0 };
    }
    rs.lots = lots;
    for (const f of REGION[id].factions) rs.factions[f.id] ??= { popularity: f.basePopularity, standing: 0, donated: 0, seats: 0 };
  }
}

export function deserialize(raw: string | null | undefined): GameState | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw) as { v?: unknown; s?: Record<string, unknown> };
    if (!o || typeof o !== 'object' || !isNum(o.v) || !o.s || typeof o.s !== 'object') return null;
    let v = o.v;
    let s = o.s;
    if (v > SAVE_VERSION) return null;
    while (v < SAVE_VERSION) {
      const m = MIGRATIONS[v];
      if (!m) return null;
      s = m(s);
      v++;
    }
    const g = s as unknown as GameState;
    if (!isNum(g.cash) || !isNum(g.t) || !isNum(g.rng) || !g.regions || !g.rivals) return null;
    if (!REGION_IDS.every((id) => g.regions[id] && g.regions[id].lots)) return null;
    if (!REGION_IDS.includes(g.homeRegion) || !REGION_IDS.includes(g.currentRegion)) return null;
    g.cash = Math.max(0, g.cash);
    reconcileLots(g);
    g.version = SAVE_VERSION;
    return g;
  } catch {
    return null;
  }
}
