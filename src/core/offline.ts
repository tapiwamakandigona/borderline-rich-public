// Offline progress: managed businesses earn (50 %, or 100 % with Night Shift), tills fill to
// their cap, and the world catches up coarsely (shipments, elections, rivals, markets).
import type { GameState } from './types';
import { REGION_IDS } from './data/regions';
import { derived, tillCap } from './economy';
import { mechanicsTick, offshoreActive } from './mechanics';
import { marketTick, resolveShipment } from './trade';
import { RIVAL_RETAIN, rivalAct } from './rivals';
import { runElection } from './politics';
import { progressCheck } from './sim';

export const OFFLINE_CAP = 8 * 3600;
export const NIGHT_SHIFT_CAP = 24 * 3600;

export interface OfflineReport { seconds: number; earned: number; capped: boolean; rate: number; }

export function applyOffline(state: GameState, awaySeconds: number): OfflineReport {
  if (!(awaySeconds >= 30)) return { seconds: 0, earned: 0, capped: false, rate: 0 };
  const night = state.entitlements.nightShift;
  const cap = night ? NIGHT_SHIFT_CAP : OFFLINE_CAP;
  const s = Math.min(awaySeconds, cap);
  const rate = night ? 1 : 0.5;
  const d = derived(state, true);
  let earned = 0;
  for (const regionId of REGION_IDS) {
    const inc = d.lots[regionId];
    for (const [lotId, ls] of Object.entries(state.regions[regionId].lots)) {
      if (ls.owner !== 'player' || !inc[lotId]) continue;
      const net = inc[lotId].net;
      if (ls.manager) { const e = net * s * rate; state.cash += e; earned += e; }
      else { const before = ls.till; ls.till = Math.max(ls.till, Math.min(tillCap(net), ls.till + net * s)); earned += ls.till - before; }
    }
  }
  state.stats.earned += earned;
  for (const [id, inc] of Object.entries(d.rivals)) if (state.rivals[id] && !state.rivals[id].acquired) state.rivals[id].cash += inc * s * RIVAL_RETAIN;

  state.t += s;
  for (let i = state.shipments.length - 1; i >= 0; i--) {
    const sh = state.shipments[i];
    if (sh.arriveAt <= state.t) { state.shipments.splice(i, 1); resolveShipment(state, sh); }
  }
  for (const id of REGION_IDS) if (state.regions[id].nextElectionAt <= state.t) runElection(state, id);
  for (let k = 0; k < Math.min(20, Math.floor(s / 15)); k++) marketTick(state);
  const rounds = Math.min(12, Math.floor(s / 120));
  for (let k = 0; k < rounds; k++) for (const r of Object.values(state.rivals)) if (!r.acquired) rivalAct(state, r.id);
  for (let k = 0; k < Math.min(60, Math.floor(s / 10)); k++) mechanicsTick(state, 10);
  for (const r of Object.values(state.rivals)) r.nextActAt = state.t + 5;
  state.timers.market = state.t + 15;
  state.timers.churn = state.t + 30;
  state.nextEventAt = Math.min(state.nextEventAt, state.t + 20);
  if (!offshoreActive(state)) state.heat = Math.max(0, state.heat - s * 0.125);
  state.buffs = state.buffs.filter((b) => b.until > state.t);
  state.rev++;
  progressCheck(state);
  return { seconds: s, earned, capped: awaySeconds > cap, rate };
}
