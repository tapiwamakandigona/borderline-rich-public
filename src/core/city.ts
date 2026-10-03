// Deterministic city layout per region. Pure data shared by the sim (lots, districts) and the
// renderer (positions). Convention: north = -z, south = +z, east = +x, west = -x.
import type { Footprint, RegionId, Side, Zone } from './types';
import { REGION } from './data/regions';
import { makeRng, next, type RngHolder } from './rng';

export type CivicKind = 'cityhall' | 'customs';
export interface LotDef {
  id: string;
  x: number; z: number; w: number; d: number;
  footprint: Footprint;
  district: string;
  facing: Side;
  block: [number, number];
  civic?: CivicKind;
}
export interface ParkDef { x: number; z: number; w: number; d: number; }
export interface CityLayout {
  regionId: RegionId;
  cols: number; rows: number; block: number; road: number;
  width: number; depth: number;
  roadX: number[]; roadZ: number[];
  lots: LotDef[];
  lotById: Record<string, LotDef>;
  parks: ParkDef[];
  blockZone: Zone[][];
  blockDistrict: string[][];
  water: Side[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

type Pattern = 'tower' | 'large2' | 'medium4' | 'small6' | 'mixed';
const GAP = 2;
const INSET = 3.5;

function zoneFor(i: number, j: number, cols: number, rows: number, L: (typeof REGION)[RegionId]['layout'], hasEdge2: boolean): Zone {
  const on = (s: Side) => (s === 'w' ? i === 0 : s === 'e' ? i === cols - 1 : s === 'n' ? j === 0 : j === rows - 1);
  if (on(L.industrialSide)) return 'industrial';
  if (hasEdge2 && on(L.edge2Side)) return 'edge2';
  if (L.water.some(on)) return 'water';
  const dx = cols > 1 ? Math.abs(i - (cols - 1) / 2) / ((cols - 1) / 2) : 0;
  const dz = rows > 1 ? Math.abs(j - (rows - 1) / 2) / ((rows - 1) / 2) : 0;
  const d = Math.max(dx, dz);
  return d < 0.36 ? 'center' : d < 0.72 ? 'ring' : 'outer';
}

const FALLBACK: Record<Zone, Zone[]> = {
  water: ['ring', 'center'], industrial: ['outer', 'ring'], edge2: ['outer', 'ring'],
  outer: ['ring', 'center'], ring: ['center', 'outer'], center: ['ring', 'outer'],
};

function pickPattern(r: RngHolder, zone: Zone, density: number): Pattern {
  const x = next(r);
  // Low-density towns skew toward small parcels (main-street shops); dense cities toward big ones.
  const small = 0.45 * (1 - density);
  switch (zone) {
    case 'center': return x < 0.22 + 0.35 * density ? 'tower' : x < 0.65 ? 'large2' : 'medium4';
    case 'industrial': return x < 0.55 ? 'large2' : 'medium4';
    case 'ring': return x < 0.08 + 0.25 * density ? 'large2' : x < 0.5 - small * 0.5 ? 'medium4' : x < 0.78 - small * 0.3 ? 'mixed' : 'small6';
    case 'outer': return x < 0.28 - small * 0.4 ? 'medium4' : x < 0.55 - small * 0.3 ? 'mixed' : 'small6';
    default: return x < 0.12 + 0.2 * density ? 'large2' : x < 0.48 - small * 0.5 ? 'medium4' : x < 0.74 - small * 0.3 ? 'mixed' : 'small6';
  }
}

function parcels(p: Pattern, U: number): { x: number; z: number; w: number; d: number; fp: Footprint; facing: Side }[] {
  const h = U / 2 - GAP / 2;
  const q = U / 4 + GAP / 4;
  switch (p) {
    case 'tower': return [{ x: 0, z: 0, w: U, d: U, fp: 'tower', facing: 's' }];
    case 'large2': return [
      { x: -q, z: 0, w: h, d: U, fp: 'large', facing: 'w' },
      { x: q, z: 0, w: h, d: U, fp: 'large', facing: 'e' },
    ];
    case 'medium4': return [
      { x: -q, z: -q, w: h, d: h, fp: 'medium', facing: 'n' }, { x: q, z: -q, w: h, d: h, fp: 'medium', facing: 'n' },
      { x: -q, z: q, w: h, d: h, fp: 'medium', facing: 's' }, { x: q, z: q, w: h, d: h, fp: 'medium', facing: 's' },
    ];
    case 'small6': {
      const w = (U - 2 * GAP) / 3;
      const out: ReturnType<typeof parcels> = [];
      for (let k = 0; k < 3; k++) {
        const x = -U / 2 + w / 2 + k * (w + GAP);
        out.push({ x, z: -q, w, d: h, fp: 'small', facing: 'n' }, { x, z: q, w, d: h, fp: 'small', facing: 's' });
      }
      return out;
    }
    case 'mixed': {
      const sd = (U - 2 * GAP) / 3;
      const out: ReturnType<typeof parcels> = [
        { x: -q, z: -q, w: h, d: h, fp: 'medium', facing: 'w' }, { x: -q, z: q, w: h, d: h, fp: 'medium', facing: 'w' },
      ];
      for (let k = 0; k < 3; k++) out.push({ x: q, z: -U / 2 + sd / 2 + k * (sd + GAP), w: h, d: sd, fp: 'small', facing: 'e' });
      return out;
    }
  }
}

function build(regionId: RegionId): CityLayout {
  const R = REGION[regionId];
  const L = R.layout;
  const r = makeRng(L.seed);
  const { cols, rows, block: B, road: W } = L;
  const width = cols * B + (cols + 1) * W;
  const depth = rows * B + (rows + 1) * W;
  const roadX = Array.from({ length: cols + 1 }, (_, i) => -width / 2 + W / 2 + i * (B + W));
  const roadZ = Array.from({ length: rows + 1 }, (_, j) => -depth / 2 + W / 2 + j * (B + W));
  const hasEdge2 = R.districts.some((d) => d.zone === 'edge2');
  const districtByZone = (z: Zone): string => {
    const direct = R.districts.find((d) => d.zone === z);
    if (direct) return direct.id;
    for (const f of FALLBACK[z]) {
      const d = R.districts.find((dd) => dd.zone === f);
      if (d) return d.id;
    }
    return R.districts[0].id;
  };

  const blockZone: Zone[][] = [];
  const blockDistrict: string[][] = [];
  for (let i = 0; i < cols; i++) {
    blockZone.push([]);
    blockDistrict.push([]);
    for (let j = 0; j < rows; j++) {
      const z = zoneFor(i, j, cols, rows, L, hasEdge2);
      blockZone[i].push(z);
      blockDistrict[i].push(districtByZone(z));
    }
  }

  // Parks: ring/outer blocks, never the centre or the coast.
  const parkable: [number, number][] = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (blockZone[i][j] === 'ring' || blockZone[i][j] === 'outer') parkable.push([i, j]);
  const parkSet = new Set<string>();
  for (let k = 0; k < L.parks && parkable.length; k++) {
    const idx = Math.floor(next(r) * parkable.length);
    const [pi, pj] = parkable.splice(idx, 1)[0];
    parkSet.add(`${pi},${pj}`);
  }

  // Centre-most block hosts City Hall; a coastal (or industrial) block hosts the Customs House.
  let hall: [number, number] = [0, 0];
  let best = Infinity;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    if (parkSet.has(`${i},${j}`)) continue;
    const d = Math.hypot(i - (cols - 1) / 2, j - (rows - 1) / 2) + i * 1e-3 + j * 1e-4;
    if (d < best) { best = d; hall = [i, j]; }
  }
  let customs: [number, number] | null = null;
  for (let i = 0; i < cols && !customs; i++) for (let j = 0; j < rows; j++)
    if (!parkSet.has(`${i},${j}`) && blockZone[i][j] === 'water') { customs = [i, j]; break; }
  for (let i = 0; i < cols && !customs; i++) for (let j = 0; j < rows; j++)
    if (!parkSet.has(`${i},${j}`) && blockZone[i][j] === 'industrial') { customs = [i, j]; break; }

  const lots: LotDef[] = [];
  const parks: ParkDef[] = [];
  const U = B - 2 * INSET;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const cx = (roadX[i] + roadX[i + 1]) / 2;
      const cz = (roadZ[j] + roadZ[j + 1]) / 2;
      if (parkSet.has(`${i},${j}`)) { parks.push({ x: cx, z: cz, w: U, d: U }); continue; }
      const isHall = i === hall[0] && j === hall[1];
      const pattern: Pattern = isHall ? 'medium4' : pickPattern(r, blockZone[i][j], L.density);
      parcels(pattern, U).forEach((p, k) => {
        const lot: LotDef = {
          id: `${regionId}-${i}-${j}-${k}`, x: cx + p.x, z: cz + p.z, w: p.w, d: p.d,
          footprint: p.fp, district: blockDistrict[i][j], facing: p.facing, block: [i, j],
        };
        if (isHall && k === 0) lot.civic = 'cityhall';
        if (customs && i === customs[0] && j === customs[1] && k === 0) lot.civic = 'customs';
        lots.push(lot);
      });
    }
  }

  // Guarantee a late-game ceiling: at least one tower lot and two large lots per city.
  const ensure = (fp: Footprint, n: number, from: Footprint) => {
    const have = lots.filter((l) => l.footprint === fp && !l.civic).length;
    const cands = lots.filter((l) => l.footprint === from && !l.civic);
    for (let k = 0; k < n - have && k < cands.length; k++) cands[cands.length - 1 - k].footprint = fp;
  };
  ensure('large', 2, 'medium');
  ensure('tower', 1, 'large');

  const lotById = Object.fromEntries(lots.map((l) => [l.id, l]));
  const m = 40;
  return {
    regionId, cols, rows, block: B, road: W, width, depth, roadX, roadZ, lots, lotById, parks,
    blockZone, blockDistrict, water: L.water,
    bounds: { minX: -width / 2 - m, maxX: width / 2 + m, minZ: -depth / 2 - m, maxZ: depth / 2 + m },
  };
}

const cache = new Map<RegionId, CityLayout>();
export function getCity(regionId: RegionId): CityLayout {
  let c = cache.get(regionId);
  if (!c) { c = build(regionId); cache.set(regionId, c); }
  return c;
}
