// Graphics presets + adaptive resolution. Headless/SwiftShader timings are not device timings.
export type QualityName = 'low' | 'medium' | 'high';
export interface QualityPreset {
  name: QualityName;
  maxDpr: number;
  shadows: number; // shadow map size, 0 = off
  cars: number;
  peds: number;
  props: number; // tree density multiplier
  weather: number; // particle count
  antialias: boolean;
  treeShadows: boolean; // trees are the heaviest shadow casters (instanced, never culled per tree)
  shadowEvery: number; // re-render the shadow map every Nth frame
}
export const QUALITY: Record<QualityName, QualityPreset> = {
  low: { name: 'low', maxDpr: 1, shadows: 0, cars: 18, peds: 0, props: 0.6, weather: 300, antialias: false, treeShadows: false, shadowEvery: 1 },
  medium: { name: 'medium', maxDpr: 1.5, shadows: 1024, cars: 36, peds: 36, props: 0.9, weather: 700, antialias: false, treeShadows: false, shadowEvery: 2 },
  high: { name: 'high', maxDpr: 2, shadows: 2048, cars: 60, peds: 70, props: 1, weather: 1400, antialias: true, treeShadows: true, shadowEvery: 1 },
};
export function defaultQuality(): QualityName {
  if (typeof navigator === 'undefined') return 'medium';
  const touch = 'ontouchstart' in globalThis || navigator.maxTouchPoints > 0;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  if (touch && mem <= 3) return 'low';
  return touch ? 'medium' : 'high';
}

/** Lowers/raises device-pixel ratio to hold ~60 fps (or ~40 on weak devices). */
export class AdaptiveResolution {
  private acc = 0;
  private frames = 0;
  /** Consecutive 2 s windows spent at the minimum DPR while still too slow. */
  starved = 0;
  dpr: number;
  constructor(private max: number, private min = 0.75) { this.dpr = max; }
  sample(dt: number): boolean {
    this.acc += dt; this.frames++;
    if (this.acc < 2) return false;
    const avg = this.acc / this.frames;
    this.acc = 0; this.frames = 0;
    const before = this.dpr;
    this.starved = avg > 1 / 40 && this.dpr <= this.min ? this.starved + 1 : 0;
    if (avg > 1 / 40 && this.dpr > this.min) this.dpr = Math.max(this.min, this.dpr - 0.25);
    else if (avg < 1 / 75 && this.dpr < this.max) this.dpr = Math.min(this.max, this.dpr + 0.25);
    return before !== this.dpr;
  }
}

/** Frame pacing: on 90–144 Hz screens the browser fires rAF up to 144×/s. A city sim gains nothing
 *  from more than ~60 frames, so above 100 Hz every other frame is skipped (half the GPU work,
 *  battery and heat). 60 Hz screens are unaffected. */
export class FramePacer {
  private avg = 1000 / 60;
  private last = 0;
  private skip = false;
  /** Call once per rAF; returns false when this frame should not be rendered. */
  tick(now: number): boolean {
    if (this.last) this.avg += (Math.min(50, now - this.last) - this.avg) * 0.05;
    this.last = now;
    if (this.avg > 10) { this.skip = false; return true; } // ≤ 100 Hz: render every frame
    this.skip = !this.skip;
    return !this.skip;
  }
}
