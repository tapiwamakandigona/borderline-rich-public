import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

// Guards the harness state files so a broken definition-of-done can't slip through CI.
describe('harness state files', () => {
  const fj = JSON.parse(readFileSync('features.json', 'utf8')) as {
    features: { id: string; title: string; acceptance: string; verify: string; passes: boolean; evidence: string }[];
  };
  it('features.json has unique ids and complete entries', () => {
    const ids = fj.features.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of fj.features) {
      expect(f.title.length).toBeGreaterThan(3);
      expect(f.acceptance.length).toBeGreaterThan(10);
      expect(f.verify.length).toBeGreaterThan(5);
      expect(typeof f.passes).toBe('boolean');
      if (f.passes) expect(f.evidence.length, `${f.id} passes without evidence`).toBeGreaterThan(10);
    }
  });
  it('required state files exist and AGENTS.md is within 100 lines', () => {
    for (const p of ['AGENTS.md', 'CLAUDE.md', 'PROJECT.md', 'progress.md', 'plan.md', 'EVALUATOR.md'])
      expect(existsSync(p), p).toBe(true);
    expect(readFileSync('AGENTS.md', 'utf8').split('\n').length).toBeLessThanOrEqual(100);
  });
});
