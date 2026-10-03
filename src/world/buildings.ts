// Building archetypes and city assembly. Every lot's look is a pure function of (lot id,
// business, level, owner, theme) so rebuilds are stable and buildings visibly grow with level.
import * as THREE from 'three';
import type { LotState, RegionId, Side } from '../core/types';
import type { CityLayout, LotDef } from '../core/city';
import { BIZ } from '../core/data/businesses';
import { hash, makeRng, next, type RngHolder } from '../core/rng';
import { GeoBuilder } from './geo';
import { CATEGORY_ACCENT, type Theme } from './themes';

export const FLOOR = 3.2;
export const GROUND = 4.2;
const BAY = 3.2;
const TILE: [number, number] = [BAY * 4, FLOOR * 4];

export interface LotVisual { top: number; box: THREE.Box3; center: THREE.Vector3; }

/** Visual growth stages (critic #12): a business's look changes at each of these levels, so an
 *  upgrade is visible long before the old every-10-levels floor bump. */
export const LEVEL_STAGES = [1, 3, 5, 10, 25, 50, 100, 200];
/** Extra floors from growth: +1 at L10, then one more at every later stage (geometry only ever
 *  changes when levelBand() changes, so the world knows exactly when to rebuild). */
const growthFloors = (level: number) => Math.max(0, levelBand(level) - 2);
export function levelBand(level: number): number {
  let b = 0;
  for (let i = 0; i < LEVEL_STAGES.length; i++) if (level >= LEVEL_STAGES[i]) b = i;
  return b;
}
export interface BuildOutput { lots: Map<string, LotVisual>; chimneys: THREE.Vector3[]; }

const ROT: Record<Side, number> = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 };
const pick = <T>(r: RngHolder, a: T[]) => a[Math.floor(next(r) * a.length)];
const shade = (hex: number, k: number) => new THREE.Color(hex).multiplyScalar(k);

interface Ctx {
  gb: GeoBuilder; theme: Theme; r: RngHolder; region: RegionId;
  lw: number; ld: number; chimneys: THREE.Vector3[]; frame: THREE.Matrix4;
}

function toWorld(ctx: Ctx, x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z).applyMatrix4(ctx.frame);
}

function floorsFor(tier: number, level: number, fp: LotDef['footprint'], theme: Theme, r: RngHolder): number {
  const base = [0, 1, 2, 3.4, 6, 13][tier];
  const max = { small: 4, medium: 9, large: 16, tower: 44 }[fp];
  const f = Math.round(base * theme.heightMult * (0.8 + next(r) * 0.45)) + growthFloors(level);
  return Math.max(1, Math.min(max, f));
}

function roof(ctx: Ctx, w: number, d: number, x: number, y: number, z: number, style: Theme['roofStyle']): number {
  const { gb, theme, r } = ctx;
  const col = theme.snowRoofs ? 0xeef3f7 : pick(r, theme.roofs);
  switch (style) {
    case 'terracotta':
    case 'hip': {
      const h = Math.min(w, d) * 0.3;
      gb.box('plain', w + 0.5, 0.35, d + 0.5, x, y, z, pick(r, theme.trims));
      gb.hip('plain', w + 0.9, h, d + 0.9, x, y + 0.35, z, col);
      return y + 0.35 + h;
    }
    case 'gable': {
      const h = Math.min(w, d) * 0.38;
      gb.gable('plain', w + 0.9, h, d + 1.0, x, y, z, col);
      gb.box('plain', 0.9, h * 0.55 + 1.2, 0.9, x + w * 0.28, y + h * 0.3, z - d * 0.15, 0x8a5a44);
      return y + h;
    }
    case 'adobe': {
      const trim = shade(pick(r, theme.walls), 0.92);
      gb.box('plain', w + 0.2, 0.8, 0.5, x, y, z + d / 2 - 0.15, trim);
      gb.box('plain', w + 0.2, 0.8, 0.5, x, y, z - d / 2 + 0.15, trim);
      gb.box('plain', 0.5, 0.8, d, x + w / 2 - 0.15, y, z, trim);
      gb.box('plain', 0.5, 0.8, d, x - w / 2 + 0.15, y, z, trim);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.cyl('plain', 0.45, 0.5, 1.2, x + sx * (w / 2), y, z + sz * (d / 2), trim, 6);
      for (let k = -w / 2 + 1; k < w / 2 - 0.5; k += 1.5) gb.cyl('plain', 0.14, 0.14, 1.0, x + k, y - 0.7, z + d / 2 + 0.4, pick(r, theme.trims), 5, Math.PI / 2);
      if (next(r) < 0.25) waterTank(ctx, x - w * 0.2, y, z - d * 0.2);
      return y + 0.8;
    }
    default: {
      const pc = shade(pick(r, theme.walls), 0.85);
      gb.box('plain', w, 0.7, 0.35, x, y, z + d / 2 - 0.17, pc);
      gb.box('plain', w, 0.7, 0.35, x, y, z - d / 2 + 0.17, pc);
      gb.box('plain', 0.35, 0.7, d, x + w / 2 - 0.17, y, z, pc);
      gb.box('plain', 0.35, 0.7, d, x - w / 2 + 0.17, y, z, pc);
      gb.box('plain', w - 0.4, 0.06, d - 0.4, x, y, z, theme.snowRoofs ? 0xf4f7fa : 0x5f646c);
      const n = 1 + Math.floor(next(r) * 3);
      for (let i = 0; i < n; i++) gb.box('plain', 1.6, 1.1, 1.2, x + (next(r) - 0.5) * (w - 3), y, z + (next(r) - 0.5) * (d - 3), 0x9aa1aa);
      if (theme.id !== 'neonvale' && next(r) < 0.2) waterTank(ctx, x + w * 0.2, y, z);
      return y + 0.7;
    }
  }
}

function waterTank(ctx: Ctx, x: number, y: number, z: number): void {
  const { gb } = ctx;
  for (const [sx, sz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) gb.box('plain', 0.18, 2.2, 0.18, x + sx, y, z + sz, 0x4a3a30);
  gb.cyl('plain', 1.15, 1.15, 2.0, x, y + 2.2, z, 0x8a6a50, 10);
  gb.add('plain', new THREE.ConeGeometry(1.25, 0.9, 10), 0x5a4a40, x, y + 4.65, z);
}

function awning(ctx: Ctx, w: number, y: number, z: number, accent: number): void {
  const n = Math.max(3, Math.round(w / 1.1));
  const sw = w / n;
  for (let i = 0; i < n; i++)
    ctx.gb.box('plain', sw, 0.12, 1.8, -w / 2 + sw * (i + 0.5), y, z + 0.8, i % 2 ? 0xf7f3ea : accent, { rx: 0.32 });
}

function sign(ctx: Ctx, w: number, y: number, z: number, accent: number): void {
  const bucket = ctx.theme.neon ? 'glow' : 'plain';
  ctx.gb.box(bucket, Math.min(w * 0.7, 7), 0.9, 0.22, 0, y, z, accent);
}

/** Generic multi-storey block with a storefront, the region's roof style and flavour details. */
function block(ctx: Ctx, floors: number, cat: string, opts: { balconies?: boolean; roofStyle?: Theme['roofStyle']; pool?: boolean; porch?: boolean } = {}): number {
  const { gb, theme, r, lw, ld } = ctx;
  const bw = Math.max(4, lw - 2.2);
  const bd = Math.max(4, ld - 3.2);
  const zc = -0.5;
  const H = GROUND + (floors - 1) * FLOOR;
  const wall = pick(r, theme.walls);
  const trim = pick(r, theme.trims);
  const accent = CATEGORY_ACCENT[cat] ?? pick(r, theme.accents);
  const uOff = Math.floor(next(r) * 4) * 0.25;
  const vOff = Math.floor(next(r) * 4) * 0.25;
  gb.box('upper', bw, H, bd, 0, 0.1, zc, wall, { tile: TILE, uOff, vOff });
  gb.box('ground', bw * 0.9, GROUND - 0.6, 0.3, 0, 0.1, zc + bd / 2 + 0.12, trim, { tile: [10, GROUND - 0.6], front: true, uOff: next(r) });
  gb.box('plain', bw + 0.4, 0.3, bd + 0.4, 0, GROUND - 0.25, zc, trim);
  if (cat === 'food' || cat === 'retail' || cat === 'hospitality' || cat === 'services') awning(ctx, bw * 0.9, GROUND - 1.1, zc + bd / 2, accent);
  sign(ctx, bw, GROUND + 0.15, zc + bd / 2 + 0.25, accent);
  if ((opts.balconies || theme.id === 'verano' || (theme.id === 'solenne' && next(r) < 0.5)) && floors > 1) {
    for (let f = 1; f < floors; f++) {
      const y = GROUND + (f - 1) * FLOOR;
      gb.box('plain', bw * 0.7, 0.18, 1.1, 0, y, zc + bd / 2 + 0.55, trim);
      gb.box(theme.id === 'neonvale' ? 'glass' : 'plain', bw * 0.7, 0.9, 0.08, 0, y + 0.18, zc + bd / 2 + 1.06, theme.id === 'verano' ? 0xffffff : shade(trim, 0.9));
      if (theme.id === 'solenne' || theme.id === 'verano') gb.box('plain', 0.5, 0.35, 0.4, -bw * 0.3, y + 0.18, zc + bd / 2 + 0.8, pick(r, [0xd9483b, 0xe76f51, 0xff7f9a, 0x6abf5e]));
    }
  }
  if (opts.porch || (theme.id === 'amberfield' && floors <= 2)) {
    gb.box('plain', bw * 0.95, 0.25, 2.2, 0, GROUND - 0.6, zc + bd / 2 + 1.2, pick(r, theme.roofs));
    for (const sx of [-1, 1]) gb.box('plain', 0.25, GROUND - 0.6, 0.25, sx * bw * 0.44, 0.1, zc + bd / 2 + 2.1, 0xffffff);
  }
  if (theme.neon) {
    const nc = pick(r, theme.accents);
    gb.box('glow', 0.25, H * 0.55, 1.1, bw / 2 - 0.4, GROUND, zc + bd / 2 + 0.55, nc);
    gb.box('glow', bw + 0.5, 0.14, 0.14, 0, H + 0.05, zc + bd / 2 + 0.2, nc);
  }
  let top = roof(ctx, bw, bd, 0, H + 0.1, zc, opts.roofStyle ?? (theme.roofStyle === 'sawtooth' ? 'flat' : theme.roofStyle));
  if (opts.pool) { gb.box('glow', bw * 0.5, 0.08, bd * 0.35, 0, H + 0.2, zc, 0x5fe0f0); top = Math.max(top, H + 0.3); }
  if (theme.id === 'ironhold' && next(r) < 0.5) {
    const c = new THREE.Vector3(bw * 0.3, H, zc - bd * 0.2);
    gb.box('plain', 1.0, 3.2, 1.0, c.x, c.y, c.z, 0x6f2f25);
    ctx.chimneys.push(toWorld(ctx, c.x, c.y + 3.3, c.z));
  }
  return top;
}

function tower(ctx: Ctx, floors: number, cat: string, classical = false): number {
  const { gb, theme, r, lw, ld } = ctx;
  const bw = Math.max(6, lw - 2.2);
  const bd = Math.max(6, ld - 2.8);
  const podiumH = GROUND + FLOOR;
  const wall = pick(r, theme.walls);
  const glass = pick(r, theme.glass);
  const accent = CATEGORY_ACCENT[cat];
  gb.box('upper', bw, podiumH, bd, 0, 0.1, 0, wall, { tile: TILE });
  gb.box('ground', bw * 0.9, GROUND - 0.6, 0.3, 0, 0.1, bd / 2 + 0.12, 0xffffff, { tile: [10, GROUND - 0.6], front: true });
  if (classical) {
    const n = Math.max(4, Math.round(bw / 2.4));
    for (let i = 0; i < n; i++) gb.cyl('plain', 0.42, 0.48, podiumH - 0.4, -bw / 2 + 1 + (i * (bw - 2)) / (n - 1), 0.1, bd / 2 + 1.2, 0xf1ece2, 10);
    gb.box('plain', bw + 1, 0.6, 2.8, 0, podiumH - 0.3, bd / 2 + 0.6, 0xf1ece2);
    gb.gable('plain', bw + 1, 1.8, 2.8, 0, podiumH + 0.3, bd / 2 + 0.6, 0xe9e2d4, 0);
    for (let k = 0; k < 3; k++) gb.box('plain', bw + 2 - k, 0.3, 3.4 - k * 0.6, 0, k * 0.3 - 0.2, bd / 2 + 1.7 - k * 0.3, 0xd9d2c4);
  }
  const shaftH = Math.max(FLOOR * 2, (floors - 2) * FLOOR);
  const sw = bw - 1.6, sd = bd - 1.6;
  const lowH = shaftH * (0.55 + next(r) * 0.15);
  gb.box('glass', sw, lowH, sd, 0, podiumH, 0, glass, { tile: TILE, uOff: next(r), vOff: Math.floor(next(r) * 4) * 0.25 });
  const s2w = sw * 0.78, s2d = sd * 0.78;
  gb.box('plain', sw + 0.3, 0.5, sd + 0.3, 0, podiumH + lowH, 0, 0xd8dee6);
  gb.box('glass', s2w, shaftH - lowH, s2d, 0, podiumH + lowH + 0.5, 0, shade(glass, 1.08), { tile: TILE, uOff: next(r) });
  const H = podiumH + shaftH + 0.5;
  gb.box('plain', s2w + 0.3, 0.8, s2d + 0.3, 0, H, 0, 0xcfd6df);
  if (theme.neon) {
    const nc = pick(r, theme.accents);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box('glow', 0.18, shaftH - lowH, 0.18, sx * (s2w / 2 + 0.05), podiumH + lowH + 0.5, sz * (s2d / 2 + 0.05), nc);
    gb.box('glow', sw + 0.4, 0.2, 0.2, 0, podiumH + lowH + 0.2, sd / 2 + 0.1, pick(r, theme.accents));
  }
  let top = H + 0.8;
  if (cat === 'finance' || floors > 18) {
    gb.box('plain', s2w * 0.6, 3, s2d * 0.6, 0, top, 0, 0xe2e7ee);
    gb.cyl('plain', 0.12, 0.35, 9, 0, top + 3, 0, 0xd0d6de, 6);
    gb.sphere('glow', 0.4, 0, top + 12.2, 0, 0xff4040);
    top += 12.6;
  } else {
    gb.cyl('plain', 0.1, 0.18, 5, s2w * 0.25, top, -s2d * 0.2, 0x9aa3ad, 5);
    gb.box('plain', 2.2, 1.4, 1.8, -s2w * 0.2, top, s2d * 0.15, 0x9aa1aa);
  }
  sign(ctx, bw, GROUND + 0.1, bd / 2 + 0.3, accent);
  return top;
}

function industrial(ctx: Ctx, tier: number, level: number): number {
  const { gb, theme, r, lw, ld } = ctx;
  const bw = Math.max(5, lw - 2), bd = Math.max(5, ld - 3);
  const H = GROUND * (tier >= 4 ? 1.9 : 1.4) + growthFloors(level) * 1.2;
  const wall = theme.id === 'ironhold' ? pick(r, theme.walls.slice(0, 3)) : pick(r, theme.walls);
  gb.box('upper', bw, H, bd, 0, 0.1, -0.5, wall, { tile: [BAY * 4, FLOOR * 5] });
  for (let i = 0; i < Math.max(1, Math.floor(bw / 5)); i++) gb.box('plain', 3.0, 3.6, 0.25, -bw / 2 + 2.5 + i * 5, 0.1, bd / 2 - 0.4, 0x3a3f46);
  const style = theme.roofStyle === 'sawtooth' || tier >= 3 ? 'saw' : 'flat';
  if (style === 'saw') {
    const n = Math.max(2, Math.floor(bd / 3.5));
    for (let i = 0; i < n; i++) gb.gable('plain', bw, 1.8, bd / n, 0, H + 0.1, -0.5 - bd / 2 + (bd / n) * (i + 0.5), theme.snowRoofs ? 0xeef3f7 : 0x6c737c, 0);
  } else roof(ctx, bw, bd, 0, H + 0.1, -0.5, 'flat');
  const nCh = tier >= 4 ? 2 : 1;
  let top = H + 2;
  for (let i = 0; i < nCh; i++) {
    const x = -bw / 2 + 1.8 + i * 3, z = -bd / 2 + 1.5;
    const h = 8 + tier * 2 + next(r) * 3;
    gb.cyl('plain', 0.6, 0.85, h, x, H, z, theme.id === 'ironhold' ? 0x6f2f25 : 0x8f969e, 10);
    gb.cyl('plain', 0.66, 0.66, 0.6, x, H + h * 0.75, z, 0xf3f3f3, 10);
    ctx.chimneys.push(toWorld(ctx, x, H + h, z));
    top = Math.max(top, H + h);
  }
  if (tier >= 4) gb.cyl('plain', 2.6, 2.8, H * 1.15, bw / 2 - 3, 0.1, bd / 2 - 3.5, 0x7c838c, 12);
  return top;
}

function warehouse(ctx: Ctx, tier: number, blue = false): number {
  const { gb, theme, r, lw, ld } = ctx;
  const bw = Math.max(5, lw - 2), bd = Math.max(5, ld * 0.62 - 1);
  const H = 5 + tier * 1.4;
  const z0 = -ld / 2 + 1 + bd / 2;
  gb.box('upper', bw, H, bd, 0, 0.1, z0, blue ? 0xc7dde8 : pick(r, theme.walls), { tile: [BAY * 4, FLOOR * 5] });
  gb.gable('plain', bw + 0.6, 1.6, bd + 0.6, 0, H + 0.1, z0, theme.snowRoofs ? 0xeef3f7 : 0x8a9099);
  for (let i = 0; i < Math.max(1, Math.floor(bw / 4.5)); i++) {
    gb.box('plain', 3.2, 3.8, 0.2, -bw / 2 + 2.4 + i * 4.5, 0.1, z0 + bd / 2 + 0.05, 0xb9c0c8);
  }
  const cols = [0xc8553d, 0x2a6fa8, 0x1f8a8a, 0xe8b02a, 0x6b7280, 0x3e7cb1];
  const n = 2 + tier;
  for (let i = 0; i < n; i++) {
    const stack = i % 3;
    gb.box('plain', 2.4, 2.5, 6, -bw / 2 + 1.6 + Math.floor(i / 3) * 2.8, 0.1 + stack * 2.55, ld / 2 - 4.2, pick(r, cols));
  }
  if (blue) for (let i = 0; i < 4; i++) gb.cyl('plain', 0.45, 0.45, 1.1, bw / 2 - 1 - i * 1.1, 0.1, ld / 2 - 2, 0x2a6fa8, 8);
  return H + 1.7;
}

// ── Region starter stalls: each region's first business has its own silhouette ──────────────
function crateStall(ctx: Ctx): number {
  const { gb, r } = ctx;
  const wood = [0xb08a5a, 0x9c7748, 0xc49a63, 0x8a6a42];
  // stacked crates
  const stacks: [number, number, number][] = [[-2.4, -0.6, 3], [-1.0, -1.2, 2], [0.4, -1.4, 1], [-2.3, 1.0, 1]];
  for (const [x, z, n] of stacks) for (let k = 0; k < n; k++) {
    const s = 1.1 + next(r) * 0.25;
    gb.box('plain', s, s, s, x + (next(r) - 0.5) * 0.2, 0.1 + k * 1.15, z, pick(r, wood), { ry: (next(r) - 0.5) * 0.3 });
    gb.box('plain', s + 0.04, 0.12, s + 0.04, x, 0.1 + k * 1.15 + s * 0.5, z, 0x6e5232);
  }
  // A-frame hoist with a hanging crate
  for (const sx of [-1, 1]) gb.box('plain', 0.22, 4.6, 0.22, 2.0 + sx * 0.9, 0.1, -0.6, 0x5a4632, { rz: sx * 0.12 });
  gb.box('plain', 2.4, 0.22, 0.22, 2.0, 4.55, -0.6, 0x5a4632);
  gb.cyl('plain', 0.03, 0.03, 1.6, 2.0, 2.95, -0.6, 0x333333, 4);
  gb.box('plain', 1.0, 0.9, 1.0, 2.0, 2.05, -0.6, 0xe07a1f);
  // counter + striped awning
  gb.box('plain', 3.0, 1.0, 0.9, 0.6, 0.1, 1.6, 0x8a6a42);
  for (let i = 0; i < 5; i++) gb.box('plain', 0.62, 0.12, 1.6, -0.64 + i * 0.62, 2.6, 1.45, i % 2 ? 0xf4efe6 : 0xe07a1f, { rx: 0.18 });
  for (const sx of [-1, 1]) gb.cyl('plain', 0.06, 0.06, 2.5, 0.6 + sx * 1.5, 0.1, 2.15, 0x777777, 5);
  return 5.0;
}

function fuelPump(ctx: Ctx): number {
  const { gb, theme } = ctx;
  gb.box('plain', 7.0, 0.18, 5.2, 0, 0.02, 0.4, 0xb7aa96);
  for (const sx of [-1, 1]) gb.box('plain', 0.3, 3.8, 0.3, sx * 2.8, 0.2, 0.6, 0xe9e2d4);
  gb.box('plain', 6.6, 0.45, 3.0, 0, 4.0, 0.6, 0xf4efe6);
  gb.box('plain', 6.65, 0.18, 3.05, 0, 4.0, 0.6, 0xe8b02a);
  for (const sx of [-1, 1]) {
    gb.box('plain', 0.8, 1.7, 0.6, sx * 1.2, 0.2, 0.6, 0xd9483b);
    gb.cyl('plain', 0.42, 0.42, 0.6, sx * 1.2, 1.9, 0.9, 0xf4efe6, 10, Math.PI / 2);
    gb.box(theme.neon ? 'glow' : 'plain', 0.5, 0.35, 0.05, sx * 1.2, 1.25, 0.92, 0xfff3c4);
  }
  for (let i = 0; i < 3; i++) gb.cyl('plain', 0.42, 0.42, 1.2, -3.0 + i * 0.95, 0.2, -1.9, i === 1 ? 0x2a6fa8 : 0xb33a2a, 10);
  gb.cyl('plain', 0.13, 0.13, 7.2, 3.3, 0.2, 2.4, 0x666666, 6);
  gb.cyl('plain', 1.15, 1.15, 0.25, 3.3, 7.0, 2.4, 0xe8b02a, 16, Math.PI / 2);
  gb.cyl(theme.neon ? 'glow' : 'plain', 0.85, 0.85, 0.28, 3.3, 7.0, 2.4, 0xd9483b, 16, Math.PI / 2);
  return 8.2;
}

function repairStall(ctx: Ctx): number {
  const { gb, theme } = ctx;
  gb.box('upper', 3.2, 2.9, 2.6, 0, 0.1, -0.4, 0x2b2f3a, { tile: TILE });
  gb.box('plain', 3.6, 0.25, 3.0, 0, 3.0, -0.4, 0x14161b);
  gb.box('plain', 3.0, 1.05, 0.7, 0, 0.1, 1.2, 0x3a3f4c);
  gb.box(theme.neon ? 'glow' : 'plain', 3.05, 0.08, 0.72, 0, 1.15, 1.2, 0x2bb7d9);
  // giant phone sign
  gb.box('plain', 1.9, 3.3, 0.35, 0, 3.25, -0.6, 0x14161b);
  gb.box('glow', 1.55, 2.7, 0.08, 0, 3.55, -0.4, 0x2bb7d9);
  gb.box('glow', 0.7, 0.18, 0.1, 0, 3.75, -0.38, 0xf4efe6);
  gb.cyl('glow', 0.18, 0.18, 0.1, 0, 3.32, -0.36, 0xff3e9a, 10, Math.PI / 2);
  // stool + parasol
  gb.cyl('plain', 0.3, 0.3, 0.75, 2.4, 0.1, 1.9, 0x2bb7d9, 10);
  gb.cyl('plain', 0.05, 0.05, 2.6, -2.4, 0.1, 1.6, 0x999999, 5);
  gb.add('plain', new THREE.ConeGeometry(1.4, 0.6, 8), 0xff3e9a, -2.4, 2.8, 1.6);
  return 6.9;
}

function eggStand(ctx: Ctx): number {
  const { gb, r } = ctx;
  gb.box('plain', 3.6, 1.0, 1.4, 0, 0.1, 1.2, 0x9a6a42);
  for (const sx of [-1, 1]) gb.box('plain', 0.18, 2.5, 0.18, sx * 1.7, 0.1, 0.6, 0x6b4a35);
  gb.gable('plain', 4.2, 1.0, 2.2, 0, 2.6, 0.9, 0x5f9a3a);
  for (let i = 0; i < 4; i++) {
    gb.box('plain', 0.75, 0.22, 0.55, -1.2 + i * 0.8, 1.1, 1.2, 0xe8dcc4);
    for (let k = 0; k < 3; k++) gb.sphere('plain', 0.12, -1.42 + i * 0.8 + k * 0.22, 1.36, 1.2, next(r) < 0.5 ? 0xf6efe0 : 0xd9b48a, false, 1.25);
  }
  // little coop
  gb.box('plain', 2.0, 1.3, 1.6, -2.2, 0.5, -1.8, 0xa63a2b);
  gb.gable('plain', 2.3, 0.9, 1.8, -2.2, 1.8, -1.8, 0xf4efe6);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box('plain', 0.15, 0.5, 0.15, -2.2 + sx * 0.85, 0, -1.8 + sz * 0.65, 0x6b4a35);
  // beehives + hay
  for (let k = 0; k < 3; k++) gb.box('plain', 0.8, 0.45, 0.8, 2.3, 0.1 + k * 0.47, -1.6, k % 2 ? 0xf2c14e : 0xe8b02a);
  gb.box('plain', 0.95, 0.12, 0.95, 2.3, 1.52, -1.6, 0xf4efe6);
  gb.cyl('plain', 0.7, 0.7, 1.4, 1.0, 0.1, -2.2, 0xe2c26a, 12, Math.PI / 2);
  return 3.8;
}

function beachShack(ctx: Ctx): number {
  const { gb, r } = ctx;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.cyl('plain', 0.14, 0.14, 0.7, sx * 1.6, 0, -0.6 + sz * 1.3, 0x8a6a42, 6);
  gb.box('plain', 3.8, 0.2, 3.2, 0, 0.7, -0.6, 0xc49a63);
  gb.box('plain', 3.4, 2.1, 2.6, 0, 0.9, -0.8, 0xf2d7a6);
  gb.box('plain', 2.2, 0.9, 0.12, 0, 1.8, 0.52, 0x5a3f2a);
  gb.box('plain', 3.6, 0.9, 0.7, 0, 0.9, 1.05, 0x2ec4c9);
  gb.add('plain', new THREE.ConeGeometry(3.0, 1.9, 9), 0xd8b26a, 0, 3.95, -0.7);
  gb.add('plain', new THREE.ConeGeometry(3.15, 0.35, 9), 0xc79a55, 0, 3.1, -0.7);
  // surfboards
  const boards = [0xff6b6b, 0xffd166, 0x2ec4c9];
  boards.forEach((c, i) => gb.add('plain', new THREE.CapsuleGeometry(0.28, 2.0, 4, 8), c, 2.5 + i * 0.55, 1.4, -1.3, 0.18, 0, -0.12 + i * 0.05, 1, 1, 0.25));
  // deck chairs + parasol
  for (let i = 0; i < 2; i++) {
    const x = -2.2 + i * 1.6;
    gb.box('plain', 0.8, 0.12, 1.8, x, 0.35, 2.6, i ? 0xffffff : 0xff6b6b, { rx: -0.25 });
  }
  gb.cyl('plain', 0.05, 0.05, 2.4, -1.4, 0, 3.3, 0xdddddd, 5);
  gb.add('plain', new THREE.ConeGeometry(1.5, 0.55, 10), next(r) < 0.5 ? 0xffd166 : 0xff6b6b, -1.4, 2.5, 3.3);
  return 4.9;
}

function scrapForge(ctx: Ctx): number {
  const { gb, chimneys } = ctx;
  gb.box('upper', 4.2, 3.0, 3.2, -0.6, 0.1, -0.8, 0x8a3b2c, { tile: TILE });
  gb.box('plain', 4.6, 0.35, 3.6, -0.6, 3.1, -0.8, 0x4a4f57);
  gb.box('glow', 1.3, 1.0, 0.1, -0.6, 0.7, 0.82, 0xff8a2a);
  gb.box('plain', 1.7, 0.25, 0.3, -0.6, 1.75, 0.82, 0x2f2f2f);
  gb.cyl('plain', 0.5, 0.6, 5.5, 0.9, 3.4, -1.6, 0x6e3226, 10);
  gb.cyl('plain', 0.62, 0.62, 0.3, 0.9, 8.9, -1.6, 0x2f2f2f, 10);
  chimneys.push(toWorld(ctx, 0.9, 9.3, -1.6));
  // anvil
  gb.box('plain', 0.5, 0.7, 0.5, 2.2, 0.1, 1.4, 0x2f2f2f);
  gb.box('plain', 1.1, 0.35, 0.5, 2.2, 0.8, 1.4, 0x3a3a3a);
  // scrap pile
  const scrap = [0x5c6770, 0x7a8088, 0x4a4f57, 0x8a5a3c];
  for (let i = 0; i < 7; i++) gb.box('plain', 0.5 + (i % 3) * 0.35, 0.25 + (i % 2) * 0.3, 0.4 + (i % 4) * 0.2, 2.4 - (i % 3) * 0.5, 0.1 + Math.floor(i / 3) * 0.35, -1.6 + (i % 2) * 0.6, scrap[i % 4], { ry: i * 0.7, rz: (i % 3 - 1) * 0.2 });
  return 9.4;
}

const STARTER_MODEL: Record<string, (ctx: Ctx) => number> = {
  cratestall: crateStall, fuelpump: fuelPump, repairstall: repairStall, eggstand: eggStand, beachshack: beachShack, scrapforge: scrapForge,
};

function stall(ctx: Ctx, bizId: string): number {
  const { gb, theme, r } = ctx;
  const accent = CATEGORY_ACCENT[BIZ[bizId].category];
  const starter = STARTER_MODEL[bizId];
  if (starter) return starter(ctx);
  if (bizId === 'kiosk') {
    gb.box('upper', 3.4, 3.0, 3.0, 0, 0.1, 0, pick(r, theme.walls), { tile: TILE });
    gb.box('plain', 4.2, 0.3, 3.8, 0, 3.1, 0, accent);
    gb.box(theme.neon ? 'glow' : 'plain', 3.0, 0.7, 0.2, 0, 3.4, 1.4, accent);
    gb.box('plain', 1.2, 1.4, 0.6, 2.4, 0.1, 1.2, 0x3a5a7a);
    return 4.2;
  }
  if (bizId === 'farmstand') {
    gb.box('plain', 4.4, 1.0, 1.6, 0, 0.1, 0.6, 0x8a5a3c);
    for (const sx of [-2, 2]) gb.box('plain', 0.2, 2.6, 0.2, sx, 0.1, -0.2, 0x6b4a35);
    gb.box('plain', 4.8, 0.2, 2.4, 0, 2.7, 0.2, 0xa63a2b, { rx: 0.15 });
    const veg = [0xd9483b, 0x6abf5e, 0xf2a03d, 0xe8c15a, 0x8f3fa0];
    for (let i = 0; i < 5; i++) gb.box('plain', 0.7, 0.35, 0.7, -1.7 + i * 0.85, 1.1, 0.6, veg[i]);
    for (let i = 0; i < 3; i++) gb.cyl('plain', 0.7, 0.7, 1.2, -3 + i * 0.1, 0.1, -1.8 + i * 1.5, 0xe2c26a, 10, 0, Math.PI / 2);
    return 3.2;
  }
  // street food cart
  gb.box('plain', 2.6, 1.2, 1.4, 0, 0.5, 0, 0xf2efe8);
  gb.box('plain', 2.7, 0.15, 1.5, 0, 1.7, 0, accent);
  for (const sx of [-1, 1]) gb.cyl('plain', 0.38, 0.38, 0.12, sx * 0.9, 0.4, 0.72, 0x2b2b2b, 10, Math.PI / 2);
  gb.cyl('plain', 0.06, 0.06, 2.6, 0, 1.7, 0, 0xcccccc, 5);
  gb.add('plain', new THREE.ConeGeometry(1.9, 0.9, 8), accent, 0, 4.4, 0);
  for (let i = 0; i < 2; i++) {
    const x = -2.6 + i * 5.2;
    gb.cyl('plain', 0.55, 0.55, 0.08, x, 0.85, 2.4, 0xffffff, 10);
    gb.cyl('plain', 0.06, 0.06, 0.85, x, 0, 2.4, 0x777777, 5);
    gb.add('plain', new THREE.ConeGeometry(1.1, 0.5, 8), i ? 0xf7f3ea : accent, x, 2.6, 2.4);
    gb.cyl('plain', 0.04, 0.04, 2.4, x, 0, 2.4, 0xbbbbbb, 4);
  }
  return 4.9;
}

function gasStation(ctx: Ctx): number {
  const { gb, theme, r, lw } = ctx;
  const accent = CATEGORY_ACCENT.energy;
  const cw = Math.min(lw - 2, 9);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box('plain', 0.35, 4.2, 0.35, sx * cw * 0.38, 0.1, 1.2 + sz * 1.6, 0xdedede);
  gb.box('plain', cw, 0.7, 5.4, 0, 4.3, 1.2, 0xf4f4f4);
  gb.box('plain', cw + 0.05, 0.3, 5.45, 0, 4.45, 1.2, accent);
  for (const sx of [-1, 1]) { gb.box('plain', 0.8, 1.5, 0.6, sx * cw * 0.2, 0.1, 1.2, 0xd9483b); gb.box('plain', 1.6, 0.2, 2.6, sx * cw * 0.2, 0.1, 1.2, 0xbdbdbd); }
  gb.box('upper', cw * 0.8, 3.4, 3.2, 0, 0.1, -2.9, pick(r, theme.walls), { tile: TILE });
  gb.cyl('plain', 0.15, 0.15, 6.5, cw / 2 + 0.2, 0.1, 3.4, 0x666666, 5);
  gb.box(theme.neon ? 'glow' : 'plain', 1.6, 2.2, 0.3, cw / 2 + 0.2, 6.4, 3.4, accent);
  return 6.0;
}

function oilWell(ctx: Ctx): number {
  const { gb, ld } = ctx;
  gb.box('plain', ctx.lw - 1.5, 0.15, ld - 1.5, 0, 0.08, 0, 0x7a5a3c);
  gb.box('plain', 1.4, 1.0, 4.5, -2, 0.2, 0, 0x3a3a3a);
  gb.box('plain', 0.3, 3.4, 0.3, -2.4, 1.2, 0.2, 0x2f2f2f, { rz: 0.15 });
  gb.box('plain', 0.3, 3.4, 0.3, -1.6, 1.2, 0.2, 0x2f2f2f, { rz: -0.15 });
  gb.box('plain', 0.5, 0.5, 6, -2, 4.4, 0.6, 0xe8b02a, { rx: -0.12 });
  gb.box('plain', 0.9, 1.6, 0.9, -2, 3.6, 3.6, 0x2f2f2f);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box('plain', 0.22, 14, 0.22, 3 + sx * 1.1, 0.1, -2 + sz * 1.1, 0xb33a2a, { rz: -sx * 0.06, rx: sz * 0.06 });
  for (let k = 1; k < 5; k++) gb.box('plain', 2.6 - k * 0.2, 0.15, 0.15, 3, k * 2.8, -0.9, 0xb33a2a);
  gb.cyl('plain', 1.6, 1.6, 3.2, 3, 0.1, 3.4, 0xe9e9e9, 12);
  return 14.5;
}

// ── Seats of power: every region's spawn point faces its own landmark (critic #6a) ─────────────
function hallSolenne(ctx: Ctx): number { // merchant palazzo with an arcaded loggia + campanile
  const { gb, lw, ld } = ctx;
  const stone = 0xf1e4cc, trim = 0xffffff, terracotta = 0xc8553d;
  const bw = lw - 6, bd = ld - 5, x0 = -2;
  gb.box('plain', bw + 1.5, 0.4, bd + 2.5, x0, 0, 0.6, 0xd8cdb8);
  const H0 = 4.6;
  gb.box('plain', bw - 0.4, H0, bd - 1.6, x0, 0.4, -0.8, 0x6b5a48);
  const n = 5;
  for (let i = 0; i <= n; i++) gb.box('plain', 0.8, H0, 1.0, x0 - bw / 2 + 0.4 + (i * (bw - 0.8)) / n, 0.4, bd / 2 - 0.5, stone);
  gb.box('plain', bw, 1.0, 1.1, x0, 0.4 + H0 - 1.0, bd / 2 - 0.5, stone);
  gb.box('upper', bw, FLOOR * 2, bd, x0, 0.4 + H0, 0, stone, { tile: TILE });
  const top = 0.4 + H0 + FLOOR * 2;
  gb.box('plain', bw + 0.8, 0.5, bd + 0.8, x0, top, 0, trim);
  gb.hip('plain', bw + 1, 2.6, bd + 1, x0, top + 0.5, 0, terracotta);
  for (const sx of [-1, 1]) {
    gb.cyl('plain', 0.07, 0.07, 6, x0 + sx * 3, top, bd / 2 + 0.3, 0xdddddd, 5);
    gb.box('plain', 1.7, 1.0, 0.06, x0 + sx * 3 + 0.85, top + 4.8, bd / 2 + 0.3, sx < 0 ? 0x1f8a8a : 0xc8553d);
  }
  const cx = lw / 2 - 2.3, cz = -ld / 2 + 2.5, tw = 3.4, th = 22;
  gb.box('upper', tw, th, tw, cx, 0.2, cz, 0xe9d7b8, { tile: TILE });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box('plain', 0.6, 3.2, 0.6, cx + sx * (tw / 2 - 0.3), 0.2 + th, cz + sz * (tw / 2 - 0.3), stone);
  gb.sphere('plain', 0.75, cx, 0.2 + th + 0.9, cz, 0xc9a227);
  gb.box('plain', tw + 0.5, 0.45, tw + 0.5, cx, 0.2 + th + 3.2, cz, trim);
  gb.hip('plain', tw + 0.5, 4.2, tw + 0.5, cx, 0.2 + th + 3.65, cz, terracotta);
  gb.cyl('plain', 0.08, 0.08, 2.2, cx, 0.2 + th + 7.8, cz, 0xd4af37, 5);
  return 0.2 + th + 10;
}

function hallRedMesa(ctx: Ctx): number { // adobe territorial courthouse with a bell gable + water tower
  const { gb, lw, ld } = ctx;
  const adobe = 0xd9a066, dark = 0xc0844e, wood = 0x6b4a35;
  const bw = lw - 6.5, bd = ld - 6, x0 = -2.4, z0 = -0.8;
  gb.box('upper', bw, FLOOR * 2 + 1, bd, x0, 0.1, z0, adobe, { tile: TILE });
  const H = 0.1 + FLOOR * 2 + 1;
  gb.box('plain', bw + 0.3, 0.8, 0.5, x0, H, z0 + bd / 2, dark);
  gb.box('plain', bw + 0.3, 0.8, 0.5, x0, H, z0 - bd / 2, dark);
  for (const sx of [-1, 1]) gb.box('plain', 0.5, 0.8, bd, x0 + sx * bw / 2, H, z0, dark);
  for (let i = 0; i < 8; i++) gb.cyl('plain', 0.15, 0.15, 1.0, x0 - bw / 2 + 0.9 + (i * (bw - 1.8)) / 7, H - 0.75, z0 + bd / 2 - 0.2, wood, 6, Math.PI / 2);
  const gz = z0 + bd / 2 - 0.2;
  gb.box('plain', 6.6, 3.2, 0.9, x0, H, gz, adobe);
  gb.box('plain', 4.4, 2.4, 0.9, x0, H + 3.2, gz, adobe);
  gb.box('plain', 2.2, 1.6, 0.9, x0, H + 5.6, gz, adobe);
  gb.box('plain', 1.3, 1.5, 1.0, x0, H + 3.5, gz, 0x3a2a1a);
  gb.sphere('plain', 0.5, x0, H + 3.7, gz, 0xc9a227);
  gb.box('plain', bw + 0.6, 0.3, 3.0, x0, 3.4, z0 + bd / 2 + 1.5, wood);
  for (let i = 0; i < 6; i++) gb.box('plain', 0.35, 3.3, 0.35, x0 - bw / 2 + 0.3 + (i * (bw - 0.6)) / 5, 0.1, z0 + bd / 2 + 2.8, 0x8a6a42);
  const tx = lw / 2 - 2.3, tz = -ld / 2 + 2.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box('plain', 0.3, 9.4, 0.3, tx + sx * 1.3, 0.1, tz + sz * 1.3, wood, { rz: -sx * 0.05, rx: sz * 0.05 });
  gb.box('plain', 3.2, 0.25, 3.2, tx, 9.4, tz, wood);
  gb.cyl('plain', 1.9, 1.9, 3.2, tx, 9.65, tz, 0x9c7a5a, 14);
  gb.add('plain', new THREE.ConeGeometry(2.1, 1.5, 14), 0x6b4a35, tx, 13.6, tz);
  return 14.5;
}

function hallNeonVale(ctx: Ctx): number { // glass civic tower with floating holo-rings and a podium screen
  const { gb, lw, ld } = ctx;
  gb.box('plain', lw - 2, 4.5, ld - 4, 0, 0.1, -0.5, 0x2b2f3a);
  gb.box('glow', lw - 1.9, 0.25, ld - 3.9, 0, 4.6, -0.5, 0x3df2ff);
  const tw = 8, td = 7, th = 34, base = 4.85;
  gb.box('glass', tw, th, td, 0, base, -1.2, 0x8fb0c8, { tile: TILE });
  for (const sx of [-1, 1]) gb.box('plain', 0.5, th + 3, 0.5, sx * (tw / 2 + 0.1), base, td / 2 - 1.1, 0xdfe7ef);
  gb.box('plain', tw + 0.6, 1.2, td + 0.6, 0, base + th, -1.2, 0x14161b);
  gb.add('glow', new THREE.TorusGeometry(5.4, 0.22, 6, 40), 0xff3e9a, 0, base + th + 4.6, -1.2, Math.PI / 2, 0, 0);
  gb.add('glow', new THREE.TorusGeometry(3.9, 0.16, 6, 32), 0x3df2ff, 0, base + th + 6.2, -1.2, Math.PI / 2, 0, 0);
  gb.cyl('plain', 0.12, 0.2, 7, 0, base + th + 1.2, -1.2, 0xdddddd, 6);
  gb.sphere('glow', 0.35, 0, base + th + 8.4, -1.2, 0xff3e9a);
  gb.box('plain', 7.4, 3.4, 0.3, 0, 0.6, ld / 2 - 2.6, 0x14161b);
  gb.box('glow', 7.0, 3.0, 0.1, 0, 0.8, ld / 2 - 2.42, 0x2bb7d9);
  gb.box('glow', 4.6, 0.5, 0.12, 0, 2.6, ld / 2 - 2.38, 0xf4efe6);
  return base + th + 8.8;
}

function hallAmberfield(ctx: Ctx): number { // red county hall with a white portico, clock cupola + grain silo
  const { gb, lw, ld } = ctx;
  const red = 0xa63a2b, white = 0xf6f2ea;
  const bw = lw - 7, bd = ld - 7, x0 = -2.4, z0 = -1;
  gb.box('upper', bw, FLOOR * 2, bd, x0, 0.1, z0, red, { tile: TILE });
  const H = 0.1 + FLOOR * 2;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box('plain', 0.4, H, 0.4, x0 + sx * bw / 2, 0, z0 + sz * bd / 2, white);
  gb.gable('plain', bw + 0.8, 3.4, bd + 1.0, x0, H, z0, 0x5a5550);
  const pz = z0 + bd / 2 + 1.3;
  for (let i = 0; i < 4; i++) gb.cyl('plain', 0.3, 0.34, H - 0.2, x0 - 2.4 + i * 1.6, 0.1, pz + 0.6, white, 10);
  gb.box('plain', 6.4, 0.5, 2.6, x0, H - 0.2, pz, white);
  gb.gable('plain', 2.6, 1.5, 6.4, x0, H + 0.3, pz, white, Math.PI / 2);
  gb.cyl('plain', 1.2, 1.2, 2.2, x0, H + 2.9, z0, white, 8);
  gb.cyl('plain', 0.62, 0.62, 0.12, x0, H + 3.9, z0 + 1.2, 0x14161b, 16, Math.PI / 2);
  gb.sphere('plain', 1.25, x0, H + 5.1, z0, 0x5f8f86, true);
  gb.cyl('plain', 0.06, 0.06, 1.6, x0, H + 6.3, z0, 0xd4af37, 5);
  const sx = lw / 2 - 2.4, sz = -ld / 2 + 2.6;
  gb.cyl('plain', 2.0, 2.0, 11, sx, 0.1, sz, 0xd8d4cc, 16);
  for (let k = 0; k < 5; k++) gb.cyl('plain', 2.06, 2.06, 0.2, sx, 1.8 + k * 2.1, sz, 0x9aa0a6, 16);
  gb.sphere('plain', 2.0, sx, 11.1, sz, 0xbfc5cb, true);
  for (let k = 0; k < 3; k++) gb.cyl('plain', 0.7, 0.7, 1.3, lw / 2 - 2.0, 0.1, ld / 2 - 2.0 - k * 1.5, 0xe2c26a, 12, Math.PI / 2);
  return 13.4;
}

function hallVerano(ctx: Ctx): number { // pastel island assembly: white arcade + clock tower with a turquoise dome
  const { gb, lw, ld } = ctx;
  const pink = 0xf6b1c3, turq = 0x2ec4c9, white = 0xffffff;
  const bw = lw - 2.5, bd = ld - 5.5, z0 = -0.8;
  gb.box('upper', bw, FLOOR * 2 + 0.6, bd, 0, 0.1, z0, pink, { tile: TILE });
  const H = 0.1 + FLOOR * 2 + 0.6;
  for (let i = 0; i < 7; i++) gb.cyl('plain', 0.32, 0.36, 4.0, -bw / 2 + 0.6 + (i * (bw - 1.2)) / 6, 0.1, z0 + bd / 2 + 1.5, white, 10);
  gb.box('plain', bw, 0.6, 2.3, 0, 4.1, z0 + bd / 2 + 1.0, white);
  gb.box('plain', bw + 0.5, 0.5, bd + 0.5, 0, H, z0, white);
  const tH = 9, tz = z0 - 0.4;
  gb.box('upper', 4.2, tH, 4.2, 0, H + 0.5, tz, 0xfbe3b0, { tile: TILE });
  gb.cyl('plain', 0.95, 0.95, 0.15, 0, H + 0.5 + tH - 2.2, tz + 2.12, white, 16, Math.PI / 2);
  gb.box('plain', 4.8, 0.5, 4.8, 0, H + 0.5 + tH, tz, white);
  gb.sphere('plain', 2.3, 0, H + 1.0 + tH, tz, turq, true, 1.25);
  gb.cyl('plain', 0.08, 0.08, 2, 0, H + 1.0 + tH + 2.8, tz, 0xd4af37, 5);
  for (const sx of [-1, 1]) { gb.box('plain', 1.4, 0.8, 1.4, sx * (bw / 2 - 0.4), 0.1, ld / 2 - 0.9, white); gb.sphere('plain', 0.9, sx * (bw / 2 - 0.4), 0.9, ld / 2 - 0.9, 0x4fa055); }
  return H + 1 + tH + 4.8;
}

function hallIronhold(ctx: Ctx): number { // brick Workers' Diet with a slate roof and a glowing clock tower
  const { gb, lw, ld } = ctx;
  const brick = 0x8a3b2c, stone = 0xb9b2a6, slate = 0x3a4048;
  const bw = lw - 6.5, bd = ld - 5, x0 = -2.6, z0 = -0.4;
  gb.box('upper', bw, FLOOR * 2.4, bd, x0, 0.1, z0, brick, { tile: TILE });
  const H = 0.1 + FLOOR * 2.4;
  gb.box('plain', bw + 0.3, 1.0, bd + 0.3, x0, 0.1, z0, stone);
  gb.box('plain', bw + 0.6, 0.5, bd + 0.6, x0, H, z0, stone);
  gb.gable('plain', bw + 0.8, 4.2, bd + 0.8, x0, H + 0.5, z0, slate);
  for (const sx of [-1, 1]) {
    gb.box('plain', 0.9, 3.4, 0.9, x0 + sx * bw * 0.3, H + 1.5, z0 - bd * 0.22, brick);
    ctx.chimneys.push(toWorld(ctx, x0 + sx * bw * 0.3, H + 5.1, z0 - bd * 0.22));
  }
  const cx = lw / 2 - 2.5, cz = ld / 2 - 3.4, tw = 3.6, th = 20;
  gb.box('upper', tw, th, tw, cx, 0.1, cz, 0x7a3328, { tile: TILE });
  gb.box('plain', tw + 0.5, 0.5, tw + 0.5, cx, 0.1 + th, cz, stone);
  gb.box('plain', tw, 3.2, tw, cx, 0.6 + th, cz, stone);
  gb.cyl('glow', 1.15, 1.15, 0.12, cx, 0.6 + th + 1.6, cz + tw / 2 + 0.02, 0xfff3c4, 20, Math.PI / 2);
  gb.hip('plain', tw + 0.4, 6.5, tw + 0.4, cx, 0.6 + th + 3.2, cz, slate);
  gb.cyl('plain', 0.08, 0.08, 2.2, cx, 0.6 + th + 9.7, cz, 0xd4af37, 5);
  return 0.6 + th + 11.9;
}

const HALLS: Record<RegionId, (ctx: Ctx) => number> = {
  solenne: hallSolenne, redmesa: hallRedMesa, neonvale: hallNeonVale, amberfield: hallAmberfield, verano: hallVerano, ironhold: hallIronhold,
};

function customs(ctx: Ctx): number {
  const { gb, lw, ld, theme } = ctx;
  const bw = lw - 2, bd = ld - 3;
  gb.box('upper', bw, GROUND + FLOOR, bd, 0, 0.1, -0.4, theme.id === 'ironhold' ? 0x7a3328 : 0xd9cbb2, { tile: TILE });
  gb.box('plain', bw + 0.5, 0.5, bd + 0.5, 0, GROUND + FLOOR + 0.1, -0.4, 0xe6dfd0);
  gb.box('upper', 3.4, 9, 3.4, bw / 2 - 2.2, GROUND + FLOOR + 0.6, -0.4, 0xe9e2d4, { tile: TILE });
  gb.cyl('glow', 0.9, 0.9, 0.2, bw / 2 - 2.2, GROUND + FLOOR + 7.8, 1.32, 0xfff6d8, 16, Math.PI / 2);
  gb.hip('plain', 4, 2.4, 4, bw / 2 - 2.2, GROUND + FLOOR + 9.6, -0.4, 0x2f6f5f);
  gb.box('plain', bw * 0.6, 0.8, 0.25, -1, GROUND - 0.5, bd / 2 - 0.2, 0x1f3b5a);
  return GROUND + FLOOR + 12;
}

const SCRUB: Record<string, number[]> = {
  solenne: [0x8d9a62, 0x7d8f5a, 0xa3a86a], redmesa: [0x9a8a4a, 0x8a7a44, 0xb39a5a], neonvale: [0x3f5a4a, 0x4d6b55, 0x35503f],
  amberfield: [0x6f9a3a, 0x86ad48, 0x5f8a34], verano: [0x5aa05a, 0x6fbf5e, 0x4a8f4a], ironhold: [0xf4f7fa, 0xe6ecf1, 0xdfe5ea],
};

/** Empty plot for sale: overgrown ground, scrub, a construction pallet, a low fence and a big FOR SALE board. */
function vacant(ctx: Ctx): number {
  const { gb, lw, ld, theme, r } = ctx;
  const scrub = SCRUB[theme.id] ?? SCRUB.solenne;
  gb.box('plain', lw - 1.2, 0.16, ld - 1.2, 0, 0.02, 0, shade(theme.groundAlt, 0.95));
  for (let i = 0; i < 3; i++) {
    const pw = (lw - 3) * (0.25 + next(r) * 0.3), pd = (ld - 3) * (0.25 + next(r) * 0.3);
    gb.box('plain', pw, 0.2, pd, (next(r) - 0.5) * (lw - 3 - pw), 0.03, (next(r) - 0.5) * (ld - 3 - pd), shade(theme.ground, 0.85 + next(r) * 0.2));
  }
  const n = 4 + Math.floor((lw * ld) / 60);
  for (let i = 0; i < n; i++) {
    const x = (next(r) - 0.5) * (lw - 3), z = (next(r) - 0.5) * (ld - 4) - 0.5;
    const s = 0.5 + next(r) * 0.9;
    gb.sphere('plain', s, x, 0.15, z, pick(r, scrub), true, 0.8 + next(r) * 0.6);
  }
  if (next(r) < 0.55) {
    const px = (next(r) - 0.5) * (lw - 6), pz = (next(r) - 0.5) * (ld - 6);
    gb.box('plain', 2.4, 0.3, 1.6, px, 0.18, pz, 0x9a7a52);
    gb.box('plain', 2.0, 0.9, 1.3, px, 0.48, pz, theme.snowRoofs ? 0xeef3f7 : 0xb9a07a);
  } else {
    const px = (next(r) - 0.5) * (lw - 6), pz = (next(r) - 0.5) * (ld - 6);
    gb.sphere('plain', 1.6, px, 0.1, pz, shade(theme.groundAlt, 0.8), true, 0.55);
  }
  const fz = ld / 2 - 0.9;
  for (let x = -lw / 2 + 1; x <= lw / 2 - 1 + 1e-6; x += 2.4) gb.box('plain', 0.14, 0.9, 0.14, x, 0.1, fz, 0x8a7a66);
  gb.box('plain', lw - 2, 0.1, 0.08, 0, 0.75, fz, 0xd8d0c4);
  gb.box('plain', lw - 2, 0.1, 0.08, 0, 0.45, fz, 0xd8d0c4);
  const sx = -lw / 2 + 3.4, sz = ld / 2 - 1.7;
  gb.cyl('plain', 0.12, 0.12, 3.0, sx - 1.5, 0.1, sz, 0x5a4a3a, 5);
  gb.cyl('plain', 0.12, 0.12, 3.0, sx + 1.5, 0.1, sz, 0x5a4a3a, 5);
  gb.box('plain', 3.6, 1.7, 0.14, sx, 1.45, sz, 0xf2c14e);
  gb.box('plain', 3.0, 0.3, 0.16, sx, 2.6, sz, 0x14161b);
  gb.box('plain', 2.2, 0.2, 0.16, sx, 2.15, sz, 0x14161b);
  gb.box('plain', 2.6, 0.2, 0.16, sx, 1.8, sz, 0x14161b);
  return 1;
}

/** Props that accumulate as a business levels up, placed along the lot's front edge so they never
 *  clip the building: planters → lit sign → string lights → gold kerb → billboard → statue. */
function growthProps(ctx: Ctx, level: number, accent: number): void {
  const band = levelBand(level);
  if (band < 1) return;
  const { gb, lw, ld, theme } = ctx;
  const fz = ld / 2 - 0.9, ex = lw / 2 - 1.0;
  for (const sx of [-1, 1]) {
    gb.box('plain', 1.0, 0.6, 1.0, sx * ex, 0.1, fz, 0x9a8f80);
    gb.sphere('plain', 0.62, sx * ex, 0.75, fz, theme.treeColors[0] ?? 0x4fa055);
  }
  if (band >= 2) {
    gb.cyl('plain', 0.08, 0.08, 3.6, ex - 0.2, 0.1, fz - 1.1, 0x555b66, 5);
    gb.box('glow', 0.18, 1.2, 1.5, ex - 0.2, 2.6, fz - 1.1, accent);
  }
  if (band >= 3) for (let i = 0; i < 7; i++) gb.sphere('glow', 0.13, -ex + 0.9 + (i * (2 * ex - 1.8)) / 6, 2.5 - Math.sin((i / 6) * Math.PI) * 0.45, fz + 0.2, i % 2 ? 0xfff3c4 : accent);
  if (band >= 4) {
    gb.box('plain', lw - 0.6, 0.22, 0.25, 0, 0.1, ld / 2 - 0.25, 0xd4af37);
    gb.box('plain', 0.25, 0.22, ld - 0.6, -lw / 2 + 0.25, 0.1, 0, 0xd4af37);
    gb.box('plain', 0.25, 0.22, ld - 0.6, lw / 2 - 0.25, 0.1, 0, 0xd4af37);
  }
  if (band >= 5) {
    for (const sx of [-1, 1]) gb.box('plain', 0.2, 5.2, 0.2, -ex + 0.6 + sx * 1.4, 0.1, fz - 1.3, 0x444a55);
    gb.box('plain', 3.6, 1.8, 0.2, -ex + 0.6, 4.0, fz - 1.3, 0x14161b);
    gb.box('glow', 3.3, 1.5, 0.08, -ex + 0.6, 4.15, fz - 1.18, accent);
  }
  if (band >= 6) {
    gb.cyl('plain', 0.7, 0.8, 0.9, 0, 0.1, fz, 0xd8d1c3, 10);
    gb.sphere('plain', 0.5, 0, 1.5, fz, 0xf2c14e);
    gb.cyl('plain', 0.25, 0.32, 0.9, 0, 1.0, fz, 0xf2c14e, 8);
  }
}

function business(ctx: Ctx, ls: LotState, fp: LotDef['footprint']): number {
  const top = businessBody(ctx, ls, fp);
  growthProps(ctx, ls.level, CATEGORY_ACCENT[BIZ[ls.biz!].category]);
  return top;
}

function businessBody(ctx: Ctx, ls: LotState, fp: LotDef['footprint']): number {
  const b = BIZ[ls.biz!];
  const { theme, r } = ctx;
  if (b.tier === 1) return stall(ctx, b.id);
  if (b.id === 'gasstation') return gasStation(ctx);
  if (b.id === 'oilwell') return oilWell(ctx);
  if (b.category === 'industry') return industrial(ctx, b.tier, ls.level);
  if (b.category === 'logistics') return warehouse(ctx, b.tier);
  if (b.id === 'fishery') return warehouse(ctx, 2, true);
  const floors = floorsFor(b.tier, ls.level, fp, theme, r);
  if (b.id === 'bank' || b.id === 'offshore') return b.id === 'bank' ? tower(ctx, floors, 'finance', true) : block(ctx, 2, 'finance', { roofStyle: 'flat' });
  if (b.tier >= 4 || (theme.id === 'neonvale' && b.tier >= 3) || (b.category === 'tech' && b.tier >= 3)) return tower(ctx, floors, b.category);
  return block(ctx, floors, b.category, { balconies: b.category === 'hospitality', pool: b.id === 'resort' });
}

/** Builds every lot (buildings, vacant plots, civic buildings) into the GeoBuilder. */
export function buildLots(gb: GeoBuilder, layout: CityLayout, lots: Record<string, LotState> | null, theme: Theme, only?: LotDef[]): BuildOutput {
  const out: BuildOutput = { lots: new Map(), chimneys: [] };
  for (const def of only ?? layout.lots) {
    const ls = lots?.[def.id];
    const r = makeRng(hash(def.id + (ls?.biz ?? 'v')));
    const ew = def.facing === 'e' || def.facing === 'w';
    const ctx: Ctx = {
      gb, theme, r, region: layout.regionId, lw: ew ? def.d : def.w, ld: ew ? def.w : def.d,
      chimneys: out.chimneys, frame: new THREE.Matrix4().makeRotationY(ROT[def.facing]).setPosition(def.x, 0, def.z),
    };
    gb.setFrame(def.x, def.z, ROT[def.facing]);
    gb.box('plain', ctx.lw - 0.2, 0.14, ctx.ld - 0.2, 0, 0, 0, theme.lotGround);
    let top: number;
    if (def.civic === 'cityhall') top = HALLS[ctx.region](ctx);
    else if (def.civic === 'customs') top = customs(ctx);
    else if (!ls || ls.owner === 'vacant' || !ls.biz) top = lots ? vacant(ctx) : business(ctx, { owner: 'npc', biz: showcaseBiz(def, r), level: 1 + Math.floor(next(r) * 30), till: 0, manager: false, invested: 0, permitUntil: 0, frozenUntil: 0 }, def.footprint);
    else top = business(ctx, ls, def.footprint);
    const box = new THREE.Box3(new THREE.Vector3(def.x - def.w / 2, 0, def.z - def.d / 2), new THREE.Vector3(def.x + def.w / 2, Math.max(2.5, top), def.z + def.d / 2));
    out.lots.set(def.id, { top, box, center: new THREE.Vector3(def.x, top, def.z) });
  }
  gb.resetFrame();
  return out;
}

function showcaseBiz(def: LotDef, r: RngHolder): string {
  const opts = { small: ['cafe', 'boutique', 'kiosk', 'laundromat', 'guesthouse'], medium: ['hotel', 'gym', 'workshop', 'cafe'], large: ['depot', 'factory', 'startup', 'resort'], tower: ['tower', 'bank'] }[def.footprint];
  return opts[Math.floor(next(r) * opts.length)];
}
