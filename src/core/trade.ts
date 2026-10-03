// Cross-border trade. Buy in your current region, ship anywhere, sell on arrival.
// Four methods trade tariff cost against risk: legal, transship (via Solenne), undervalue, smuggle.
import type { ActionResult, GameState, GoodId, RegionId, ShipMethod, Shipment } from './types';
import { REGION, REGION_IDS, travelSeconds } from './data/regions';
import { GOOD, GOODS } from './data/businesses';
import { CARGO_CAP } from './data/progression';
import { laws } from './laws';
import { next } from './rng';
import { anchorPrice } from './state';
import { notify } from './notify';
import { money } from './format';

export const METHODS: { id: ShipMethod; name: string; blurb: string }[] = [
  { id: 'legal', name: 'Legal', blurb: 'Pay every tariff. Sleep at night.' },
  { id: 'transship', name: 'Transship via Solenne', blurb: 'Route through the free port: 40 % of the import tariff, slower, small origin-fraud risk.' },
  { id: 'undervalue', name: 'Undervalue invoice', blurb: 'Declare half the value, pay half the tariffs. Audits fine you double.' },
  { id: 'smuggle', name: 'Smuggle', blurb: 'No tariffs at all. Get caught and lose the cargo, pay a fine and gain a lot of heat.' },
];

export interface Quote {
  ok: boolean; msg?: string;
  value: number; exportTariff: number; importTariff: number; fee: number; bribe: number;
  upfront: number; seconds: number; risk: number; expectedRevenue: number;
}

export function quote(state: GameState, good: GoodId, qty: number, to: RegionId, method: ShipMethod, bribe = false): Quote {
  const from = state.currentRegion;
  const g = GOOD[good];
  const value = qty * state.regions[from].market[good];
  const Lo = laws(state, from);
  const Ld = laws(state, to);
  const exp = value * Lo.exportTariff * g.tariffClass;
  const imp = value * Ld.importTariff * g.tariffClass;
  let exportTariff = exp, importTariff = imp, fee = value * 0.03, risk = 0, seconds = travelSeconds(from, to);
  const heat = state.heat;
  let msg: string | undefined;
  switch (method) {
    case 'transship':
      if (from === 'solenne' || to === 'solenne') msg = 'Transshipping only makes sense between two other regions.';
      importTariff = imp * 0.4; fee = value * 0.08; seconds += 40;
      risk = 0.12 * Ld.enforcement + heat / 400;
      break;
    case 'undervalue':
      exportTariff = exp * 0.5; importTariff = imp * 0.5;
      risk = 0.35 * Ld.enforcement + heat / 250;
      break;
    case 'smuggle':
      exportTariff = 0; importTariff = 0; fee = value * 0.05;
      risk = 0.1 + 0.45 * Ld.enforcement + heat / 200;
      break;
  }
  const bribeCost = bribe && method !== 'legal' ? value * 0.06 : 0;
  if (bribeCost > 0) risk *= 1 - 0.6 * REGION[to].economy.corruption;
  risk = Math.min(0.85, Math.max(0, risk));
  if (from === to) msg = 'Pick a destination in another region.';
  if (qty <= 0) msg = 'Choose a quantity.';
  if (qty > CARGO_CAP[state.cargoLevel]) msg = `Your fleet carries ${CARGO_CAP[state.cargoLevel]} units per shipment.`;
  const upfront = value + exportTariff + importTariff + fee + bribeCost;
  const expectedRevenue = qty * state.regions[to].market[good];
  return { ok: !msg, msg, value, exportTariff, importTariff, fee, bribe: bribeCost, upfront, seconds, risk, expectedRevenue };
}

export function ship(state: GameState, good: GoodId, qty: number, to: RegionId, method: ShipMethod, bribe = false): ActionResult {
  const q = quote(state, good, qty, to, method, bribe);
  if (!q.ok) return { ok: false, msg: q.msg };
  if (state.shipments.length >= state.shipSlots) return { ok: false, msg: 'All your shipping slots are busy.' };
  if (state.cash < q.upfront) return { ok: false, msg: `You need ${money(q.upfront)} for goods, tariffs and fees.` };
  state.cash -= q.upfront;
  const s: Shipment = {
    id: state.nextShipId++, good, qty, from: state.currentRegion, to, method,
    cost: q.upfront, value: q.value, tariffPaid: q.exportTariff + q.importTariff, bribed: q.bribe > 0,
    departAt: state.t, arriveAt: state.t + q.seconds, risk: q.risk,
  };
  state.shipments.push(s);
  state.stats.shipments++;
  if (method === 'smuggle') state.stats.smuggled++;
  // Buying moves the local price up a little.
  const m = state.regions[state.currentRegion].market;
  m[good] *= 1 + Math.min(0.12, q.value / (60_000 * REGION[state.currentRegion].economy.costIndex));
  state.rev++;
  notify(state, `Shipped ${qty} ${GOOD[good].name} to ${REGION[to].name} (${METHODS.find((x) => x.id === method)!.name}). ETA ${q.seconds}s.`, 'trade');
  return { ok: true };
}

/** Resolve a shipment that has arrived: customs roll, fines, sale at destination price. */
export function resolveShipment(state: GameState, s: Shipment): void {
  const g = GOOD[s.good];
  const dest = state.regions[s.to];
  const Ld = laws(state, s.to);
  const caught = next(state) < s.risk;
  let revenue = s.qty * dest.market[s.good];
  let fine = 0;
  let text = '';
  if (caught) {
    state.stats.caught++;
    if (s.method === 'smuggle') {
      revenue = 0;
      fine = s.value * 0.5;
      state.heat = Math.min(100, state.heat + 30);
      state.rep = Math.max(-100, state.rep - 10);
      text = `BUSTED. Customs in ${REGION[s.to].name} seized your ${g.name} and fined you`;
    } else if (s.method === 'undervalue') {
      const evaded = s.value * Ld.importTariff * g.tariffClass * 0.5;
      fine = evaded * 2;
      state.heat = Math.min(100, state.heat + 15);
      text = `Audit! Your undervalued ${g.name} invoice was flagged in ${REGION[s.to].name}. Fine`;
    } else if (s.method === 'transship') {
      fine = s.value * Ld.importTariff * g.tariffClass * 0.6 + s.value * 0.25;
      state.heat = Math.min(100, state.heat + 8);
      text = `Origin-fraud ruling on your transshipped ${g.name}. Back tariffs + fine`;
    }
  } else if (s.method === 'smuggle') state.heat = Math.min(100, state.heat + 4);
  const paid = Math.min(state.cash + revenue, fine);
  state.cash = Math.max(0, state.cash + revenue - fine);
  if (revenue > 0) dest.market[s.good] *= 1 - Math.min(0.15, revenue / (50_000 * REGION[s.to].economy.costIndex));
  const profit = revenue - fine - s.cost;
  state.stats.earned += Math.max(0, revenue);
  if (caught) notify(state, `${text} ${money(paid)}.`, 'bad');
  else notify(state, `${s.qty} ${g.name} sold in ${REGION[s.to].name} for ${money(revenue)} (${money(profit, { sign: true })}).`, profit >= 0 ? 'good' : 'trade');
  state.rev++;
}

export function marketTick(state: GameState): void {
  for (const id of REGION_IDS) {
    const m = state.regions[id].market;
    for (const g of GOODS) {
      const a = anchorPrice(id, g.id);
      const shock = (next(state) + next(state) + next(state) - 1.5) * 0.06;
      m[g.id] = Math.min(a * 1.45, Math.max(a * 0.7, m[g.id] * (1 + shock) + (a - m[g.id]) * 0.08));
    }
  }
}

/** Best simple arbitrage from the current region (used by UI hints and the balance bot). */
export function bestRoute(state: GameState): { good: GoodId; to: RegionId; margin: number } | null {
  let best: { good: GoodId; to: RegionId; margin: number } | null = null;
  const from = state.currentRegion;
  for (const g of GOODS) for (const to of REGION_IDS) {
    if (to === from) continue;
    const L = laws(state, to);
    const buy = state.regions[from].market[g.id];
    const sell = state.regions[to].market[g.id];
    const margin = (sell - buy * (1 + 0.03 + L.importTariff * g.tariffClass + laws(state, from).exportTariff * g.tariffClass)) / buy;
    if (!best || margin > best.margin) best = { good: g.id, to, margin };
  }
  return best;
}
