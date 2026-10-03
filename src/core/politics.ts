// Factions, elections and the player's political levers. Each government kind behaves
// differently: council (permanent guild seats), governor (rigged + gifts that raise heat),
// democracy (donations that reset each vote).
import type { ActionResult, GameState, Laws, RegionId } from './types';
import { REGION } from './data/regions';
import { DAY } from './constants';
import { costIndex, laws } from './laws';
import { chance, weighted } from './rng';
import { notify } from './notify';
import { money, pct } from './format';

export const donationBoost = (regionId: RegionId, donated: number) =>
  0.12 * Math.log10(1 + donated / (2000 * costIndex(regionId)));
export const SEAT_WEIGHT = 0.06;

export function electionWeights(state: GameState, regionId: RegionId): Record<string, number> {
  const R = REGION[regionId];
  const rs = state.regions[regionId];
  const w: Record<string, number> = {};
  for (const f of R.factions) {
    const fs = rs.factions[f.id];
    let x = Math.max(0.02, fs.popularity + donationBoost(regionId, fs.donated) + fs.seats * SEAT_WEIGHT);
    if (f.id === rs.ruling) x *= R.government.incumbentBias;
    w[f.id] = x;
  }
  return w;
}
export function winChances(state: GameState, regionId: RegionId): Record<string, number> {
  const w = electionWeights(state, regionId);
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v / total]));
}

function lawDiff(a: Laws, b: Laws): string {
  const parts: string[] = [];
  const keys: [keyof Laws, string][] = [['incomeTax', 'income tax'], ['importTariff', 'import tariff'], ['enforcement', 'enforcement'], ['minWage', 'wage floor'], ['regulation', 'red tape']];
  for (const [k, label] of keys) {
    const x = a[k] as number;
    const y = b[k] as number;
    if (Math.abs(x - y) > 0.004) parts.push(`${label} ${k === 'minWage' ? '×' + x.toFixed(2) : pct(x)} → ${k === 'minWage' ? '×' + y.toFixed(2) : pct(y)}`);
  }
  return parts.join(', ');
}

export function runElection(state: GameState, regionId: RegionId): string {
  const R = REGION[regionId];
  const rs = state.regions[regionId];
  const before = laws(state, regionId);
  const w = electionWeights(state, regionId);
  const winner = weighted(state, R.factions, (f) => w[f.id]).id;
  const changed = winner !== rs.ruling;
  rs.ruling = winner;
  for (const f of R.factions) {
    const fs = rs.factions[f.id];
    fs.donated = 0;
    fs.popularity = fs.popularity * 0.85 + f.basePopularity * 0.15;
  }
  rs.nextElectionAt = state.t + R.government.electionEveryDays * DAY;
  state.rev++;
  const fname = R.factions.find((f) => f.id === winner)!.name;
  const diff = lawDiff(before, laws(state, regionId));
  const verb = R.government.kind === 'council' ? 'carries the council vote' : R.government.kind === 'governor' ? 'keeps hold of the territory' : 'wins the election';
  notify(state, changed
    ? `${R.name}: ${fname} ${verb === 'keeps hold of the territory' ? 'seizes the territory' : verb}!${diff ? ' ' + diff + '.' : ''}`
    : `${R.name}: ${fname} ${verb}. Laws unchanged.`, 'politics');
  return winner;
}

export function standingDelta(state: GameState, regionId: RegionId, factionId: string, d: number): void {
  const fs = state.regions[regionId].factions[factionId];
  if (fs) fs.standing = Math.max(-100, Math.min(100, fs.standing + d));
}

/** Donations (democracy) and gifts (governor). Council regions use buyGuildSeat. */
export function politicalAction(state: GameState, regionId: RegionId, factionId: string, amount: number): ActionResult {
  const R = REGION[regionId];
  const rs = state.regions[regionId];
  if (!rs.unlocked) return { ok: false, msg: 'You have no presence in this region yet.' };
  if (R.government.kind === 'council') return { ok: false, msg: 'Solenne\'s council only listens to guild seats.' };
  const fs = rs.factions[factionId];
  if (!fs) return { ok: false, msg: 'Unknown faction.' };
  const min = Math.round(100 * costIndex(regionId));
  if (amount < min) return { ok: false, msg: `Minimum contribution is ${money(min)}.` };
  if (state.cash < amount) return { ok: false, msg: 'Not enough cash.' };
  state.cash -= amount;
  fs.donated += amount;
  standingDelta(state, regionId, factionId, 6 * Math.log10(1 + amount / (1000 * costIndex(regionId))));
  for (const f of R.factions) if (f.id !== factionId) standingDelta(state, regionId, f.id, -2);
  state.stats.donations++;
  state.rev++;
  const name = R.factions.find((f) => f.id === factionId)!.name;
  if (R.government.actionHeat > 0) {
    state.heat = Math.min(100, state.heat + R.government.actionHeat);
    if (rs.ruling === 'reform' && chance(state, 0.35)) {
      state.rep = Math.max(-100, state.rep - 12);
      state.heat = Math.min(100, state.heat + 15);
      notify(state, `Scandal! Reform investigators traced your "gift" to ${name}. Reputation −12, heat +15.`, 'bad');
      return { ok: true, msg: 'Gift delivered… and noticed.' };
    }
  }
  notify(state, `You gave ${money(amount)} to ${name}.`, 'politics');
  return { ok: true };
}

export const guildSeatCost = (state: GameState) => {
  const seats = Object.values(state.regions.solenne.factions).reduce((a, f) => a + f.seats, 0);
  return Math.round(25_000 * 1.6 ** seats);
};

export function buyGuildSeat(state: GameState, factionId: string): ActionResult {
  const rs = state.regions.solenne;
  if (!rs.unlocked) return { ok: false, msg: 'You have no presence in Solenne yet.' };
  const fs = rs.factions[factionId];
  if (!fs) return { ok: false, msg: 'Unknown bloc.' };
  const cost = guildSeatCost(state);
  if (state.cash < cost) return { ok: false, msg: `A guild seat costs ${money(cost)}.` };
  state.cash -= cost;
  fs.seats++;
  standingDelta(state, 'solenne', factionId, 12);
  state.stats.donations++;
  state.rev++;
  notify(state, `You bought a Merchant Council seat and pledged it to ${REGION.solenne.factions.find((f) => f.id === factionId)!.name}.`, 'politics');
  return { ok: true };
}
