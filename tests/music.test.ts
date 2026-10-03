import { describe, expect, it } from 'vitest';
import { MOODS, Music, triad } from '../src/audio/music';

const REGIONS = ['solenne', 'redmesa', 'neonvale', 'amberfield', 'verano', 'ironhold'] as const;

describe('procedural music', () => {
  it('has a mood for every region, with in-scale chords in a playable range', () => {
    for (const id of REGIONS) {
      const m = MOODS[id];
      expect(m.bpm).toBeGreaterThan(50);
      for (const deg of m.prog) {
        const notes = triad(m, deg);
        expect(notes).toHaveLength(3);
        for (const n of notes) {
          expect(m.scale).toContain((((n - m.root) % 12) + 12) % 12);
          expect(n).toBeGreaterThanOrEqual(48);
          expect(n).toBeLessThanOrEqual(96);
        }
        expect(notes[1]).toBeGreaterThan(notes[0]);
        expect(notes[2]).toBeGreaterThan(notes[1]);
      }
    }
  });

  it('is inert before audio is unlocked (no context, no throw)', () => {
    const mu = new Music();
    mu.setRegion('neonvale');
    mu.setEnabled(true);
    mu.attach(null, null);
    mu.setEnabled(false);
    mu.dispose();
  });
});
