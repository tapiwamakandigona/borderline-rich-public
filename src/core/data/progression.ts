import type { Category, GameState, RegionId, VehicleId } from '../types';
import { BIZ } from './businesses';
import { REGION_IDS } from './regions';
import { getCity } from '../city';

export const RANKS = [
  { name: 'Flat Broke', min: 0, gold: 0 },
  { name: 'Hustler', min: 500, gold: 5 },
  { name: 'Street Vendor', min: 5_000, gold: 10 },
  { name: 'Shopkeeper', min: 50_000, gold: 15 },
  { name: 'Entrepreneur', min: 250_000, gold: 20 },
  { name: 'Big Shot', min: 1_000_000, gold: 30 },
  { name: 'Mogul', min: 10_000_000, gold: 50 },
  { name: 'Tycoon', min: 100_000_000, gold: 75 },
  { name: 'Magnate', min: 1_000_000_000, gold: 100 },
  { name: 'Borderline Rich', min: 10_000_000_000, gold: 150 },
  { name: 'Obscenely Rich', min: 100_000_000_000, gold: 250 },
];
export function rankIndexFor(netWorth: number): number {
  let i = 0;
  while (i + 1 < RANKS.length && netWorth >= RANKS[i + 1].min) i++;
  return i;
}
export const RANK_EXPAND = 4; // Entrepreneur
export const RANK_BROKER = 5; // Big Shot

export const VEHICLES: { id: VehicleId; name: string; speed: number; cost: number; flies?: boolean }[] = [
  { id: 'foot', name: 'On Foot', speed: 7, cost: 0 },
  { id: 'bicycle', name: 'Bicycle', speed: 11, cost: 1_500 },
  { id: 'scooter', name: 'Scooter', speed: 15, cost: 12_000 },
  { id: 'hatchback', name: 'Hatchback', speed: 22, cost: 90_000 },
  { id: 'sports', name: 'Sports Car', speed: 32, cost: 2_500_000 },
  { id: 'helicopter', name: 'Helicopter', speed: 48, cost: 60_000_000, flies: true },
];
export const VEHICLE = Object.fromEntries(VEHICLES.map((v) => [v.id, v])) as Record<VehicleId, (typeof VEHICLES)[number]>;

export const CARGO_CAP = [20, 50, 120, 300, 800, 2_000, 5_000, 12_000];
export const CARGO_UPGRADE = [1_500, 8_000, 40_000, 220_000, 1_200_000, 7_000_000, 40_000_000];
export const SHIP_SLOT_COST = [25_000, 400_000, 5_000_000];
export const MAX_SHIP_SLOTS = 4;

export const ACCOUNTANT_COST = 5_000;
export const BROKER_COST = 250_000;
export const hustleUpgradeCost = (level: number) => 30 * 4 ** level;
export const HUSTLE_MAX = 8;

export const PAINTS = [
  { id: 'gilded', name: 'Gilded', gold: 0, color: '#f2c14e', starterOnly: true },
  { id: 'neon', name: 'Neon Rush', gold: 150, color: '#ff3e9a' },
  { id: 'chrome', name: 'Liquid Chrome', gold: 250, color: '#cfd8e3' },
  { id: 'racing', name: 'Racing Green', gold: 120, color: '#1f6f4a' },
];

const owned = (s: GameState) => {
  let n = 0;
  for (const id of REGION_IDS) for (const l of Object.values(s.regions[id].lots)) if (l.owner === 'player') n++;
  return n;
};
const anyLot = (s: GameState, f: (lot: { level: number; biz: string | null; footprint: string }) => boolean) =>
  REGION_IDS.some((id) => {
    const city = getCity(id);
    return Object.entries(s.regions[id].lots).some(([lid, l]) => l.owner === 'player' && f({ level: l.level, biz: l.biz, footprint: city.lotById[lid].footprint }));
  });

export interface GoalDef { id: string; text: string; hint: string; cash?: number; gold?: number; check: (s: GameState) => boolean; }

/** Onboarding + mid-game goal chain. Cash rewards are multiplied by the home region cost index. */
export const GOALS: GoalDef[] = [
  { id: 'hustle10', text: 'Hustle 10 times', hint: 'Tap the big HUSTLE button.', cash: 15, check: (s) => s.stats.hustles >= 10 },
  { id: 'firstbiz', text: 'Open your first business', hint: 'Tap a lot with a gold $ marker, then pick a business.', cash: 40, gold: 10, check: (s) => s.stats.bizBought >= 1 },
  { id: 'collect', text: 'Collect cash from a till', hint: 'Tap your business, or walk right past it.', cash: 60, check: (s) => s.stats.collects >= 1 },
  { id: 'hustleup', text: 'Upgrade your hustle', hint: 'Long-press HUSTLE or open Empire → Hustle.', cash: 80, check: (s) => s.hustle.level >= 1 },
  { id: 'level5', text: 'Upgrade a business to level 5', hint: 'Open your business card and tap Upgrade.', cash: 150, check: (s) => anyLot(s, (l) => l.level >= 5) },
  { id: 'own3', text: 'Own 3 businesses', hint: 'Look for gold $ markers around the city.', gold: 15, check: (s) => owned(s) >= 3 },
  { id: 'manager', text: 'Hire your first manager', hint: 'Managers bank income automatically — no till cap.', cash: 600, check: (s) => Object.values(s.regions).some((r) => Object.values(r.lots).some((l) => l.owner === 'player' && l.manager)) },
  { id: 'vehicle', text: 'Buy a bicycle', hint: 'Empire → Garage. Faster wheels, faster deals.', gold: 10, check: (s) => s.vehiclesOwned.length >= 2 },
  { id: 'ship', text: 'Ship your first cargo', hint: 'Open Trade or visit the Customs House.', cash: 1_500, check: (s) => s.stats.shipments >= 1 },
  { id: 'politics', text: 'Back a faction in local politics', hint: 'Open Politics or visit City Hall.', gold: 15, check: (s) => s.stats.donations >= 1 },
  { id: 'shopkeeper', text: 'Reach Shopkeeper rank ($50K net worth)', hint: 'Upgrade, collect, repeat.', gold: 25, check: (s) => s.stats.rankIndex >= 3 },
  { id: 'medium', text: 'Run a business on a medium or larger lot', hint: 'Bigger lots unlock tier-3 businesses.', cash: 20_000, check: (s) => anyLot(s, (l) => l.footprint !== 'small' && !!l.biz) },
  { id: 'rivallot', text: 'Buy a property from a rival company', hint: 'Tap a building flying a rival flag.', gold: 30, check: (s) => s.stats.rivalLotsBought >= 1 },
  { id: 'own10', text: 'Own 10 businesses', hint: 'Chains in one district earn a synergy bonus.', cash: 100_000, check: (s) => owned(s) >= 10 },
  { id: 'expand', text: 'Open an office in a second region', hint: 'Rivals → Travel. Unlocks at Entrepreneur.', gold: 50, check: (s) => REGION_IDS.filter((id) => s.regions[id].unlocked).length >= 2 },
  { id: 'mogul', text: 'Reach Mogul rank ($10M net worth)', hint: 'Big lots, big businesses, big numbers.', gold: 100, check: (s) => s.stats.rankIndex >= 6 },
  { id: 'acquire', text: 'Acquire a rival company outright', hint: 'Rivals → Acquire, once you are 1.5× their size.', gold: 200, check: (s) => s.stats.acquisitions >= 1 },
];

// ── Region goal chains (T12e, critic #2 finding 8) ────────────────────────────
// The starting region changes the first 10–20 minutes: two signature goals are woven into the
// generic onboarding chain (after "collect" and after "level 5") and teach the home mechanic.
const homeCount = (s: GameState, cat: Category) =>
  Object.values(s.regions[s.homeRegion].lots).filter((l) => l.owner === 'player' && !!l.biz && BIZ[l.biz].category === cat).length;

export const REGION_GOALS: Record<RegionId, [GoalDef, GoalDef]> = {
  solenne: [
    { id: 'sig_solenne_1', text: 'Run 2 logistics businesses', hint: 'Free Port: every ship in or out of Solenne lifts logistics income +20 % (up to 3 ships).', cash: 120, check: (s) => homeCount(s, 'logistics') >= 2 },
    { id: 'sig_solenne_2', text: 'Ship cargo out of the Free Port', hint: 'Open Trade: Solenne exports pay half the import tariff, and the docks get busier.', gold: 15, check: (s) => s.stats.shipments >= 1 },
  ],
  redmesa: [
    { id: 'sig_redmesa_1', text: 'Run 2 energy businesses', hint: 'Energy income follows the fuel index on your HUD (×0.6–1.6). Fuel Pumps need no permit.', cash: 120, check: (s) => homeCount(s, 'energy') >= 2 },
    { id: 'sig_redmesa_2', text: 'Open a Gas Station', hint: 'Gas Stations need a permit: wait for the clerk, or expedite it for 15 % of the price (+heat).', gold: 15,
      check: (s) => Object.values(s.regions.redmesa.lots).some((l) => l.owner === 'player' && l.biz === 'gasstation') },
  ],
  neonvale: [
    { id: 'sig_neonvale_1', text: 'Run 2 tech businesses', hint: 'Tech income rides the hype meter (×0.7–1.5): build while it is low, cash in when it peaks.', cash: 120, check: (s) => homeCount(s, 'tech') >= 2 },
    { id: 'sig_neonvale_2', text: 'Raise a venture round', hint: 'Politics → Raise a VC round: investors pay cash now for 25 % of your Neon Vale income for 30 min.', gold: 15, check: (s) => s.regions.neonvale.vars.vcUntil > 0 },
  ],
  amberfield: [
    { id: 'sig_amberfield_1', text: 'Run 2 farms', hint: 'Farm income follows the seasons: harvest pays ×1.6, winter ×0.5.', cash: 120, check: (s) => homeCount(s, 'agri') >= 2 },
    { id: 'sig_amberfield_2', text: 'Join the co-op: own 3 farms', hint: 'Three farms in Amberfield form a co-op: every farm earns +15 %.', gold: 15, check: (s) => homeCount(s, 'agri') >= 3 },
  ],
  verano: [
    { id: 'sig_verano_1', text: 'Run 2 hospitality businesses', hint: 'Tourist seasons swing every 2 days: high season ×1.5, low season ×0.7.', cash: 120, check: (s) => homeCount(s, 'hospitality') >= 2 },
    { id: 'sig_verano_2', text: 'Buy hurricane cover', hint: 'Politics → Hurricane cover, before a storm hits your beachfront.', gold: 15, check: (s) => s.regions.verano.vars.insuredUntil > 0 },
  ],
  ironhold: [
    { id: 'sig_ironhold_1', text: 'Run 2 industry businesses', hint: 'Keep the union happy: under mood 30 a strike stops industry for 90 s.', cash: 120, check: (s) => homeCount(s, 'industry') >= 2 },
    { id: 'sig_ironhold_2', text: 'Sign a wage deal with the union', hint: 'Politics → Wage deal: lifts union mood and slows its decline — strikes come far less often.', gold: 15, check: (s) => s.regions.ironhold.vars.wageDeal > 0 },
  ],
};

const chains = new Map<RegionId, GoalDef[]>();
/** The goal chain for a home region: generic onboarding with the region's two signature goals woven in. */
export function goalsFor(home: RegionId): GoalDef[] {
  let c = chains.get(home);
  if (!c) {
    const [a, b] = REGION_GOALS[home];
    c = [];
    for (const g of GOALS) {
      c.push(g);
      if (g.id === 'collect') c.push(a);
      if (g.id === 'level5') c.push(b);
    }
    chains.set(home, c);
  }
  return c;
}

export const isBizAgri = (bizId: string | null) => !!bizId && BIZ[bizId].category === 'agri';
