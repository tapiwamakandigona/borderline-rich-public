// T12c — player-facing text tells the truth (critic #2 findings 9, 10, 11).
import { describe, it, expect } from 'vitest';
import { newGame } from '../src/core/state';
import { buyVacant } from '../src/core/actions';
import { getCity } from '../src/core/city';
import { article } from '../src/core/format';
import { methodsFor, quote } from '../src/core/trade';
import { EVENTS } from '../src/core/data/events';
import { ENEMY_STANDING, permitWait } from '../src/core/mechanics';
import { REGION, REGION_IDS } from '../src/core/data/regions';

describe('T12c text tells the truth', () => {
  it('toasts use the right article: "an Egg Stand", "a Fuel Pump"', () => {
    expect(article('Egg Stand')).toBe('an');
    expect(article('Oil Well')).toBe('an');
    expect(article('Fuel Pump')).toBe('a');
    const s = newGame('amberfield', 3);
    s.cash = 1e9;
    const R = 'amberfield' as const;
    const lot = getCity(R).lots.find((d) => s.regions[R].lots[d.id].owner === 'vacant' && d.footprint === 'small')!;
    expect(buyVacant(s, R, lot.id, 'eggstand').ok).toBe(true);
    expect(s.notices.at(-1)!.text).toBe('You opened an Egg Stand.');
  });

  it('transship is only offered between two non-Solenne regions, and those quotes are valid', () => {
    for (const from of REGION_IDS) for (const to of REGION_IDS) {
      if (from === to) continue;
      const offered = methodsFor(from, to).some((m) => m.id === 'transship');
      expect(offered).toBe(from !== 'solenne' && to !== 'solenne');
    }
    const s = newGame('solenne', 5);
    s.cash = 1e9;
    // The quote still guards the method for any caller that bypasses the sheet.
    expect(quote(s, REGION.solenne.produces[0], 1, 'verano', 'transship', false).msg).toMatch(/two other regions/);
  });

  it('rm_nephew "Refuse" promises nothing a single refusal does not do', () => {
    const ev = EVENTS.find((e) => e.id === 'rm_nephew')!;
    const refuse = ev.choices.find((c) => c.label === 'Refuse')!;
    const delta = refuse.outcome!.standing![0][1];
    const s = newGame('redmesa', 8);
    const before = permitWait(s, 'kiosk');
    s.regions.redmesa.factions.circle.standing += delta;
    // One refusal from neutral does not reach enemy standing, so permits are unchanged…
    expect(s.regions.redmesa.factions.circle.standing).toBeGreaterThan(ENEMY_STANDING);
    expect(permitWait(s, 'kiosk')).toBe(before);
    expect(refuse.outcome!.text).not.toMatch(/next permit/i);
    // …and a second one does, which is what the text warns about.
    s.regions.redmesa.factions.circle.standing += delta;
    expect(permitWait(s, 'kiosk')).toBeGreaterThan(before);
  });
});
