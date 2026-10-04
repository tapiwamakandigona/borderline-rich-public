// Fixed-step simulation. The renderer/UI call advance(); tests and the balance bot do too.
import type { GameState } from './types';
import { DT } from './constants';
import { REGION_IDS } from './data/regions';
import { goalsFor, RANKS, rankIndexFor } from './data/progression';
import { derived, netWorth, tillCap } from './economy';
import { mechanicsTick, offshoreActive } from './mechanics';
import { marketTick, resolveShipment } from './trade';
import { npcChurn, rivalAct, rivalIncome } from './rivals';
import { runElection } from './politics';
import { maybeTriggerEvent } from './events';
import { costIndex } from './laws';
import { next } from './rng';
import { notify } from './notify';
import { money } from './format';

export function progressCheck(state: GameState): void {
  const nw = netWorth(state);
  if (nw > state.stats.peakNetWorth) state.stats.peakNetWorth = nw;
  const ri = rankIndexFor(nw);
  while (state.stats.rankIndex < ri) {
    state.stats.rankIndex++;
    const r = RANKS[state.stats.rankIndex];
    state.gold += r.gold;
    notify(state, `RANK UP — ${r.name}! +${r.gold} gold`, 'good');
  }
  const goals = goalsFor(state.homeRegion);
  while (state.goalIndex < goals.length && goals[state.goalIndex].check(state)) {
    const g = goals[state.goalIndex];
    const cash = Math.round((g.cash ?? 0) * costIndex(state.homeRegion));
    state.cash += cash;
    state.gold += g.gold ?? 0;
    state.goalIndex++;
    notify(state, `Goal complete: ${g.text}${cash ? ' +' + money(cash) : ''}${g.gold ? ` +${g.gold} gold` : ''}`, 'good');
  }
}

export function step(state: GameState, dt = DT): void {
  const prevSecond = Math.floor(state.t);
  state.t += dt;
  const d = derived(state);

  // Player income: managers bank it, otherwise it fills the till.
  for (const regionId of REGION_IDS) {
    const lots = state.regions[regionId].lots;
    const inc = d.lots[regionId];
    for (const lotId in inc) {
      const ls = lots[lotId];
      if (ls.owner !== 'player') continue;
      const v = inc[lotId].net * dt;
      if (v <= 0) continue;
      if (ls.manager) { state.cash += v; state.stats.earned += v; }
      else ls.till = Math.max(ls.till, Math.min(tillCap(inc[lotId].net), ls.till + v)); // never shrinks
    }
  }
  rivalIncome(state, dt);

  if (!offshoreActive(state)) state.heat = Math.max(0, state.heat - dt * 0.125);
  if (state.t - state.hustle.lastTapAt > 1.2) state.hustle.combo = 0;
  mechanicsTick(state, dt);

  if (state.t >= state.timers.market) { marketTick(state); state.timers.market += 15; }
  if (state.t >= state.timers.churn) { npcChurn(state); state.timers.churn += 30; }
  for (const r of Object.values(state.rivals)) {
    if (r.acquired || state.t < r.nextActAt) continue;
    rivalAct(state, r.id);
    r.nextActAt += 9 + next(state) * 2;
  }
  for (const id of REGION_IDS) if (state.t >= state.regions[id].nextElectionAt) runElection(state, id);

  for (let i = state.shipments.length - 1; i >= 0; i--) {
    const s = state.shipments[i];
    if (s.arriveAt <= state.t) { state.shipments.splice(i, 1); resolveShipment(state, s); }
  }
  if (state.buffs.length && state.buffs.some((b) => b.until <= state.t)) {
    state.buffs = state.buffs.filter((b) => b.until > state.t);
    state.rev++;
  }
  maybeTriggerEvent(state);
  if (Math.floor(state.t) !== prevSecond) progressCheck(state);
}

/** Advance the sim by `seconds` using fixed steps. */
export function advance(state: GameState, seconds: number): void {
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) step(state, DT);
}
