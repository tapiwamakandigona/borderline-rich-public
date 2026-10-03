// Event engine: picks region-appropriate events, renders consequence previews, applies outcomes.
import type { GameState, PendingEvent, RegionId } from './types';
import { EVENT, EVENTS, ownsAny, type Outcome } from './data/events';
import { REGION } from './data/regions';
import { BIZ } from './data/businesses';
import { getCity } from './city';
import { derived, lotValue } from './economy';
import { costIndex } from './laws';
import { standingDelta } from './politics';
import { FUEL_MAX, FUEL_MIN, HYPE_MAX, HYPE_MIN, WAGE_DEAL_MAX } from './mechanics';
import { chance, next, pick, range, weighted } from './rng';
import { notify } from './notify';
import { duration, money } from './format';

export const eventScale = (state: GameState, regionId: RegionId) =>
  Math.round(Math.max(60 * costIndex(regionId), derived(state).player * 120));

export function trigger(state: GameState, defId: string, regionId: RegionId, vars: Record<string, string | number> = {}): void {
  state.pendingEvent = { defId, regionId, at: state.t, vars: { S: eventScale(state, regionId), ...vars } };
  state.eventsSeen[defId] = state.t;
}

function tryFlop(state: GameState): boolean {
  const rs = state.regions.neonvale;
  const lots = Object.entries(rs.lots).filter(([, l]) => state.rivals[l.owner] && l.biz);
  if (!lots.length) return false;
  const [lotId, ls] = pick(state, lots);
  const price = Math.round(lotValue(state, 'neonvale', lotId) * 0.75);
  const rival = REGION.neonvale.rivals.find((r) => r.id === ls.owner)!;
  trigger(state, 'nv_flop', 'neonvale', { rival: rival.name, rivalId: rival.id, lotId, biz: BIZ[ls.biz!].name, price });
  return true;
}

export function maybeTriggerEvent(state: GameState): void {
  if (state.pendingEvent) return;
  if (state.heat >= 90) { trigger(state, 'raid', state.currentRegion); return; }
  if (state.t < state.nextEventAt) return;
  state.nextEventAt = state.t + range(state, 90, 160);
  if (ownsAny(state) === 0) return;
  if (state.currentRegion === 'neonvale' && chance(state, 0.12) && tryFlop(state)) return;
  const cands = EVENTS.filter((e) =>
    !e.system && (e.region === 'global' || e.region === state.currentRegion) &&
    (state.eventsSeen[e.id] ?? -1e9) + (e.cooldown ?? 600) <= state.t && (!e.cond || e.cond(state)));
  if (!cands.length) return;
  // Early on, lean hard on the region's own events so each start feels like that place (critic #14).
  const local = state.t < 1200 ? 3 : 1.4;
  const e = weighted(state, cands, (x) => (x.weight ?? 1) * (x.region === 'global' ? 0.8 : local));
  trigger(state, e.id, state.currentRegion);
}

const fill = (s: string, vars: PendingEvent['vars']) =>
  s.replace(/\{(\w+)\}/g, (_, k) => (k === 'price' ? money(Number(vars[k])) : String(vars[k] ?? '')));

function describe(o: Outcome, S: number, vars: PendingEvent['vars']): string[] {
  const out: string[] = [];
  if (o.cash) out.push(money(o.cash * S, { sign: true }));
  if (o.gold) out.push(`+${o.gold} gold`);
  if (o.heat) out.push(`${o.heat > 0 ? '+' : ''}${o.heat} heat`);
  if (o.rep) out.push(`${o.rep > 0 ? '+' : ''}${o.rep} rep`);
  if (o.pop) out.push(`${o.pop[1] > 0 ? '+' : ''}${Math.round(o.pop[1] * 100)} support`);
  for (const [, d] of o.standing ?? []) out.push(`${d > 0 ? '+' : ''}${d} standing`);
  for (const b of o.buffs ?? []) out.push(`${b.category ?? 'all income'} ×${b.mult} for ${duration(b.secs)}`);
  if (o.freeze) out.push(`a business closed ${duration(o.freeze)}`);
  if (o.mood) out.push(`${o.mood > 0 ? '+' : ''}${o.mood} union mood`);
  if (o.fuel) out.push(`fuel index ${o.fuel > 0 ? '+' : ''}${o.fuel}`);
  if (o.insure) out.push(`insured ${duration(o.insure)}`);
  switch (o.special) {
    case 'acceptOffer': out.push(`+${money(Number(vars.price))}, lose the business`); break;
    case 'buyDiscount': out.push(`pay ${money(Number(vars.price))}, gain the site`); break;
    case 'loseShipment': out.push('lose a shipment'); break;
    case 'loseManager': out.push('lose a manager'); break;
    case 'exposeRival': out.push('rival loses 15 % cash'); break;
    case 'vc': out.push(`+${money(S * 4)} now, −25 % Neon Vale income for 30m`); break;
    case 'wageDeal': out.push('+5 % Ironhold wages'); break;
  }
  return out;
}

export interface EventView { title: string; body: string; region: string; choices: { label: string; preview: string; risky: boolean }[]; }
export function eventView(state: GameState): EventView | null {
  const pe = state.pendingEvent;
  if (!pe) return null;
  const def = EVENT[pe.defId];
  const S = Number(pe.vars.S);
  return {
    title: def.title,
    body: fill(def.body, pe.vars),
    region: def.region === 'global' ? REGION[pe.regionId].name : REGION[def.region].name,
    choices: def.choices.map((c) => {
      if (c.risk) {
        const w = describe(c.risk.win, S, pe.vars).join(', ') || 'nothing happens';
        const l = describe(c.risk.lose, S, pe.vars).join(', ') || 'nothing happens';
        return { label: fill(c.label, pe.vars), preview: `${Math.round(c.risk.p * 100)}%: ${w} · ${Math.round((1 - c.risk.p) * 100)}%: ${l}`, risky: true };
      }
      return { label: fill(c.label, pe.vars), preview: describe(c.outcome!, S, pe.vars).join(', ') || 'no effect', risky: false };
    }),
  };
}

function playerLotIn(state: GameState, regionId: RegionId, f: (l: GameState['regions'][RegionId]['lots'][string]) => boolean = () => true): string | null {
  const ids = Object.entries(state.regions[regionId].lots).filter(([, l]) => l.owner === 'player' && l.biz && f(l)).map(([id]) => id);
  return ids.length ? pick(state, ids) : null;
}

function applyOutcome(state: GameState, pe: PendingEvent, o: Outcome): void {
  const S = Number.isFinite(Number(pe.vars.S)) ? Number(pe.vars.S) : eventScale(state, pe.regionId);
  const rid = pe.regionId;
  const rs = state.regions[rid];
  if (o.cash) {
    const d = Math.round(o.cash * S);
    state.cash = Math.max(0, state.cash + d);
    if (d > 0) state.stats.earned += d;
  }
  if (o.gold) state.gold += o.gold;
  if (o.heat) state.heat = Math.min(100, Math.max(0, state.heat + o.heat));
  if (o.rep) state.rep = Math.min(100, Math.max(-100, state.rep + o.rep));
  if (o.pop && rs.factions[o.pop[0]]) rs.factions[o.pop[0]].popularity = Math.max(0.02, rs.factions[o.pop[0]].popularity + o.pop[1]);
  for (const [f, d] of o.standing ?? []) standingDelta(state, rid, f, d);
  (o.buffs ?? []).forEach((b, i) => state.buffs.push({
    id: `ev:${pe.defId}:${i}:${state.t.toFixed(1)}`, label: b.label, mult: b.mult, until: state.t + b.secs,
    regionId: b.all ? undefined : rid, category: b.category, target: 'player',
  }));
  if (o.freeze) {
    const lotId = (pe.vars.lotId && state.regions[rid].lots[String(pe.vars.lotId)]?.owner === 'player') ? String(pe.vars.lotId) : playerLotIn(state, rid);
    if (lotId) state.regions[rid].lots[lotId].frozenUntil = state.t + o.freeze;
  }
  if (o.mood) state.regions.ironhold.vars.unionMood = Math.min(100, Math.max(0, state.regions.ironhold.vars.unionMood + o.mood));
  if (o.hype) state.regions.neonvale.vars.hype = Math.min(HYPE_MAX, Math.max(HYPE_MIN, state.regions.neonvale.vars.hype + o.hype));
  if (o.fuel) state.regions.redmesa.vars.fuelIndex = Math.min(FUEL_MAX, Math.max(FUEL_MIN, state.regions.redmesa.vars.fuelIndex + o.fuel));
  if (o.insure) state.regions.verano.vars.insuredUntil = state.t + o.insure;
  switch (o.special) {
    case 'acceptOffer': {
      const lotId = String(pe.vars.lotId);
      const ls = rs.lots[lotId];
      const r = state.rivals[String(pe.vars.rivalId)];
      if (ls?.owner === 'player' && r) {
        const price = Number(pe.vars.price);
        // The offer was made with money they had then; rivals never go into debt (critic evaluation #2, finding 3).
        if (r.acquired || r.cash < price) { notify(state, 'The buyer backed out: they can no longer cover the price.', 'bad'); return; }
        state.cash += price + ls.till;
        r.cash -= price;
        Object.assign(ls, { owner: r.id, till: 0, manager: true, invested: 0 });
      }
      break;
    }
    case 'buyDiscount': {
      const lotId = String(pe.vars.lotId);
      const ls = rs.lots[lotId];
      const price = Number(pe.vars.price);
      const r = state.rivals[String(pe.vars.rivalId)];
      if (ls && r && ls.owner === r.id && state.cash >= price) {
        state.cash -= price;
        r.cash += price;
        Object.assign(ls, { owner: 'player', till: 0, manager: false, invested: lotValue(state, rid, lotId) });
        state.stats.rivalLotsBought++;
      } else { notify(state, 'The deal fell through — you could not cover it.', 'bad'); return; }
      break;
    }
    case 'loseShipment': {
      const i = state.shipments.findIndex((s) => s.from === rid || s.to === rid);
      if (i >= 0) state.shipments.splice(i, 1);
      else if (state.shipments.length) state.shipments.shift();
      break;
    }
    case 'exposeRival': {
      const r = state.rivals[String(pe.vars.rivalId)];
      if (r) r.cash *= 0.85;
      break;
    }
    case 'loseManager': {
      for (const R of Object.values(state.regions)) {
        const hit = Object.values(R.lots).find((l) => l.owner === 'player' && l.manager);
        if (hit) { hit.manager = false; break; }
      }
      break;
    }
    case 'vc': {
      const v = state.regions.neonvale.vars;
      state.cash += S * 4;
      v.vcShare = 0.25;
      v.vcUntil = state.t + 1800;
      break;
    }
    case 'wageDeal':
      state.regions.ironhold.vars.wageDeal = Math.min(WAGE_DEAL_MAX, state.regions.ironhold.vars.wageDeal + 0.05);
      break;
  }
  state.rev++;
  notify(state, o.text, (o.cash ?? 0) < 0 || (o.heat ?? 0) > 0 || o.freeze ? 'bad' : 'good');
}

export function resolveEvent(state: GameState, choice: number): { ok: boolean; text?: string; won?: boolean } {
  const pe = state.pendingEvent;
  if (!pe) return { ok: false };
  const def = EVENT[pe.defId];
  const c = def.choices[choice];
  if (!c) return { ok: false };
  let o: Outcome;
  let won: boolean | undefined;
  if (c.risk) { won = next(state) < c.risk.p; o = won ? c.risk.win : c.risk.lose; } else o = c.outcome!;
  state.pendingEvent = null;
  applyOutcome(state, pe, o);
  return { ok: true, text: o.text, won };
}

/** Lots in the player's current city that the event refers to (for camera focus in the UI). */
export const eventLot = (state: GameState) => {
  const id = state.pendingEvent?.vars.lotId;
  return id ? getCity(state.pendingEvent!.regionId).lotById[String(id)] ?? null : null;
};
