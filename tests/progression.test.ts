import { describe, it, expect } from 'vitest';
import { newGame } from '../src/core/state';
import { GOALS, RANKS, VEHICLES, rankIndexFor } from '../src/core/data/progression';
import { progressCheck } from '../src/core/sim';
import { buyAccountant, buyVehicle, collectAll, hustleTap, travel, unlockRegion } from '../src/core/actions';
import { derived } from '../src/core/economy';
import { getCity } from '../src/core/city';
import { REGION } from '../src/core/data/regions';

describe('F10 progression', () => {
  it('rank titles follow net-worth thresholds and pay gold on first reach', () => {
    expect(rankIndexFor(0)).toBe(0);
    expect(RANKS[rankIndexFor(60_000)].name).toBe('Shopkeeper');
    expect(RANKS[rankIndexFor(1e10)].name).toBe('Borderline Rich');
    const s = newGame('solenne', 1);
    s.cash = 60_000;
    progressCheck(s);
    expect(s.stats.rankIndex).toBe(3);
    expect(s.gold).toBe(RANKS[1].gold + RANKS[2].gold + RANKS[3].gold);
    progressCheck(s);
    expect(s.gold).toBe(RANKS[1].gold + RANKS[2].gold + RANKS[3].gold);
  });

  it('the goal chain advances and pays region-scaled rewards', () => {
    const s = newGame('neonvale', 1);
    expect(GOALS[0].id).toBe('hustle10');
    for (let i = 0; i < 10; i++) hustleTap(s);
    const cash = s.cash;
    progressCheck(s);
    expect(s.goalIndex).toBe(1);
    expect(s.cash - cash).toBe(Math.round(GOALS[0].cash! * REGION.neonvale.economy.costIndex));
  });

  it('vehicles get strictly faster and cost money', () => {
    for (let i = 1; i < VEHICLES.length; i++) {
      expect(VEHICLES[i].speed).toBeGreaterThan(VEHICLES[i - 1].speed);
      expect(VEHICLES[i].cost).toBeGreaterThan(VEHICLES[i - 1].cost);
    }
    const s = newGame('solenne', 1);
    expect(buyVehicle(s, 'bicycle').ok).toBe(false);
    s.cash = 2_000;
    expect(buyVehicle(s, 'bicycle').ok).toBe(true);
    expect(s.vehicle).toBe('bicycle');
    expect(s.cash).toBe(500);
  });

  it('expansion unlocks at Entrepreneur; travel keeps holdings in every region earning', () => {
    const s = newGame('amberfield', 1);
    const home = getCity('amberfield').lots.find((d) => s.regions.amberfield.lots[d.id].owner === 'vacant')!;
    Object.assign(s.regions.amberfield.lots[home.id], { owner: 'player', biz: 'cafe', level: 5, manager: true });
    s.cash = 10_000_000;
    expect(unlockRegion(s, 'neonvale').ok).toBe(false);
    progressCheck(s);
    expect(unlockRegion(s, 'neonvale').ok).toBe(true);
    expect(travel(s, 'neonvale').ok).toBe(true);
    expect(s.currentRegion).toBe('neonvale');
    const away = getCity('neonvale').lots.find((d) => s.regions.neonvale.lots[d.id].owner === 'vacant')!;
    Object.assign(s.regions.neonvale.lots[away.id], { owner: 'player', biz: 'appstudio', level: 2, manager: true });
    s.rev++;
    const d = derived(s, true);
    expect(d.playerByRegion.amberfield).toBeGreaterThan(0);
    expect(d.playerByRegion.neonvale).toBeGreaterThan(0);
    expect(s.regions.amberfield.lots[home.id].owner).toBe('player');
    expect(travel(s, 'ironhold').ok).toBe(false);
  });

  it('Collect All requires an accountant', () => {
    const s = newGame('solenne', 1);
    const lot = getCity('solenne').lots.find((d) => s.regions.solenne.lots[d.id].owner === 'vacant')!;
    Object.assign(s.regions.solenne.lots[lot.id], { owner: 'player', biz: 'kiosk', level: 1, till: 100 });
    expect(collectAll(s)).toBe(0);
    s.cash = 10_000;
    expect(buyAccountant(s).ok).toBe(true);
    expect(collectAll(s)).toBe(100);
  });
});
