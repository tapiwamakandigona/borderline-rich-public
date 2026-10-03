// Core simulation types. Pure data — everything here must be JSON-serialisable.

export type RegionId = 'solenne' | 'redmesa' | 'neonvale' | 'amberfield' | 'verano' | 'ironhold';
export type Category =
  | 'food' | 'retail' | 'services' | 'hospitality' | 'industry'
  | 'logistics' | 'tech' | 'finance' | 'agri' | 'energy';
export type Footprint = 'small' | 'medium' | 'large' | 'tower';
export type GoodId = 'grain' | 'textiles' | 'seafood' | 'steel' | 'fuel' | 'electronics' | 'medicine' | 'luxury';
export type ShipMethod = 'legal' | 'transship' | 'undervalue' | 'smuggle';
export type Personality = 'aggressive' | 'expansionist' | 'cautious' | 'shady';
export type GovernmentKind = 'council' | 'governor' | 'democracy';
export type Zone = 'center' | 'ring' | 'outer' | 'water' | 'industrial' | 'edge2';
export type Side = 'n' | 's' | 'e' | 'w';
export type VehicleId = 'foot' | 'bicycle' | 'scooter' | 'hatchback' | 'sports' | 'helicopter';
/** 'player' | 'npc' | 'vacant' | 'civic' | <rival id> */
export type OwnerId = string;

export interface Laws {
  incomeTax: number;
  importTariff: number;
  exportTariff: number;
  regulation: number;
  enforcement: number;
  minWage: number;
  categoryMods: Partial<Record<Category, number>>;
  smallBizRelief: number;
  costMod: number;
}

export interface BusinessDef {
  id: string;
  name: string;
  category: Category;
  tier: 1 | 2 | 3 | 4 | 5;
  baseCost: number;
  baseIncome: number;
  regions?: RegionId[];
  blurb: string;
}

export interface GoodDef { id: GoodId; name: string; base: number; tariffClass: number; }

export interface DistrictDef {
  id: string;
  name: string;
  zone: Zone;
  land: number;
  fit: Partial<Record<Category, number>>;
}

export interface FactionDef {
  id: string;
  name: string;
  leader: string;
  color: string;
  blurb: string;
  platform: Partial<Laws>;
  basePopularity: number;
}

export interface RivalDef {
  id: string;
  name: string;
  ceo: string;
  color: string;
  personality: Personality;
  focus: Category[];
  startCash: number;
  startLots: number;
  greed: number;
  favFaction: string;
  quote: string;
}

export interface RegionDef {
  id: RegionId;
  name: string;
  city: string;
  title: string;
  tagline: string;
  blurb: string;
  difficulty: 1 | 2 | 3 | 4;
  government: {
    kind: GovernmentKind;
    name: string;
    actionLabel: string;
    actionBlurb: string;
    electionEveryDays: number;
    incumbentBias: number;
    permanentInfluence: boolean;
    actionHeat: number;
  };
  signature: { name: string; summary: string };
  pros: string[];
  cons: string[];
  hustle: { label: string; perTap: number; upgradeName: string };
  economy: { costIndex: number; wageIndex: number; corruption: number; demand: Record<Category, number> };
  baseLaws: Laws;
  produces: GoodId[];
  demands: GoodId[];
  mapPos: [number, number];
  factions: FactionDef[];
  rivals: RivalDef[];
  districts: DistrictDef[];
  layout: {
    cols: number; rows: number; block: number; road: number;
    water: Side[]; industrialSide: Side; edge2Side: Side;
    vacancy: number; density: number; parks: number; seed: number;
  };
  unlockCost: number;
}

export interface LotState {
  owner: OwnerId;
  biz: string | null;
  level: number;
  till: number;
  manager: boolean;
  invested: number;
  permitUntil: number;
  frozenUntil: number;
}

export interface FactionState { popularity: number; standing: number; donated: number; seats: number; }

export interface RegionVars {
  hype: number;
  fuelIndex: number;
  unionMood: number;
  strikeUntil: number;
  offshore: boolean;
  vcShare: number;
  vcUntil: number;
  insuredUntil: number;
  wageDeal: number;
}

export interface RegionState {
  id: RegionId;
  unlocked: boolean;
  lots: Record<string, LotState>;
  factions: Record<string, FactionState>;
  ruling: string;
  nextElectionAt: number;
  market: Record<GoodId, number>;
  vars: RegionVars;
}

export interface RivalState {
  id: string;
  regionId: RegionId;
  cash: number;
  acquired: boolean;
  nextActAt: number;
  lastAction: string;
}

export interface Shipment {
  id: number;
  good: GoodId;
  qty: number;
  from: RegionId;
  to: RegionId;
  method: ShipMethod;
  cost: number;
  value: number;
  tariffPaid: number;
  bribed: boolean;
  risk: number;
  departAt: number;
  arriveAt: number;
}

export interface Buff {
  id: string;
  label: string;
  mult: number;
  until: number;
  regionId?: RegionId;
  category?: Category;
  districtId?: string;
  target?: 'player' | 'all';
}

export interface PendingEvent {
  defId: string;
  regionId: RegionId;
  vars: Record<string, string | number>;
  at: number;
}

/** 'market' notices are feed-only (Rivals → News); they never pop a toast. */
export type NoticeKind = 'good' | 'bad' | 'info' | 'rival' | 'politics' | 'trade' | 'market';
export interface Notice { id: number; t: number; text: string; kind: NoticeKind; }

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  t: number;
  rev: number;
  homeRegion: RegionId;
  currentRegion: RegionId;
  cash: number;
  gold: number;
  heat: number;
  rep: number;
  hustle: { level: number; combo: number; lastTapAt: number };
  vehicle: VehicleId;
  vehiclesOwned: VehicleId[];
  paint: string | null;
  regions: Record<RegionId, RegionState>;
  rivals: Record<string, RivalState>;
  shipments: Shipment[];
  shipSlots: number;
  cargoLevel: number;
  nextShipId: number;
  buffs: Buff[];
  pendingEvent: PendingEvent | null;
  nextEventAt: number;
  eventsSeen: Record<string, number>;
  goalIndex: number;
  stats: {
    earned: number; hustles: number; collects: number; shipments: number; smuggled: number; caught: number;
    bizBought: number; rivalLotsBought: number; acquisitions: number; donations: number;
    peakNetWorth: number; rankIndex: number;
  };
  entitlements: { doubleIncome: boolean; nightShift: boolean; starterPack: boolean };
  processedTx: string[];
  accountant: boolean;
  broker: boolean;
  notices: Notice[];
  nextNoticeId: number;
  lastSeenWall: number;
  timers: { market: number; churn: number };
}

export interface ActionResult { ok: boolean; msg?: string; }
