import type { BusinessDef, Footprint, GoodDef } from '../types';

// Payback at level 1 rises with tier (60 s for a cart → ~830 s for a tower) so the opening is
// fast and the mid-game is a climb; tuned with scripts/balance-report.ts. Region-only businesses list their regions.
export const BUSINESSES: BusinessDef[] = [
  { id: 'cart', name: 'Street Food Cart', category: 'food', tier: 1, baseCost: 60, baseIncome: 1, blurb: 'Grease, salt and margins. Everyone starts somewhere.' },
  { id: 'kiosk', name: 'Corner Kiosk', category: 'retail', tier: 1, baseCost: 400, baseIncome: 5, blurb: 'Gum, lottery tickets, gossip. Mostly gossip.' },
  // Region starters: one cheap tier-1 business per region in its signature category
  // (mechanics.ts SIGNATURE_CATEGORY), so each region's rules shape the very first minutes.
  { id: 'cratestall', name: 'Crate Stall', category: 'logistics', tier: 1, baseCost: 90, baseIncome: 1.5, regions: ['solenne'], blurb: 'Repacks crates straight off the ships. Busier while your own cargo is moving.' },
  { id: 'fuelpump', name: 'Fuel Pump', category: 'energy', tier: 1, baseCost: 110, baseIncome: 1.8, regions: ['redmesa'], blurb: 'One pump, one hose, one sunburnt attendant. No permit needed. Rides the fuel index.' },
  { id: 'repairstall', name: 'Phone Repair Stall', category: 'tech', tier: 1, baseCost: 130, baseIncome: 2.1, regions: ['neonvale'], blurb: 'Cracked screens are a renewable resource. Rides the hype cycle.' },
  { id: 'eggstand', name: 'Egg Stand', category: 'agri', tier: 1, baseCost: 80, baseIncome: 1.3, regions: ['amberfield'], blurb: 'Farm-fresh eggs, an honesty box and a dog that judges you. Follows the seasons.' },
  { id: 'beachshack', name: 'Beach Shack', category: 'hospitality', tier: 1, baseCost: 100, baseIncome: 1.6, regions: ['verano'], blurb: 'Coconuts, sunscreen and overpriced hammocks. Lives and dies by the tourist season.' },
  { id: 'scrapforge', name: 'Scrap Forge', category: 'industry', tier: 1, baseCost: 100, baseIncome: 1.6, regions: ['ironhold'], blurb: 'Melts scrap into brackets. Good money, and the union counts every one.' },
  { id: 'farmstand', name: 'Farm Stand', category: 'agri', tier: 1, baseCost: 1400, baseIncome: 9, regions: ['amberfield', 'verano', 'redmesa'], blurb: 'Honest produce at dishonest prices.' },
  { id: 'laundromat', name: 'Laundromat', category: 'services', tier: 2, baseCost: 2500, baseIncome: 18, blurb: 'Cash business. Very clean. Suspiciously clean.' },
  { id: 'guesthouse', name: 'Guesthouse', category: 'hospitality', tier: 2, baseCost: 4000, baseIncome: 27, blurb: 'Six rooms, one view, five-star reviews you wrote yourself.' },
  { id: 'gasstation', name: 'Gas Station', category: 'energy', tier: 2, baseCost: 5000, baseIncome: 32, blurb: 'Rides the fuel price up and down.' },
  { id: 'machineshop', name: 'Machine Shop', category: 'industry', tier: 2, baseCost: 7000, baseIncome: 42, blurb: 'Lathes, sparks, overtime.' },
  { id: 'cafe', name: 'Café', category: 'food', tier: 2, baseCost: 9000, baseIncome: 52, blurb: 'Oat milk is a profit centre.' },
  { id: 'freight', name: 'Freight Agency', category: 'logistics', tier: 2, baseCost: 12000, baseIncome: 66, blurb: 'You move boxes. Other people pay you to.' },
  { id: 'appstudio', name: 'App Studio', category: 'tech', tier: 2, baseCost: 15000, baseIncome: 80, blurb: 'Three devs, one beanbag, infinite runway (citation needed).' },
  { id: 'offshore', name: 'Offshore Office', category: 'finance', tier: 2, baseCost: 20000, baseIncome: 90, regions: ['verano'], blurb: 'A brass plaque and a very discreet fax machine. Unlocks offshore shelter.' },
  { id: 'boutique', name: 'Boutique', category: 'retail', tier: 2, baseCost: 32000, baseIncome: 160, blurb: 'Lighting is 80 % of the product.' },
  { id: 'fishery', name: 'Fishery', category: 'food', tier: 3, baseCost: 60000, baseIncome: 230, regions: ['solenne', 'verano'], blurb: 'Boats out at dawn, cash in by noon.' },
  { id: 'gym', name: 'Gym', category: 'services', tier: 3, baseCost: 110000, baseIncome: 400, blurb: 'Monetising January resolutions all year round.' },
  { id: 'oilwell', name: 'Oil Well', category: 'energy', tier: 3, baseCost: 250000, baseIncome: 850, regions: ['redmesa'], blurb: 'Nodding donkeys and nodding accountants.' },
  { id: 'hotel', name: 'Hotel', category: 'hospitality', tier: 3, baseCost: 420000, baseIncome: 1350, blurb: 'Turn-down service and turn-up pricing.' },
  { id: 'workshop', name: 'Workshop', category: 'industry', tier: 3, baseCost: 1_100_000, baseIncome: 3300, blurb: 'Custom fabrication for people who say "bespoke".' },
  { id: 'depot', name: 'Logistics Depot', category: 'logistics', tier: 4, baseCost: 3_200_000, baseIncome: 8000, blurb: 'Forklifts, floodlights, margins.' },
  { id: 'steelmill', name: 'Steel Mill', category: 'industry', tier: 4, baseCost: 9_000_000, baseIncome: 21000, regions: ['ironhold', 'redmesa'], blurb: 'Pours money as hot as the steel.' },
  { id: 'factory', name: 'Factory', category: 'industry', tier: 4, baseCost: 14_000_000, baseIncome: 31000, blurb: 'Make things. Lots of things.' },
  { id: 'startup', name: 'Tech Startup', category: 'tech', tier: 4, baseCost: 45_000_000, baseIncome: 90000, blurb: 'Disrupting something. Nobody is sure what.' },
  { id: 'resort', name: 'Resort', category: 'hospitality', tier: 4, baseCost: 120_000_000, baseIncome: 220000, blurb: 'Infinity pool, finite patience.' },
  { id: 'datacenter', name: 'Data Center', category: 'tech', tier: 5, baseCost: 400_000_000, baseIncome: 600000, regions: ['neonvale', 'ironhold'], blurb: 'Hums. Prints money. Hums louder.' },
  { id: 'bank', name: 'Private Bank', category: 'finance', tier: 5, baseCost: 1_200_000_000, baseIncome: 1600000, blurb: 'Other people\'s money, your marble lobby.' },
  { id: 'tower', name: 'Skyline Tower', category: 'finance', tier: 5, baseCost: 5_000_000_000, baseIncome: 6000000, blurb: 'Your name, forty storeys tall.' },
];

export const BIZ: Record<string, BusinessDef> = Object.fromEntries(BUSINESSES.map((b) => [b.id, b]));
/** Each region's signature tier-1 starter business. */
export const STARTER: Record<string, string> = {
  solenne: 'cratestall', redmesa: 'fuelpump', neonvale: 'repairstall', amberfield: 'eggstand', verano: 'beachshack', ironhold: 'scrapforge',
};

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
