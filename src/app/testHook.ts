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
      s.world.rig.dist = 64;
      s.world.rig.polar = 0.92;
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
  };
  (globalThis as unknown as { __BR: typeof api }).__BR = api;
}
