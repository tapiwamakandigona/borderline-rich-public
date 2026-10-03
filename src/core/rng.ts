// Seeded RNG (mulberry32). The generator state lives in GameState.rng so saves resume the
// exact same sequence. Never use the platform RNG or wall clock in src/core.

export interface RngHolder { rng: number }

export function next(h: RngHolder): number {
  let t = (h.rng = (h.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const chance = (h: RngHolder, p: number): boolean => next(h) < p;
export const range = (h: RngHolder, a: number, b: number): number => a + (b - a) * next(h);
export const int = (h: RngHolder, a: number, b: number): number => a + Math.floor(next(h) * (b - a + 1));
export function pick<T>(h: RngHolder, arr: readonly T[]): T {
  return arr[Math.floor(next(h) * arr.length)];
}
export function weighted<T>(h: RngHolder, items: readonly T[], weight: (x: T) => number): T {
  let total = 0;
  for (const it of items) total += Math.max(0, weight(it));
  let r = next(h) * total;
  for (const it of items) {
    r -= Math.max(0, weight(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/** Stable 32-bit hash for deriving seeds from strings (FNV-1a). */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const makeRng = (seed: number): RngHolder => ({ rng: seed | 0 });
