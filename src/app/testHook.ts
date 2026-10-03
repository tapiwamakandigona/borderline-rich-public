// window.__BR — only compiled into `npm run build:test` (mode simtest) for Playwright. Never shipped.
import type { Session } from './session';
import { advance } from '../core/sim';
import { trigger } from '../core/events';
import { getCity } from '../core/city';
import type { RegionId } from '../core/types';

export function installTestHook(s: Session): void {
  const api = {
    session: s,
    state: () => s.state,
    start: (region: RegionId) => s.start(region),
    give: (cash: number, gold = 0) => { if (s.state) { s.state.cash += cash; s.state.gold += gold; s.state.rev++; } },
    advance: (sec: number) => { if (s.state) { advance(s.state, sec); s.syncWorld(); } },
    event: (defId: string) => { if (s.state) trigger(s.state, defId, s.state.currentRegion); },
    /** First lot in the current region matching an owner ('vacant', 'npc', 'player', a rival id). */
    findLot: (owner: string, footprint?: string) => {
      const st = s.state!;
      const city = getCity(st.currentRegion);
      const def = city.lots.find((d) => st.regions[st.currentRegion].lots[d.id].owner === owner && (!footprint || d.footprint === footprint));
      return def?.id ?? null;
    },
    teleport: (lotId: string) => {
      const def = getCity(s.state!.currentRegion).lotById[lotId];
      const p = s.world.player.pos;
      const off = def.facing === 's' ? [0, def.d / 2 + 3] : def.facing === 'n' ? [0, -def.d / 2 - 3] : def.facing === 'e' ? [def.w / 2 + 3, 0] : [-def.w / 2 - 3, 0];
      p.set(def.x + off[0], 0, def.z + off[1]);
      s.world.player.path = null;
      // Camera behind the player, looking at the lot's front.
      s.world.rig.azimuth = { s: 0, n: Math.PI, e: Math.PI / 2, w: -Math.PI / 2 }[def.facing];
      s.world.rig.resetView();
      s.world.rig.snap(p);
    },
    /** Hold random events for a scripted session (explicit b.event() calls still work). */
    quiet: () => {
      const st = s.state;
      if (!st) return;
      st.nextEventAt = st.t + 1e6;
      for (const r of Object.values(st.rivals)) r.nextActAt = st.t + 1e6; // offers/sabotage also open modals
    },
    lotScreen: (lotId: string) => {
      const v = s.world.lotVisual(lotId);
      if (!v) return null;
      const c = v.center.clone();
      c.y = Math.min(v.top, 6) * 0.5;
      return s.world.screenPos(c, s.canvas.getBoundingClientRect());
    },
    playerPos: () => ({ x: s.world.player.pos.x, z: s.world.player.pos.z }),
    camera: () => ({ azimuth: s.world.rig.azimuth, dist: s.world.rig.dist, polar: s.world.rig.polar }),
    stats: () => s.world.stats(),
    /** Change ONE lot's business and report what the world rebuilt (critic #5), vs a full rebuild. */
    rebuildProbe: () => {
      const st = s.state!;
      const lots = st.regions[st.currentRegion].lots;
      const id = Object.keys(lots).find((k) => lots[k].owner === 'vacant')!;
      s.syncWorld(); // flush anything pending first
      const before = s.world.perf.rebuilds;
      const t0 = performance.now();
      lots[id] = { ...lots[id], owner: 'npc', biz: 'cart', level: 1 };
      st.rev++;
      s.syncWorld();
      const ms = performance.now() - t0;
      const chunksRebuilt = s.world.perf.rebuilds - before;
      const t1 = performance.now();
      (s.world as unknown as { rebuildCity(l: typeof lots): void }).rebuildCity(lots);
      const fullMs = performance.now() - t1;
      return { chunksRebuilt, ms, fullMs, chunks: s.world.stats().chunks };
    },
  };
  (globalThis as unknown as { __BR: typeof api }).__BR = api;
}
