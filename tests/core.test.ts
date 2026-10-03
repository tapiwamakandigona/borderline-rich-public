import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { newGame } from '../src/core/state';
import { serialize, deserialize, MIGRATIONS } from '../src/core/save';
import { advance } from '../src/core/sim';
import { runBot } from './helpers/bot';

const strip = (s: string) => s.replace(/"lastSeenWall":\d+/, '');

describe('F2 deterministic simulation core', () => {
  it('same seed + same action script => identical state after 30 simulated minutes', () => {
    const a = newGame('solenne', 777);
    const b = newGame('solenne', 777);
    runBot(a, 1800, { tapsPerSec: 4 });
    runBot(b, 1800, { tapsPerSec: 4 });
    expect(a.t).toBeCloseTo(1800, 5);
    expect(strip(serialize(a))).toBe(strip(serialize(b)));
    expect(a.stats.bizBought).toBeGreaterThan(3);
  });

  it('a different seed produces a different world', () => {
    const a = newGame('solenne', 1);
    const b = newGame('solenne', 2);
    expect(serialize(a)).not.toBe(serialize(b));
  });

  it('save -> load round-trips exactly and both copies evolve identically', () => {
    const a = newGame('ironhold', 4242);
    runBot(a, 300, { tapsPerSec: 4 });
    const b = deserialize(serialize(a))!;
    expect(b).not.toBeNull();
    expect(serialize(b)).toBe(serialize(a));
    advance(a, 120);
    advance(b, 120);
    expect(serialize(b)).toBe(serialize(a));
  });

  it('rejects corrupt, future-version and structurally broken saves', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('')).toBeNull();
    expect(deserialize(JSON.stringify({ v: 999, s: {} }))).toBeNull();
    expect(deserialize(JSON.stringify({ v: 1, s: { cash: 'lots' } }))).toBeNull();
    const g = newGame('verano', 5);
    const broken = JSON.parse(serialize(g));
    delete broken.s.regions.ironhold;
    expect(deserialize(JSON.stringify(broken))).toBeNull();
  });

  it('runs registered migrations for older saves', () => {
    const g = newGame('amberfield', 9);
    const payload = JSON.parse(serialize(g));
    payload.v = 0;
    payload.s.cash = undefined;
    MIGRATIONS[0] = (s) => ({ ...s, cash: 321 });
    try {
      const loaded = deserialize(JSON.stringify(payload));
      expect(loaded?.cash).toBe(321);
    } finally {
      delete MIGRATIONS[0];
    }
  });

  it('src/core never uses Math.random or Date.now (time and RNG are injected)', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.ts')) files.push(p);
      }
    };
    walk('src/core');
    expect(files.length).toBeGreaterThan(10);
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/Math\.random|Date\.now|performance\.now/);
    }
  });
});
