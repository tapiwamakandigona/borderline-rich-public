// The only way the UI changes game state. Every action validates, mutates and bumps state.rev.
import type { ActionResult, GameState, RegionId, VehicleId } from './types';
import { REGION } from './data/regions';
import { BIZ } from './data/businesses';
import {
  ACCOUNTANT_COST, BROKER_COST, CARGO_UPGRADE, HUSTLE_MAX, MAX_SHIP_SLOTS, PAINTS, RANK_BROKER, RANK_EXPAND, RANKS,
  SHIP_SLOT_COST, VEHICLE, hustleUpgradeCost,
} from './data/progression';
import { getCity } from './city';
import {
  allowedBiz, bizCost, derived, landPrice, lotValue, maxAffordable, milestoneMult, npcAsk, sellPrice, upgradeCostN,
} from './economy';
import { costIndex, laws } from './laws';
import { ownsBiz, permitWait } from './mechanics';
import { chance } from './rng';
import { notify } from './notify';
import { money } from './format';
import { MAX_LEVEL } from './constants';

export { buyRivalLot, acquireRival } from './rivals';
export { ship } from './trade';
export { politicalAction, buyGuildSeat } from './politics';
export { resolveEvent } from './events';

const ok: ActionResult = { ok: true };
const fail = (msg: string): ActionResult => ({ ok: false, msg });

// ── Hustle ───────────────────────────────────────────────────────────────────
export const hustlePerTap = (s: GameState) => REGION[s.currentRegion].hustle.perTap * (1 + 0.75 * s.hustle.level);
export const comboMult = (s: GameState) => 1 + Math.min(s.hustle.combo, 20) * 0.05;

export function hustleTap(s: GameState): number {
  s.hustle.combo = s.t - s.hustle.lastTapAt < 0.6 ? s.hustle.combo + 1 : 1;
  s.hustle.lastTapAt = s.t;
  const earn = hustlePerTap(s) * comboMult(s);
  s.cash += earn;
  s.stats.earned += earn;
  s.stats.hustles++;
  return earn;
}
export const hustleCost = (s: GameState) => Math.round(hustleUpgradeCost(s.hustle.level) * costIndex(s.homeRegion));
export function upgradeHustle(s: GameState): ActionResult {
  if (s.hustle.level >= HUSTLE_MAX) return fail('Your hustle is maxed out.');
  const c = hustleCost(s);
  if (s.cash < c) return fail(`Need ${money(c)}.`);
  s.cash -= c;
  s.hustle.level++;
  s.rev++;
  return ok;
}

// ── Property ─────────────────────────────────────────────────────────────────
function present(s: GameState, regionId: RegionId): ActionResult | null {
  return s.regions[regionId].unlocked ? null : fail(`Open an office in ${REGION[regionId].name} first.`);
}
export const vacantPrice = (s: GameState, regionId: RegionId, lotId: string, bizId: string) =>
  landPrice(s, regionId, getCity(regionId).lotById[lotId]) + bizCost(s, regionId, BIZ[bizId]);

export function buyVacant(s: GameState, regionId: RegionId, lotId: string, bizId: string): ActionResult {
  const p = present(s, regionId);
  if (p) return p;
  const def = getCity(regionId).lotById[lotId];
  const ls = s.regions[regionId].lots[lotId];
  if (!def || !ls || ls.owner !== 'vacant') return fail('That lot is not for sale.');
  const b = BIZ[bizId];
  if (!b || !allowedBiz(regionId, def).includes(b)) return fail('That business does not fit here.');
  const cost = vacantPrice(s, regionId, lotId, bizId);
  if (s.cash < cost) return fail(`Need ${money(cost)}.`);
  s.cash -= cost;
  Object.assign(ls, { owner: 'player', biz: bizId, level: 1, till: 0, manager: false, invested: cost, frozenUntil: 0 });
  const wait = regionId === 'redmesa' ? permitWait(s, bizId) : 0;
  ls.permitUntil = wait > 0 ? s.t + wait : 0;
  s.stats.bizBought++;
  s.rev++;
  notify(s, `You opened a ${b.name}${ls.permitUntil ? ' — awaiting its permit' : ''}.`, 'good');
  return ok;
}

export function buyNpc(s: GameState, regionId: RegionId, lotId: string): ActionResult {
  const p = present(s, regionId);
  if (p) return p;
  const ls = s.regions[regionId].lots[lotId];
  if (!ls || ls.owner !== 'npc') return fail('That business is not on the market.');
  const price = npcAsk(s, regionId, lotId);
  if (s.cash < price) return fail(`Need ${money(price)}.`);
  s.cash -= price;
  Object.assign(ls, { owner: 'player', till: 0, manager: false, invested: price, frozenUntil: 0, permitUntil: 0 });
  s.stats.bizBought++;
  s.rev++;
  notify(s, `You bought the ${BIZ[ls.biz!].name} for ${money(price)}.`, 'good');
  return ok;
}

export function upgradeLot(s: GameState, regionId: RegionId, lotId: string, n: number | 'max'): ActionResult & { levels?: number } {
  const ls = s.regions[regionId].lots[lotId];
  if (!ls || ls.owner !== 'player' || !ls.biz) return fail('Not your business.');
  const b = BIZ[ls.biz];
  const count = n === 'max' ? maxAffordable(s, regionId, b, ls.level, s.cash) : Math.min(n, MAX_LEVEL - ls.level);
  if (count <= 0) return fail(ls.level >= MAX_LEVEL ? 'Maxed out.' : 'Not enough cash.');
  const cost = upgradeCostN(s, regionId, b, ls.level, count);
  if (s.cash < cost - 1e-6) return fail(`Need ${money(cost)}.`);
  const before = milestoneMult(ls.level);
  s.cash -= cost;
  ls.level += count;
  ls.invested += cost;
  s.rev++;
  if (milestoneMult(ls.level) > before) notify(s, `${b.name} reached level ${ls.level} — income ×${milestoneMult(ls.level) / before}!`, 'good');
  return { ok: true, levels: count };
}

export const managerCost = (s: GameState, regionId: RegionId, lotId: string) => {
  const ls = s.regions[regionId].lots[lotId];
  return ls.biz ? Math.round(2 * bizCost(s, regionId, BIZ[ls.biz])) : 0;
};
export function hireManager(s: GameState, regionId: RegionId, lotId: string): ActionResult {
  const ls = s.regions[regionId].lots[lotId];
  if (!ls || ls.owner !== 'player' || !ls.biz) return fail('Not your business.');
  if (ls.manager) return fail('Already managed.');
  const c = managerCost(s, regionId, lotId);
  if (s.cash < c) return fail(`Need ${money(c)}.`);
  s.cash -= c;
  ls.manager = true;
  collect(s, regionId, lotId);
  s.rev++;
  notify(s, `Manager hired for your ${BIZ[ls.biz].name}. Income now banks automatically.`, 'good');
  return ok;
}

export function collect(s: GameState, regionId: RegionId, lotId: string): number {
  const ls = s.regions[regionId].lots[lotId];
  if (!ls || ls.owner !== 'player' || ls.till <= 0) return 0;
  const v = ls.till;
  s.cash += v;
  s.stats.earned += v;
  ls.till = 0;
  if (v >= 0.5) s.stats.collects++;
  return v;
}
export function collectAll(s: GameState): number {
  if (!s.accountant) return 0;
  let total = 0;
  for (const [regionId, rs] of Object.entries(s.regions)) for (const id of Object.keys(rs.lots)) total += collect(s, regionId as RegionId, id);
  return total;
}

export function sellLot(s: GameState, regionId: RegionId, lotId: string): ActionResult {
  const ls = s.regions[regionId].lots[lotId];
  if (!ls || ls.owner !== 'player') return fail('Not yours to sell.');
  const price = sellPrice(s, regionId, lotId);
  s.cash += price + ls.till;
  Object.assign(ls, { owner: ls.biz ? 'npc' : 'vacant', till: 0, manager: false, invested: 0, permitUntil: 0 });
  s.rev++;
  notify(s, `Sold for ${money(price)}.`, 'info');
  return ok;
}

// ── Upgrades & services ──────────────────────────────────────────────────────
export const accountantCost = (s: GameState) => Math.round(ACCOUNTANT_COST * costIndex(s.homeRegion));
export function buyAccountant(s: GameState): ActionResult {
  if (s.accountant) return fail('Already hired.');
  const c = accountantCost(s);
  if (s.cash < c) return fail(`Need ${money(c)}.`);
  s.cash -= c; s.accountant = true; s.rev++;
  return ok;
}
export function buyBroker(s: GameState): ActionResult {
  if (s.broker) return fail('Already hired.');
  if (s.stats.rankIndex < RANK_BROKER) return fail(`Brokers only work for a ${RANKS[RANK_BROKER].name} or above.`);
  if (s.cash < BROKER_COST) return fail(`Need ${money(BROKER_COST)}.`);
  s.cash -= BROKER_COST; s.broker = true; s.rev++;
  return ok;
}
export function buyVehicle(s: GameState, id: VehicleId): ActionResult {
  const v = VEHICLE[id];
  if (s.vehiclesOwned.includes(id)) { s.vehicle = id; s.rev++; return ok; }
  if (s.cash < v.cost) return fail(`Need ${money(v.cost)}.`);
  s.cash -= v.cost;
  s.vehiclesOwned.push(id);
  s.vehicle = id;
  s.rev++;
  notify(s, `New ride: ${v.name}.`, 'good');
  return ok;
}
export function buyPaint(s: GameState, id: string): ActionResult {
  const p = PAINTS.find((x) => x.id === id);
  if (!p || p.starterOnly) return fail('Not available.');
  if (s.gold < p.gold) return fail(`Need ${p.gold} gold.`);
  s.gold -= p.gold; s.paint = id; s.rev++;
  return ok;
}
/** Switch paint: the Gilded paint comes with the Starter Pack, the others cost gold each time. */
export function applyPaint(s: GameState, id: string): ActionResult {
  const p = PAINTS.find((x) => x.id === id);
  if (!p) return fail('Not available.');
  if (s.paint === id) return fail('Already painted that colour.');
  if (!p.starterOnly) return buyPaint(s, id);
  if (!s.entitlements.starterPack) return fail('Gilded paint comes with the Starter Pack.');
  s.paint = id; s.rev++;
  return ok;
}
export function upgradeCargo(s: GameState): ActionResult {
  const c = CARGO_UPGRADE[s.cargoLevel];
  if (c === undefined) return fail('Fleet is maxed.');
  if (s.cash < c) return fail(`Need ${money(c)}.`);
  s.cash -= c; s.cargoLevel++; s.rev++;
  return ok;
}
export function buyShipSlot(s: GameState): ActionResult {
  if (s.shipSlots >= MAX_SHIP_SLOTS) return fail('Maximum slots.');
  const c = SHIP_SLOT_COST[s.shipSlots - 1];
  if (s.cash < c) return fail(`Need ${money(c)}.`);
  s.cash -= c; s.shipSlots++; s.rev++;
  return ok;
}

// ── Regions ──────────────────────────────────────────────────────────────────
export function unlockRegion(s: GameState, regionId: RegionId): ActionResult {
  const rs = s.regions[regionId];
  if (rs.unlocked) return fail('Already open.');
  if (s.stats.rankIndex < RANK_EXPAND) return fail(`Expansion unlocks at ${RANKS[RANK_EXPAND].name}.`);
  const c = REGION[regionId].unlockCost;
  if (s.cash < c) return fail(`Opening an office costs ${money(c)}.`);
  s.cash -= c; rs.unlocked = true; s.rev++;
  notify(s, `You opened an office in ${REGION[regionId].name}!`, 'good');
  return ok;
}
export function travel(s: GameState, regionId: RegionId): ActionResult {
  if (!s.regions[regionId].unlocked) return fail('Open an office there first.');
  s.currentRegion = regionId; s.rev++;
  return ok;
}

// ── Region signature actions ─────────────────────────────────────────────────
export function expeditePermit(s: GameState, lotId: string): ActionResult {
  const ls = s.regions.redmesa.lots[lotId];
  if (!ls || ls.owner !== 'player' || ls.permitUntil <= s.t) return fail('No permit pending.');
  const c = Math.round(0.15 * bizCost(s, 'redmesa', BIZ[ls.biz!]));
  if (s.cash < c) return fail(`The clerk wants ${money(c)}.`);
  s.cash -= c;
  ls.permitUntil = 0;
  s.heat = Math.min(100, s.heat + 8);
  const fs = s.regions.redmesa.factions.circle;
  if (fs) fs.standing = Math.min(100, fs.standing + 4);
  s.rev++;
  if (s.regions.redmesa.ruling === 'reform' && chance(s, 0.35)) {
    s.rep = Math.max(-100, s.rep - 10); s.heat = Math.min(100, s.heat + 15);
    notify(s, 'Reform investigators caught the permit clerk taking your envelope. Rep −10, heat +15.', 'bad');
  } else notify(s, 'Permit "expedited". The clerk has a new watch.', 'info');
  return ok;
}
export function toggleOffshore(s: GameState, on: boolean): ActionResult {
  if (on && !ownsBiz(s, 'verano', 'offshore')) return fail('You need an Offshore Office in Puerto Verano.');
  s.regions.verano.vars.offshore = on; s.rev++;
  notify(s, on ? 'Offshore shelter ON: income tax outside Verano −55 %. Heat will build.' : 'Offshore shelter off.', on ? 'bad' : 'info');
  return ok;
}
export const vcAmount = (s: GameState) => Math.round(Math.max(20_000, derived(s).playerByRegion.neonvale * 900));
export function raiseVC(s: GameState): ActionResult {
  const v = s.regions.neonvale.vars;
  if (v.vcShare > 0) return fail('Your investors are still taking their cut.');
  const hasTech = Object.values(s.regions.neonvale.lots).some((l) => l.owner === 'player' && l.biz && BIZ[l.biz].category === 'tech');
  if (!hasTech) return fail('VCs only fund tech. Own a tech business in Neon Vale.');
  s.cash += vcAmount(s);
  v.vcShare = 0.25; v.vcUntil = s.t + 1800; s.rev++;
  notify(s, 'Round closed! VCs take 25 % of your Neon Vale income for 30 min.', 'good');
  return ok;
}
export function signWageDeal(s: GameState): ActionResult {
  const v = s.regions.ironhold.vars;
  if (v.wageDeal >= 0.3) return fail('Wages are already at the negotiated ceiling.');
  v.wageDeal = Math.min(0.3, v.wageDeal + 0.1);
  v.unionMood = Math.min(100, v.unionMood + 25);
  s.rev++;
  notify(s, 'Wage deal signed: Ironhold wages +10 %, union mood +25, mood erodes slower.', 'good');
  return ok;
}
export const bonusCost = (s: GameState) => Math.round(Math.max(300 * costIndex('ironhold'), derived(s).playerByRegion.ironhold * 90));
export function payUnionBonus(s: GameState): ActionResult {
  const c = bonusCost(s);
  if (s.cash < c) return fail(`Need ${money(c)}.`);
  s.cash -= c;
  s.regions.ironhold.vars.unionMood = Math.min(100, s.regions.ironhold.vars.unionMood + 20);
  s.rev++;
  return ok;
}
export const insuranceCost = (s: GameState) => Math.round(Math.max(500 * costIndex('verano'), derived(s).playerByRegion.verano * 120));
export function buyInsurance(s: GameState): ActionResult {
  const c = insuranceCost(s);
  if (s.cash < c) return fail(`Need ${money(c)}.`);
  s.cash -= c;
  s.regions.verano.vars.insuredUntil = s.t + 960;
  s.rev++;
  return ok;
}

// ── Gold sinks ───────────────────────────────────────────────────────────────
export const GOLD_ITEMS = [
  { id: 'timewarp', name: 'Time Warp', gold: 40, blurb: 'Instantly earn 1 hour of income.' },
  { id: 'turbo', name: 'Turbo', gold: 60, blurb: '2× all income for 4 hours.' },
  { id: 'express', name: 'Express Freight', gold: 8, blurb: 'Your next shipment arrives now.' },
  { id: 'lawyer', name: 'Legal Team', gold: 25, blurb: '−60 heat. No questions asked.' },
] as const;
export function useGold(s: GameState, id: (typeof GOLD_ITEMS)[number]['id']): ActionResult {
  const item = GOLD_ITEMS.find((g) => g.id === id)!;
  if (s.gold < item.gold) return fail(`Need ${item.gold} gold.`);
  switch (id) {
    case 'timewarp': {
      const inc = derived(s, true).player;
      if (inc <= 0) return fail('You need income first.');
      s.cash += inc * 3600; s.stats.earned += inc * 3600;
      break;
    }
    case 'turbo':
      s.buffs.push({ id: `iap:turbo:${s.t.toFixed(1)}`, label: 'Turbo ×2', mult: 2, until: s.t + 4 * 3600, target: 'player' });
      break;
    case 'express': {
      const sh = [...s.shipments].sort((a, b) => a.arriveAt - b.arriveAt)[0];
      if (!sh) return fail('No shipments in transit.');
      sh.arriveAt = s.t;
      break;
    }
    case 'lawyer':
      if (s.heat <= 0) return fail('You are squeaky clean.');
      s.heat = Math.max(0, s.heat - 60);
      break;
  }
  s.gold -= item.gold;
  s.rev++;
  return ok;
}

export const lotInfo = (s: GameState, regionId: RegionId, lotId: string) => ({
  def: getCity(regionId).lotById[lotId],
  ls: s.regions[regionId].lots[lotId],
  value: lotValue(s, regionId, lotId),
  laws: laws(s, regionId),
});
