// Rival companies: they earn, expand, upgrade, lobby, start price wars, make offers for your
// businesses and (if shady) sabotage you. You can buy their lots or acquire them outright.
import type { ActionResult, BusinessDef, GameState, Personality, RegionId, RivalDef } from './types';
import { REGION, REGION_IDS } from './data/regions';
import { BIZ } from './data/businesses';
import { getCity, type LotDef } from './city';
import {
  allowedBiz, bizCost, derived, landPrice, lotValue, netWorth, npcAsk, rivalAsk, rivalNetWorth, upgradeCost,
} from './economy';
import { chance, next, pick, range, weighted } from './rng';
import { notify } from './notify';
import { trigger } from './events';
import { money } from './format';
import { MAX_LEVEL } from './constants';

const P: Record<Personality, { buy: number; npc: number; war: number; offer: number; sabotage: number; reserve: number }> = {
  aggressive: { buy: 0.1, npc: 0.03, war: 0.06, offer: 0.03, sabotage: 0, reserve: 2 },
  expansionist: { buy: 0.16, npc: 0.05, war: 0.02, offer: 0.02, sabotage: 0, reserve: 2 },
  cautious: { buy: 0.05, npc: 0.02, war: 0, offer: 0.015, sabotage: 0, reserve: 4 },
  shady: { buy: 0.08, npc: 0.02, war: 0.03, offer: 0.02, sabotage: 0.025, reserve: 2.5 },
};
export const PRICE_WAR_MULT = 0.65;
/** Rival offers and sabotage start this many seconds into a game. */
export const RIVAL_EVENTS_AFTER = 600;
/** Rivals only bid for businesses worth at least this much (× the region's cost index). */
export const OFFER_MIN_VALUE = 4000;
export const PRICE_WAR_SECS = 120;
/** Share of their profit rivals bank; the rest goes to their owners and head office. At 100 % every
 *  rival compounded at the player's rate on top of a head start of millions, so the Rich List was a
 *  race nobody could join (critic evaluation #2, finding 2). */
export const RIVAL_RETAIN = 0.25;

export const rivalDef = (id: string): RivalDef => {
  for (const R of REGION_IDS) {
    const d = REGION[R].rivals.find((r) => r.id === id);
    if (d) return d;
  }
  throw new Error('unknown rival ' + id);
};

/** What a rival would open on an empty lot: its focus businesses, or anything allowed there. */
function openOptions(regionId: RegionId, lot: LotDef, rival: RivalDef): BusinessDef[] {
  const opts = allowedBiz(regionId, lot).filter((b) => rival.focus.includes(b.category));
  return opts.length ? opts : allowedBiz(regionId, lot);
}

/** The rival pays `price` (land, or an NPC's asking price) plus, on an empty lot, the cost of opening
 *  `bizId`. Callers check that the rival can pay: rivals never go into debt (critic evaluation #2, finding 3). */
function claimLot(state: GameState, regionId: RegionId, lotId: string, rival: RivalDef, price: number, bizId: string | null = null): void {
  const ls = state.regions[regionId].lots[lotId];
  const r = state.rivals[rival.id];
  r.cash -= price;
  if (!ls.biz && bizId) {
    r.cash -= bizCost(state, regionId, BIZ[bizId]);
    ls.biz = bizId;
    ls.level = 1;
  }
  ls.owner = rival.id;
  ls.manager = true;
  ls.till = 0;
  state.rev++;
}

/** One decision for one rival. Called every ~10 sim seconds per rival. */
export function rivalAct(state: GameState, rivalId: string): void {
  const r = state.rivals[rivalId];
  if (!r || r.acquired) return;
  const def = rivalDef(rivalId);
  const p = P[def.personality];
  const regionId = r.regionId;
  const rs = state.regions[regionId];
  const city = getCity(regionId);
  const roll = next(state);
  let acc = 0;

  // 1) Expand onto a vacant lot.
  if (roll < (acc += p.buy)) {
    const vacant = city.lots.filter((d) => rs.lots[d.id].owner === 'vacant');
    const share = Object.values(rs.lots).filter((l) => l.owner === rivalId).length / city.lots.length;
    if (vacant.length > 3 && share < 0.22) {
      // Land plus the opening, paid out of what the rival can spare after its reserve.
      const budget = r.cash / p.reserve;
      const cost = (d: LotDef, b: BusinessDef) => landPrice(state, regionId, d) + bizCost(state, regionId, b);
      const affordable = vacant.filter((d) => openOptions(regionId, d, def).some((b) => cost(d, b) <= budget));
      if (affordable.length) {
        const d = weighted(state, affordable, (x) => {
          const dist = REGION[regionId].districts.find((q) => q.id === x.district)!;
          return Math.max(...def.focus.map((c) => dist.fit[c] ?? 1)) * (x.footprint === 'small' ? 0.6 : 1);
        });
        const b = weighted(state, openOptions(regionId, d, def).filter((x) => cost(d, x) <= budget), (x) => x.tier);
        claimLot(state, regionId, d.id, def, landPrice(state, regionId, d), b.id);
        r.lastAction = `Opened a new site in ${REGION[regionId].districts.find((q) => q.id === d.district)!.name}.`;
        if (rs.unlocked) {
          // Only a grab that competes with one of your businesses (same district + category) is worth a toast.
          const nb = rs.lots[d.id].biz;
          const threat = !!nb && city.lots.some((o) => o.district === d.district && rs.lots[o.id].owner === 'player' && rs.lots[o.id].biz && BIZ[rs.lots[o.id].biz!].category === BIZ[nb].category);
          const dn = REGION[regionId].districts.find((q) => q.id === d.district)!.name;
          notify(state, threat ? `${def.name} opened a rival ${BIZ[nb!].name} next to yours in ${dn}.` : `${def.name} grabbed a lot in ${dn}.`, threat ? 'rival' : 'market');
        }
        return;
      }
    }
  }
  // 2) Buy an NPC business.
  if (roll < (acc += p.npc)) {
    const npc = city.lots.filter((d) => rs.lots[d.id].owner === 'npc');
    if (npc.length) {
      const d = pick(state, npc);
      const price = npcAsk(state, regionId, d.id);
      if (price * p.reserve < r.cash) {
        claimLot(state, regionId, d.id, def, price);
        r.lastAction = `Bought out ${BIZ[rs.lots[d.id].biz!].name}.`;
        return;
      }
    }
  }
  // 3) Price war against the player in a district where both sell the same category. Like offers and
  //    sabotage it waits ten minutes, and rivals only pick a fight you can answer: buying them out of
  //    that district + category costs no more than your net worth (critic evaluation #2, finding 1).
  if (roll < (acc += p.war) && rs.unlocked && state.t >= RIVAL_EVENTS_AFTER) {
    const nw = netWorth(state);
    const targets: { district: string; cat: string; cost: number }[] = [];
    for (const d of city.lots) {
      const ls = rs.lots[d.id];
      if (ls.owner !== 'player' || !ls.biz) continue;
      const cat = BIZ[ls.biz].category;
      if (theirCount(state, regionId, rivalId, d.district, cat) === 0) continue;
      const cost = warBuyoutCost(state, regionId, rivalId, d.district, cat);
      if (cost <= nw) targets.push({ district: d.district, cat, cost });
    }
    const already = state.buffs.some((b) => b.id.startsWith('war:' + rivalId) && b.until > state.t);
    if (targets.length && !already) {
      const tg = pick(state, targets);
      const dname = REGION[regionId].districts.find((q) => q.id === tg.district)!.name;
      state.buffs.push({ id: `war:${rivalId}:${state.t.toFixed(1)}`, label: `${def.name} price war`, mult: PRICE_WAR_MULT, until: state.t + PRICE_WAR_SECS, regionId, category: tg.cat as never, districtId: tg.district, target: 'player' });
      r.cash -= Math.min(r.cash * 0.02, 50_000);
      r.lastAction = `Price war on ${tg.cat} in ${dname}.`;
      state.rev++;
      notify(state, `${def.name} slashed prices: your ${tg.cat} income in ${dname} is −35 % for 2 min. Buy out their ${tg.cat} business${theirCount(state, regionId, rivalId, tg.district, tg.cat) > 1 ? 'es' : ''} in ${dname} (about ${money(tg.cost)}) to end it.`, 'rival');
      return;
    }
  }
  // 4) Offer to buy one of the player's businesses (resolved through the event system). Rivals
  //    don't bother with a street cart, and give a newcomer ten minutes first (critic #14).
  if (roll < (acc += p.offer) && !state.pendingEvent && rs.unlocked && state.t >= RIVAL_EVENTS_AFTER) {
    const mine = city.lots.filter((d) => rs.lots[d.id].owner === 'player' && rs.lots[d.id].biz && lotValue(state, regionId, d.id) >= OFFER_MIN_VALUE * REGION[regionId].economy.costIndex);
    if (mine.length) {
      const d = pick(state, mine);
      const price = Math.round(lotValue(state, regionId, d.id) * range(state, 1.4, 1.9));
      if (price < r.cash) {
        trigger(state, 'rival_offer', regionId, { rival: def.name, rivalId, lotId: d.id, biz: BIZ[rs.lots[d.id].biz!].name, price });
        r.lastAction = 'Made you an offer.';
        return;
      }
    }
  }
  // 5) Sabotage (shady rivals only).
  if (roll < (acc += p.sabotage) && !state.pendingEvent && rs.unlocked && state.t >= RIVAL_EVENTS_AFTER) {
    const mine = city.lots.filter((d) => rs.lots[d.id].owner === 'player' && rs.lots[d.id].biz);
    if (mine.length) {
      const d = pick(state, mine);
      trigger(state, 'sabotage', regionId, { rival: def.name, rivalId, lotId: d.id, biz: BIZ[rs.lots[d.id].biz!].name });
      r.lastAction = 'Up to something.';
      return;
    }
  }
  // 6) Lobby their favourite faction.
  if (roll < (acc += 0.06)) {
    const amt = Math.min(r.cash * 0.02, 250_000 * REGION[regionId].economy.costIndex);
    if (amt > 0 && rs.factions[def.favFaction]) {
      r.cash -= amt;
      rs.factions[def.favFaction].donated += amt;
      r.lastAction = `Funded ${REGION[regionId].factions.find((f) => f.id === def.favFaction)!.name}.`;
      return;
    }
  }
  // 7) Default: upgrade their cheapest-to-upgrade business.
  const own = city.lots.filter((d) => rs.lots[d.id].owner === rivalId && rs.lots[d.id].biz && rs.lots[d.id].level < MAX_LEVEL);
  if (own.length) {
    let best = own[0];
    let bestCost = Infinity;
    for (const d of own) {
      const ls = rs.lots[d.id];
      const c = upgradeCost(state, regionId, BIZ[ls.biz!], ls.level);
      if (c < bestCost) { bestCost = c; best = d; }
    }
    const ls = rs.lots[best.id];
    let n = 0;
    while (n < 5 && r.cash > upgradeCost(state, regionId, BIZ[ls.biz!], ls.level) * p.reserve && ls.level < MAX_LEVEL) {
      r.cash -= upgradeCost(state, regionId, BIZ[ls.biz!], ls.level);
      ls.level++;
      n++;
    }
    if (n) { r.lastAction = `Expanded ${BIZ[ls.biz!].name} to level ${ls.level}.`; state.rev++; }
  }
}

/** Rivals bank RIVAL_RETAIN of their income continuously (offline.ts does the same while you are away). */
export function rivalIncome(state: GameState, dt: number): void {
  const d = derived(state);
  for (const [id, inc] of Object.entries(d.rivals)) {
    const r = state.rivals[id];
    if (r && !r.acquired) r.cash += inc * dt * RIVAL_RETAIN;
  }
}

/** NPC churn keeps the city alive: shops close (new vacancies) and open. */
export function npcChurn(state: GameState): void {
  for (const regionId of REGION_IDS) {
    const rs = state.regions[regionId];
    const city = getCity(regionId);
    if (chance(state, 0.22)) {
      const npc = city.lots.filter((d) => rs.lots[d.id].owner === 'npc');
      if (npc.length) {
        const d = pick(state, npc);
        const old = rs.lots[d.id].biz;
        rs.lots[d.id] = { ...rs.lots[d.id], owner: 'vacant', biz: null, level: 0 };
        state.rev++;
        if (regionId === state.currentRegion && old) notify(state, `For sale: the old ${BIZ[old].name} in ${REGION[regionId].districts.find((q) => q.id === d.district)!.name} just closed.`, 'market');
      }
    }
    if (chance(state, 0.12)) {
      const vacant = city.lots.filter((d) => rs.lots[d.id].owner === 'vacant');
      if (vacant.length > 6) {
        const d = pick(state, vacant);
        const b = pick(state, allowedBiz(regionId, d).filter((x) => x.tier <= 2));
        rs.lots[d.id] = { ...rs.lots[d.id], owner: 'npc', biz: b.id, level: 1 + Math.floor(next(state) * 4) };
        state.rev++;
      }
    }
  }
}

/** What buying a rival out of a district + category costs at their asking prices (ends a price war there). */
export function warBuyoutCost(state: GameState, regionId: RegionId, rivalId: string, district: string, cat: string): number {
  const rs = state.regions[regionId];
  let c = 0;
  for (const o of getCity(regionId).lots) {
    const ls = rs.lots[o.id];
    if (o.district === district && ls.owner === rivalId && ls.biz && BIZ[ls.biz].category === cat) c += rivalAsk(state, regionId, o.id);
  }
  return c;
}

/** How many businesses of a category a rival runs in a district. */
function theirCount(state: GameState, regionId: RegionId, rivalId: string, district: string, cat: string): number {
  const rs = state.regions[regionId];
  return getCity(regionId).lots.filter((o) => o.district === district && rs.lots[o.id].owner === rivalId && rs.lots[o.id].biz && BIZ[rs.lots[o.id].biz!].category === cat).length;
}

export function buyRivalLot(state: GameState, regionId: RegionId, lotId: string): ActionResult {
  const rs = state.regions[regionId];
  const ls = rs.lots[lotId];
  const r = state.rivals[ls.owner];
  if (!r) return { ok: false, msg: 'That property is not owned by a rival.' };
  const price = rivalAsk(state, regionId, lotId);
  if (state.cash < price) return { ok: false, msg: `${rivalDef(r.id).name} wants ${money(price)}.` };
  state.cash -= price;
  r.cash += price;
  ls.owner = 'player';
  ls.manager = false;
  ls.till = 0;
  ls.invested = lotValue(state, regionId, lotId);
  state.stats.rivalLotsBought++;
  state.rev++;
  notify(state, `You bought ${BIZ[ls.biz!].name} from ${rivalDef(r.id).name} for ${money(price)}.`, 'good');
  // A price war needs a rival shop in that district + category: buying them out of it ends the war.
  const n0 = state.buffs.length;
  state.buffs = state.buffs.filter((b) => !(b.id.startsWith(`war:${r.id}:`) && b.regionId === regionId && b.districtId && b.category &&
    theirCount(state, regionId, r.id, b.districtId, b.category) === 0));
  if (state.buffs.length < n0) notify(state, `Price war over: ${rivalDef(r.id).name} has nothing left to undercut you with there.`, 'good');
  return { ok: true };
}

export const acquireCost = (state: GameState, rivalId: string) => Math.round(rivalNetWorth(state, rivalId) * 1.3);
export function canAcquire(state: GameState, rivalId: string): { ok: boolean; msg?: string } {
  const r = state.rivals[rivalId];
  if (!r || r.acquired) return { ok: false, msg: 'Already gone.' };
  if (!state.regions[r.regionId].unlocked) return { ok: false, msg: `Open an office in ${REGION[r.regionId].name} first.` };
  const nw = rivalNetWorth(state, rivalId);
  if (netWorth(state) < nw * 1.5) return { ok: false, msg: `You need a net worth of ${money(nw * 1.5)} (1.5× theirs).` };
  if (state.cash < acquireCost(state, rivalId)) return { ok: false, msg: `You need ${money(acquireCost(state, rivalId))} in cash.` };
  return { ok: true };
}
export function acquireRival(state: GameState, rivalId: string): ActionResult {
  const c = canAcquire(state, rivalId);
  if (!c.ok) return c;
  const r = state.rivals[rivalId];
  const cost = acquireCost(state, rivalId);
  state.cash -= cost;
  state.cash += r.cash;
  let n = 0;
  for (const [lotId, ls] of Object.entries(state.regions[r.regionId].lots)) {
    if (ls.owner !== rivalId) continue;
    ls.owner = 'player';
    ls.invested = lotValue(state, r.regionId, lotId);
    n++;
  }
  r.cash = 0;
  r.acquired = true;
  state.buffs = state.buffs.filter((b) => !b.id.startsWith('war:' + rivalId));
  state.stats.acquisitions++;
  state.rev++;
  notify(state, `HOSTILE TAKEOVER COMPLETE. ${rivalDef(rivalId).name} is yours — ${n} properties absorbed.`, 'good');
  return { ok: true };
}

export interface RichEntry { id: string; name: string; who: string; color: string; regionId: RegionId | null; netWorth: number; isPlayer: boolean; }
export function richList(state: GameState, playerName = 'You'): RichEntry[] {
  const out: RichEntry[] = [{ id: 'player', name: playerName, who: 'Self-made (allegedly)', color: '#f2c14e', regionId: null, netWorth: netWorth(state), isPlayer: true }];
  for (const r of Object.values(state.rivals)) {
    if (r.acquired) continue;
    const d = rivalDef(r.id);
    out.push({ id: r.id, name: d.ceo, who: d.name, color: d.color, regionId: r.regionId, netWorth: rivalNetWorth(state, r.id), isPlayer: false });
  }
  return out.sort((a, b) => b.netWorth - a.netWorth);
}
