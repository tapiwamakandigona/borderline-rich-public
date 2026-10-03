// A "reasonable player" that drives the REAL sim (no economy model of its own beyond payback
// estimates used to choose actions). Used by balance and determinism tests.
import type { GameState, RegionId } from '../../src/core/types';
import { step } from '../../src/core/sim';
import { DT } from '../../src/core/constants';
import { REGION } from '../../src/core/data/regions';
import { BIZ } from '../../src/core/data/businesses';
import { EVENT } from '../../src/core/data/events';
import { getCity } from '../../src/core/city';
import { allowedBiz, bizCost, derived, landPrice, npcAsk, upgradeCost } from '../../src/core/economy';
import { laws } from '../../src/core/laws';
import {
  buyNpc, buyVacant, collect, hireManager, hustleCost, hustlePerTap, hustleTap, managerCost, resolveEvent, upgradeHustle, upgradeLot,
} from '../../src/core/actions';

export interface BotOpts { tapsPerSec: number; hustleForSec?: number; }
export interface BotLog { firstBizAt: number | null; minCash: number; nanSeen: boolean; purchases: number; }

function netFactor(s: GameState, r: RegionId): number {
  const L = laws(s, r);
  return Math.max(0.1, 1 - L.incomeTax - 0.12 * REGION[r].economy.wageIndex * L.minWage);
}
function estIncome(s: GameState, r: RegionId, district: string, bizId: string): number {
  const b = BIZ[bizId];
  const d = REGION[r].districts.find((x) => x.id === district)!;
  return b.baseIncome * REGION[r].economy.demand[b.category] * (d.fit[b.category] ?? 1) * (laws(s, r).categoryMods[b.category] ?? 1) * netFactor(s, r);
}

function chooseEvent(s: GameState): number {
  const def = EVENT[s.pendingEvent!.defId];
  let best = 0, bestV = -Infinity;
  def.choices.forEach((c, i) => {
    const val = (o: NonNullable<typeof c.outcome>) =>
      (o.cash ?? 0) - (o.heat ?? 0) * 0.03 + (o.rep ?? 0) * 0.01 - (o.freeze ? 0.5 : 0) - (o.special === 'acceptOffer' || o.special === 'loseShipment' ? 1 : 0) +
      (o.buffs ?? []).reduce((a, b) => a + (b.mult - 1) * 0.5, 0);
    const v = c.risk ? c.risk.p * val(c.risk.win) + (1 - c.risk.p) * val(c.risk.lose) : val(c.outcome!);
    if (v > bestV) { bestV = v; best = i; }
  });
  return best;
}

type Option = { payback: number; cost: number; run: () => boolean };

function options(s: GameState, hustling: boolean, tps: number): Option[] {
  const r = s.currentRegion;
  const city = getCity(r);
  const rs = s.regions[r];
  const out: Option[] = [];
  for (const def of city.lots) {
    const ls = rs.lots[def.id];
    if (ls.owner === 'vacant') {
      for (const b of allowedBiz(r, def)) {
        const cost = landPrice(s, r, def) + bizCost(s, r, b);
        const inc = estIncome(s, r, def.district, b.id);
        if (inc > 0) out.push({ payback: cost / inc, cost, run: () => buyVacant(s, r, def.id, b.id).ok });
      }
    } else if (ls.owner === 'npc' && ls.biz) {
      const cost = npcAsk(s, r, def.id);
      const inc = estIncome(s, r, def.district, ls.biz) * ls.level;
      out.push({ payback: cost / inc, cost, run: () => buyNpc(s, r, def.id).ok });
    } else if (ls.owner === 'player' && ls.biz) {
      const cost = upgradeCost(s, r, BIZ[ls.biz], ls.level);
      const inc = estIncome(s, r, def.district, ls.biz) * (ls.level + 1 >= 10 && ls.level < 10 ? ls.level + 2 : 1);
      out.push({ payback: cost / inc, cost, run: () => upgradeLot(s, r, def.id, 1).ok });
      if (!ls.manager) {
        const mc = managerCost(s, r, def.id);
        if (mc < s.cash * 0.05) out.push({ payback: 0, cost: mc, run: () => hireManager(s, r, def.id).ok });
      }
    }
  }
  if (hustling && s.hustle.level < 8) {
    const c = hustleCost(s);
    const gain = (hustlePerTap(s) / (1 + 0.75 * s.hustle.level)) * 0.75 * tps * 1.4;
    out.push({ payback: c / gain, cost: c, run: () => upgradeHustle(s).ok });
  }
  return out;
}

export function runBot(s: GameState, seconds: number, opts: BotOpts, log: BotLog = { firstBizAt: null, minCash: Infinity, nanSeen: false, purchases: 0 }): BotLog {
  const steps = Math.round(seconds / DT);
  let tapAcc = 0;
  let nextDecision = 0;
  const hustleFor = opts.hustleForSec ?? 600;
  for (let i = 0; i < steps; i++) {
    step(s, DT);
    const hustling = s.t < hustleFor && derived(s).player < hustlePerTap(s) * opts.tapsPerSec * 3;
    if (hustling && opts.tapsPerSec > 0) {
      tapAcc += DT;
      const every = 1 / opts.tapsPerSec;
      while (tapAcc >= every) { hustleTap(s); tapAcc -= every; }
    }
    if (s.t >= nextDecision) {
      nextDecision = s.t + 1;
      if (s.pendingEvent) resolveEvent(s, chooseEvent(s));
      for (const [id, ls] of Object.entries(s.regions[s.currentRegion].lots)) if (ls.owner === 'player') collect(s, s.currentRegion, id);
      for (let k = 0; k < 4; k++) {
        const opts2 = options(s, hustling, opts.tapsPerSec).filter((o) => o.cost <= s.cash).sort((a, b) => a.payback - b.payback);
        if (!opts2.length || !opts2[0].run()) break;
        log.purchases++;
        if (log.firstBizAt === null && s.stats.bizBought > 0) log.firstBizAt = s.t;
      }
    }
    if (s.cash < log.minCash) log.minCash = s.cash;
    if (!Number.isFinite(s.cash) || !Number.isFinite(s.heat)) log.nanSeen = true;
  }
  return log;
}
