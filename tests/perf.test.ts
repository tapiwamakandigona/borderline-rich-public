// Mobile performance guards (T13): frame pacing, adaptive fallback, and the per-lot geometry cache
// that makes a chunk rebuild a concatenation instead of regenerating every building.
import { describe, expect, it } from 'vitest';
import { AdaptiveResolution, FramePacer, QUALITY } from '../src/world/quality';
import { GeoBuilder, meshesFrom, type Bucket } from '../src/world/geo';
import { buildLots } from '../src/world/buildings';
import { getCity } from '../src/core/city';
import { THEMES } from '../src/world/themes';
import { newGame } from '../src/core/state';
import type * as THREE from 'three';

function rendered(intervalMs: number, n: number): number {
  const p = new FramePacer();
  let t = 0, drawn = 0;
  for (let i = 0; i < n; i++) { t += intervalMs; if (p.tick(t)) drawn++; }
  return drawn;
}

describe('frame pacing', () => {
  it('renders every frame at 60 Hz', () => { expect(rendered(1000 / 60, 600)).toBe(600); });
  it('renders every frame at 90 Hz', () => { expect(rendered(1000 / 90, 900)).toBe(900); });
  it('halves 120 Hz to ~60 fps', () => {
    const d = rendered(1000 / 120, 1200); // 10 s
    expect(d).toBeGreaterThan(560);
    expect(d).toBeLessThan(640);
  });
});

describe('adaptive quality', () => {
  it('counts windows spent too slow at the minimum resolution, resets when it recovers', () => {
    const a = new AdaptiveResolution(1.5);
    for (let i = 0; i < 400; i++) a.sample(1 / 20); // 20 s at 20 fps
    expect(a.dpr).toBe(0.75);
    expect(a.starved).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < 200; i++) a.sample(1 / 60);
    expect(a.starved).toBe(0);
  });
  it('medium skips tree shadows and halves shadow-map updates; high keeps both', () => {
    expect(QUALITY.medium.treeShadows).toBe(false);
    expect(QUALITY.medium.shadowEvery).toBe(2);
    expect(QUALITY.high.treeShadows).toBe(true);
    expect(QUALITY.high.shadowEvery).toBe(1);
  });
});

describe('per-lot geometry cache', () => {
  const vertsOf = (meshes: THREE.Mesh[]) => {
    const out: Record<string, { n: number; sum: number }> = {};
    for (const m of meshes) {
      const a = m.geometry.attributes.position.array as Float32Array;
      let sum = 0;
      for (let i = 0; i < a.length; i++) sum += a[i];
      out[m.name] = { n: a.length, sum };
    }
    return out;
  };
  for (const region of ['solenne', 'neonvale'] as const) {
    it(`${region}: merging cached lots gives the same geometry as building the chunk at once`, () => {
      const layout = getCity(region);
      const lots = newGame(region, 7).regions[region].lots;
      const theme = THEMES[region];
      const defs = layout.lots.slice(0, 12);
      const whole = new GeoBuilder();
      buildLots(whole, layout, lots, theme, defs);
      const mats = { upper: {}, ground: {}, plain: {}, glass: {}, glow: {} } as unknown as Record<Bucket, THREE.Material>;
      const a = vertsOf(whole.build(mats));
      const parts = defs.map((d) => { const gb = new GeoBuilder(); buildLots(gb, layout, lots, theme, [d]); return gb.mergeParts(); });
      const b = vertsOf(meshesFrom(parts, mats));
      expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());
      for (const k of Object.keys(a)) {
        expect(b[k].n).toBe(a[k].n);
        expect(b[k].sum).toBeCloseTo(a[k].sum, 1);
      }
      // the cached inputs survive the merge (still usable for the next rebuild)
      expect(parts.some((p) => Object.values(p).some((g) => g!.attributes.position.count > 0))).toBe(true);
    });
  }
});
