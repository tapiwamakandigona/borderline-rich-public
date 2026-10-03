// Region pitch facts for the region-select cards. Generated from the live rules (the same
// constants and functions the sim uses), so a card can never overstate a number. The prose in
// data/regions.ts deliberately carries no multipliers or percentages (tests/regions.test.ts).
import type { RegionId } from './types';
import { REGION } from './data/regions';
import { BIZ, STARTER } from './data/businesses';
import { demandMult } from './economy';
import { lawsFor, startingRuler } from './laws';
import {
  COOP_BONUS, FREE_PORT_CERT, FUEL_MAX, FUEL_MIN, HYPE_MAX, HYPE_MIN, OFFSHORE_TAX_MULT, PORT_BONUS, PORT_MAX_SHIPS,
  SEASON_MULT, SIGNATURE_CATEGORY, SOLENNE_START_SLOTS, STRIKE_MOOD, STRIKE_SECS, TOURISM_HIGH, TOURISM_LOW, permitSeconds,
} from './mechanics';

export interface Fact { label: string; value: string; tone?: 'good' | 'bad' }

const num = (v: number) => String(Math.round(v * 100) / 100);
export const xf = (v: number) => `×${num(v)}`;
export const pct = (v: number) => `${Math.round(v * 100)} %`;
const CAT: Record<string, string> = {
  logistics: 'Logistics', energy: 'Energy', tech: 'Tech', agri: 'Farm', hospitality: 'Hospitality', industry: 'Industry',
};

/** Facts shown on a region card, all computed from the rules in force when a new game starts. */
export function regionFacts(id: RegionId): Fact[] {
  const R = REGION[id];
  const L = lawsFor(id, startingRuler(id));
  const sig = SIGNATURE_CATEGORY[id];
  const out: Fact[] = [
    { label: 'Starter business', value: BIZ[STARTER[id]].name },
    { label: `${CAT[sig]} demand`, value: xf(demandMult(id, sig)), tone: 'good' },
  ];
  switch (id) {
    case 'solenne':
      out.push(
        { label: 'Export certificate', value: `import tariff ${xf(FREE_PORT_CERT)}`, tone: 'good' },
        { label: 'Per ship you have moving', value: `logistics +${pct(PORT_BONUS)} (max ${PORT_MAX_SHIPS})`, tone: 'good' },
        { label: 'Shipping slots', value: `${SOLENNE_START_SLOTS} from day one`, tone: 'good' },
      );
      break;
    case 'redmesa':
      out.push(
        { label: 'Fuel index on energy', value: `${xf(FUEL_MIN)} – ${xf(FUEL_MAX)}` },
        { label: 'Permit wait', value: `~${permitSeconds(L.regulation)} s (stalls ~${permitSeconds(L.regulation, 'cart')} s, Fuel Pump none)`, tone: 'bad' },
        { label: 'Customer spending', value: xf(R.economy.spend ?? 1), tone: 'bad' },
      );
      break;
    case 'neonvale':
      out.push(
        { label: 'Hype on tech & services', value: `${xf(HYPE_MIN)} – ${xf(HYPE_MAX)}` },
        { label: 'Prices', value: xf(R.economy.costIndex), tone: 'bad' },
        ...Object.entries(R.licences ?? {}).map(([biz, l]): Fact => ({ label: l.name, value: `${BIZ[biz].name} ${xf(l.mult)} to open`, tone: 'bad' })),
        { label: 'Income tax', value: pct(L.incomeTax), tone: 'bad' },
      );
      break;
    case 'amberfield':
      out.push(
        { label: 'Farm seasons', value: SEASON_MULT.map(xf).join(' → ') },
        { label: 'Co-op (3+ farm businesses)', value: `+${pct(COOP_BONUS - 1)}`, tone: 'good' },
        { label: 'Prices', value: xf(R.economy.costIndex), tone: 'good' },
      );
      break;
    case 'verano':
      out.push(
        { label: 'Tourist seasons', value: `${xf(TOURISM_HIGH)} high / ${xf(TOURISM_LOW)} low` },
        { label: 'Offshore shelter', value: `tax elsewhere ${xf(OFFSHORE_TAX_MULT)}`, tone: 'good' },
        { label: 'Customer spending', value: xf(R.economy.spend ?? 1), tone: 'bad' },
      );
      break;
    case 'ironhold':
      out.push(
        { label: 'Strike', value: `mood under ${STRIKE_MOOD}: industry stops ${STRIKE_SECS} s`, tone: 'bad' },
        { label: 'Wages', value: xf(R.economy.wageIndex * L.minWage), tone: 'bad' },
        { label: 'Import tariff', value: pct(L.importTariff), tone: 'good' },
      );
      break;
  }
  return out;
}
