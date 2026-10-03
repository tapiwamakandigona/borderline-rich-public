import type { BusinessDef, Footprint, GoodDef } from '../types';

// Payback at level 1 rises with tier (60 s for a cart → ~290 s for a tower); upgrades and
// milestones carry the long game. Region-only businesses list their regions.
export const BUSINESSES: BusinessDef[] = [
  { id: 'cart', name: 'Street Food Cart', category: 'food', tier: 1, baseCost: 60, baseIncome: 1, blurb: 'Grease, salt and margins. Everyone starts somewhere.' },
  { id: 'kiosk', name: 'Corner Kiosk', category: 'retail', tier: 1, baseCost: 400, baseIncome: 5, blurb: 'Gum, lottery tickets, gossip. Mostly gossip.' },
  { id: 'farmstand', name: 'Farm Stand', category: 'agri', tier: 1, baseCost: 900, baseIncome: 10, regions: ['amberfield', 'verano', 'redmesa'], blurb: 'Honest produce at dishonest prices.' },
  { id: 'laundromat', name: 'Laundromat', category: 'services', tier: 2, baseCost: 2500, baseIncome: 25, blurb: 'Cash business. Very clean. Suspiciously clean.' },
  { id: 'guesthouse', name: 'Guesthouse', category: 'hospitality', tier: 2, baseCost: 4000, baseIncome: 38, blurb: 'Six rooms, one view, five-star reviews you wrote yourself.' },
  { id: 'gasstation', name: 'Gas Station', category: 'energy', tier: 2, baseCost: 5000, baseIncome: 46, blurb: 'Rides the fuel price up and down.' },
  { id: 'machineshop', name: 'Machine Shop', category: 'industry', tier: 2, baseCost: 7000, baseIncome: 62, blurb: 'Lathes, sparks, overtime.' },
  { id: 'cafe', name: 'Café', category: 'food', tier: 2, baseCost: 9000, baseIncome: 80, blurb: 'Oat milk is a profit centre.' },
  { id: 'freight', name: 'Freight Agency', category: 'logistics', tier: 2, baseCost: 12000, baseIncome: 105, blurb: 'You move boxes. Other people pay you to.' },
  { id: 'appstudio', name: 'App Studio', category: 'tech', tier: 2, baseCost: 15000, baseIncome: 150, blurb: 'Three devs, one beanbag, infinite runway (citation needed).' },
  { id: 'offshore', name: 'Offshore Office', category: 'finance', tier: 2, baseCost: 20000, baseIncome: 120, regions: ['verano'], blurb: 'A brass plaque and a very discreet fax machine. Unlocks offshore shelter.' },
  { id: 'boutique', name: 'Boutique', category: 'retail', tier: 2, baseCost: 32000, baseIncome: 260, blurb: 'Lighting is 80 % of the product.' },
  { id: 'fishery', name: 'Fishery', category: 'food', tier: 3, baseCost: 60000, baseIncome: 470, regions: ['solenne', 'verano'], blurb: 'Boats out at dawn, cash in by noon.' },
  { id: 'gym', name: 'Gym', category: 'services', tier: 3, baseCost: 110000, baseIncome: 820, blurb: 'Monetising January resolutions all year round.' },
  { id: 'oilwell', name: 'Oil Well', category: 'energy', tier: 3, baseCost: 250000, baseIncome: 1850, regions: ['redmesa'], blurb: 'Nodding donkeys and nodding accountants.' },
  { id: 'hotel', name: 'Hotel', category: 'hospitality', tier: 3, baseCost: 420000, baseIncome: 2900, blurb: 'Turn-down service and turn-up pricing.' },
  { id: 'workshop', name: 'Workshop', category: 'industry', tier: 3, baseCost: 1_100_000, baseIncome: 7000, blurb: 'Custom fabrication for people who say "bespoke".' },
  { id: 'depot', name: 'Logistics Depot', category: 'logistics', tier: 4, baseCost: 3_200_000, baseIncome: 19000, blurb: 'Forklifts, floodlights, margins.' },
  { id: 'steelmill', name: 'Steel Mill', category: 'industry', tier: 4, baseCost: 9_000_000, baseIncome: 50000, regions: ['ironhold', 'redmesa'], blurb: 'Pours money as hot as the steel.' },
  { id: 'factory', name: 'Factory', category: 'industry', tier: 4, baseCost: 14_000_000, baseIncome: 74000, blurb: 'Make things. Lots of things.' },
  { id: 'startup', name: 'Tech Startup', category: 'tech', tier: 4, baseCost: 45_000_000, baseIncome: 220000, blurb: 'Disrupting something. Nobody is sure what.' },
  { id: 'resort', name: 'Resort', category: 'hospitality', tier: 4, baseCost: 120_000_000, baseIncome: 540000, blurb: 'Infinity pool, finite patience.' },
  { id: 'datacenter', name: 'Data Center', category: 'tech', tier: 5, baseCost: 400_000_000, baseIncome: 1_650_000, regions: ['neonvale', 'ironhold'], blurb: 'Hums. Prints money. Hums louder.' },
  { id: 'bank', name: 'Private Bank', category: 'finance', tier: 5, baseCost: 1_200_000_000, baseIncome: 4_600_000, blurb: 'Other people\'s money, your marble lobby.' },
  { id: 'tower', name: 'Skyline Tower', category: 'finance', tier: 5, baseCost: 5_000_000_000, baseIncome: 17_500_000, blurb: 'Your name, forty storeys tall.' },
];

export const BIZ: Record<string, BusinessDef> = Object.fromEntries(BUSINESSES.map((b) => [b.id, b]));

export const FOOTPRINT_MAX_TIER: Record<Footprint, number> = { small: 2, medium: 3, large: 4, tower: 5 };
export const FOOTPRINT_LAND: Record<Footprint, number> = { small: 80, medium: 2500, large: 120_000, tower: 6_000_000 };

export const GOODS: GoodDef[] = [
  { id: 'grain', name: 'Grain', base: 12, tariffClass: 0.6 },
  { id: 'textiles', name: 'Textiles', base: 25, tariffClass: 1.0 },
  { id: 'seafood', name: 'Seafood', base: 30, tariffClass: 0.8 },
  { id: 'steel', name: 'Steel', base: 45, tariffClass: 1.3 },
  { id: 'fuel', name: 'Fuel', base: 60, tariffClass: 1.1 },
  { id: 'electronics', name: 'Electronics', base: 140, tariffClass: 1.2 },
  { id: 'medicine', name: 'Medicine', base: 180, tariffClass: 0.5 },
  { id: 'luxury', name: 'Luxury Goods', base: 320, tariffClass: 1.6 },
];
export const GOOD: Record<string, GoodDef> = Object.fromEntries(GOODS.map((g) => [g.id, g]));
