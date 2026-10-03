// Temporary world-preview entry (replaced by the full app in T8).
import * as THREE from 'three';
import { World } from './world/World';
import { newGame } from './core/state';
import { REGION } from './core/data/regions';
import type { RegionId } from './core/types';

const q = new URLSearchParams(location.search);
const region = (q.get('region') ?? 'solenne') as RegionId;
const mode = (q.get('mode') ?? 'showcase') as 'play' | 'showcase';
const simT = Number(q.get('t') ?? 40);
document.body.style.margin = '0';
const canvas = document.createElement('canvas');
canvas.style.cssText = 'display:block;width:100vw;height:100vh';
document.getElementById('app')!.appendChild(canvas);
const world = new World(canvas, (q.get('q') as 'low' | 'medium' | 'high') ?? 'high');
const state = newGame(region, 7);
world.setRegion(region, state.regions[region].lots, mode);
const colors: Record<string, number> = {};
for (const r of REGION[region].rivals) colors[r.id] = parseInt(r.color.slice(1), 16);
world.syncLots(state.regions[region].lots, (o) => (o === 'player' ? 0xf2c14e : colors[o] ?? null), new Set(), new Set());
if (q.get('zoom')) world.rig.dist = Number(q.get('zoom'));
if (q.get('az')) world.rig.azimuth = Number(q.get('az'));
const resize = () => world.resize(innerWidth, innerHeight);
addEventListener('resize', resize); resize();
let last = performance.now();
(window as unknown as { __world: World }).__world = world;
function loop(now: number) {
  const dt = (now - last) / 1000; last = now;
  world.frame(dt, simT + now / 1000 * 0, new THREE.Vector2());
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
