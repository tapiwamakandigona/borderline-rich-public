// World: owns the renderer and the 3D city of the current region. Reads sim state, never writes it.
import * as THREE from 'three';
import type { LotState, RegionId } from '../core/types';
import { getCity, type CityLayout, type LotDef } from '../core/city';
import { DAY } from '../core/constants';
import { makeRng } from '../core/rng';
import { THEMES, type Theme } from './themes';
import { facade, storefront } from './textures';
import { GeoBuilder, type Bucket } from './geo';
import { buildLots, type LotVisual } from './buildings';
import { buildScenery, type SceneryHandles } from './scenery';
import { CoinBurst, Pedestrians, Smoke, Traffic, Weather } from './life';
import { Markers } from './markers';
import { Player } from './player';
import { CameraRig } from './camera';
import { AdaptiveResolution, QUALITY, type QualityName, type QualityPreset } from './quality';

export interface WorldStats { calls: number; triangles: number; dpr: number; fps: number; quality: QualityName; rebuilds: number; rebuildMs: number; chunks: number; }
/** The city is merged per chunk of 2×2 blocks, so a lot change rebuilds ~1/9–1/6 of the city. */
interface Chunk { defs: LotDef[]; meshes: THREE.Mesh[]; chimneys: THREE.Vector3[]; sig: string }
const CHUNK_BLOCKS = 2;
/** At most this many dirty chunks are rebuilt per sync (the rest wait for the next one). */
const MAX_CHUNKS_PER_SYNC = 2;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const SIDE_VEC: Record<string, [number, number]> = { s: [0, 1], n: [0, -1], e: [1, 0], w: [-1, 0] };

export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly player = new Player();
  readonly coins = new CoinBurst();
  region: RegionId | null = null;
  layout: CityLayout | null = null;
  theme: Theme | null = null;
  private quality: QualityPreset;
  private adaptive: AdaptiveResolution;
  private mats: Record<Bucket, THREE.Material> | null = null;
  private regionDisposables: { dispose(): void }[] = [];
  private scenery: SceneryHandles | null = null;
  private city = new THREE.Group();
  private visuals = new Map<string, LotVisual>();
  private chunks: Chunk[] = [];
  private ownerSig = '';
  /** Rebuild accounting (exposed in stats() for tests and the settings panel). */
  readonly perf = { rebuilds: 0, lastMs: 0, maxMs: 0 };
  private markers = new Markers(160);
  private traffic: Traffic | null = null;
  private peds: Pedestrians | null = null;
  private weather: Weather | null = null;
  private smoke: Smoke | null = null;
  private hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 1);
  private sun = new THREE.DirectionalLight(0xffffff, 2.5);
  private time = 0;
  private fps = { acc: 0, n: 0, value: 60 };
  private lastStats = { calls: 0, triangles: 0 };
  private env: THREE.Texture | null = null;
  readonly envState = { night: 0, dusk: 0, sunDir: new THREE.Vector3(0, 1, 0) };

  constructor(canvas: HTMLCanvasElement, quality: QualityName) {
    this.quality = QUALITY[quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.antialias, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = this.quality.shadows > 0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.adaptive = new AdaptiveResolution(Math.min(globalThis.devicePixelRatio || 1, this.quality.maxDpr));
    this.renderer.setPixelRatio(this.adaptive.dpr);
    this.rig = new CameraRig(1);
    if (this.quality.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(this.quality.shadows, this.quality.shadows);
      const c = this.sun.shadow.camera;
      c.left = c.bottom = -85; c.right = c.top = 85; c.near = 10; c.far = 420;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.6;
    }
    this.scene.add(this.hemi, this.sun, this.sun.target, this.city, this.markers.group, this.coins.mesh, this.player.group);
    this.player.group.visible = false;
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.rig.camera.aspect = w / Math.max(1, h);
    this.rig.camera.updateProjectionMatrix();
  }

  private disposeRegion(): void {
    for (const d of this.regionDisposables) d.dispose();
    this.regionDisposables = [];
    if (this.scenery) { this.scene.remove(this.scenery.group); this.scenery.dispose(); this.scenery = null; }
    for (const m of [...this.city.children]) { this.city.remove(m); (m as THREE.Mesh).geometry?.dispose(); }
    for (const x of [this.traffic, this.peds, this.weather, this.smoke]) x?.dispose();
    if (this.traffic) this.scene.remove(this.traffic.body, this.traffic.lights);
    if (this.peds) this.scene.remove(this.peds.bodies, this.peds.heads);
    if (this.weather) this.scene.remove(this.weather.object);
    if (this.smoke) this.scene.remove(this.smoke.mesh);
    this.traffic = this.peds = this.weather = this.smoke = null as never;
    this.env?.dispose();
    this.env = null;
  }

  private makeEnv(theme: Theme): THREE.Texture {
    const pm = new THREE.PMREMGenerator(this.renderer);
    const s = new THREE.Scene();
    const g = new THREE.SphereGeometry(100, 24, 12);
    const col: number[] = [];
    const top = new THREE.Color(theme.sky.day.zenith), hor = new THREE.Color(theme.sky.day.horizon), gnd = new THREE.Color(theme.ground).multiplyScalar(0.6);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 100;
      const c = y > 0 ? hor.clone().lerp(top, Math.pow(y, 0.6)) : hor.clone().lerp(gnd, Math.min(1, -y * 4));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    s.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const sunM = new THREE.Mesh(new THREE.SphereGeometry(8, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(theme.sunColor).multiplyScalar(8) }));
    sunM.position.set(40, 60, 30);
    s.add(sunM);
    const tex = pm.fromScene(s, 0.02).texture;
    pm.dispose(); g.dispose();
    return tex;
  }

  /** Build the 3D city for a region. lots=null renders a showcase city (region picker). */
  setRegion(regionId: RegionId, lots: Record<string, LotState> | null, mode: 'play' | 'showcase'): void {
    this.disposeRegion();
    this.region = regionId;
    this.layout = getCity(regionId);
    const theme = (this.theme = THEMES[regionId]);
    const seed = this.layout.cols * 31 + this.layout.rows;
    const fac = facade(theme.windowStyle, seed, theme.windowGlow);
    const store = storefront(seed + 3, theme.windowGlow);
    const curtain = facade('curtain', seed + 7, theme.neon ? 0xbfe0ff : theme.windowGlow);
    this.env = this.makeEnv(theme);
    this.mats = {
      upper: new THREE.MeshStandardMaterial({ map: fac.map, emissiveMap: fac.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.85 }),
      ground: new THREE.MeshStandardMaterial({ map: store.map, emissiveMap: store.emissive, emissive: 0xffffff, emissiveIntensity: 0.1, vertexColors: true, roughness: 0.55 }),
      plain: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }),
      glass: new THREE.MeshStandardMaterial({ map: curtain.map, emissiveMap: curtain.emissive, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.16, metalness: 0.6, envMap: this.env, envMapIntensity: 1.3 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true }),
    };
    this.regionDisposables.push(...Object.values(this.mats), fac.map, fac.emissive, store.map, store.emissive, curtain.map, curtain.emissive);
    this.scenery = buildScenery(this.layout, theme, this.quality, this.mats);
    this.scene.add(this.scenery.group);
    this.scene.fog = new THREE.Fog(theme.sky.day.horizon, theme.fogNear, theme.fogFar);
    this.hemi.color.setHex(theme.hemi.sky);
    this.hemi.groundColor.setHex(theme.hemi.ground);
    const r = makeRng(seed * 13);
    this.traffic = new Traffic(this.layout, this.quality.cars, r);
    this.scene.add(this.traffic.body, this.traffic.lights);
    if (this.quality.peds) { this.peds = new Pedestrians(this.layout, this.quality.peds, r); this.scene.add(this.peds.bodies, this.peds.heads); }
    this.weather = new Weather(theme.weather, this.quality.weather, r);
    this.scene.add(this.weather.object);
    this.ownerSig = '';
    this.makeChunks();
    this.rebuildCity(lots);
    const center = new THREE.Vector3(0, 0, 0);
    if (mode === 'showcase') {
      this.player.group.visible = false;
      this.rig.showcase(center, Math.max(this.layout.width, this.layout.depth) * 0.62);
      // Start the orbit on the land side so the coast (if any) frames the city's far edge.
      const wet = theme.water ? this.layout.water[0] : undefined;
      this.rig.azimuth = wet === 's' ? Math.PI * 0.92 : wet === 'n' ? 0.08 : wet === 'e' ? -Math.PI * 0.42 : wet === 'w' ? Math.PI * 0.42 : Math.PI * 0.25;
    } else {
      this.player.group.visible = true;
      this.spawnPlayer();
      this.rig.follow(this.player.pos);
    }
  }

  private spawnPlayer(): void {
    const L = this.layout!;
    const hall = L.lots.find((l) => l.civic === 'cityhall') ?? L.lots[0];
    const [fx, fz] = SIDE_VEC[hall.facing];
    const depth = fx ? hall.w : hall.d;
    this.player.pos.set(hall.x + fx * (depth / 2 + 5), 0, hall.z + fz * (depth / 2 + 5));
    this.player.vel.set(0, 0, 0);
    this.player.path = null;
    this.player.heading = Math.atan2(-fx, -fz);
  }

  private makeChunks(): void {
    const L = this.layout!;
    const nx = Math.ceil(L.cols / CHUNK_BLOCKS);
    const n = nx * Math.ceil(L.rows / CHUNK_BLOCKS);
    this.chunks = Array.from({ length: n }, () => ({ defs: [], meshes: [], chimneys: [], sig: '' }));
    for (const def of L.lots) {
      const [i, j] = def.block;
      this.chunks[Math.floor(i / CHUNK_BLOCKS) + nx * Math.floor(j / CHUNK_BLOCKS)].defs.push(def);
    }
    this.chunks = this.chunks.filter((c) => c.defs.length);
  }

  /** What a lot looks like (geometry changes only when this changes). */
  private static lotSig(l: LotState | undefined): string { return l ? `${l.biz ?? '-'}${Math.floor(l.level / 10)}` : 'x'; }
  private chunkSig(c: Chunk, lots: Record<string, LotState> | null): string {
    let s = '';
    for (const d of c.defs) s += World.lotSig(lots?.[d.id]) + '|';
    return s;
  }

  private buildChunk(c: Chunk, lots: Record<string, LotState> | null): void {
    const t0 = performance.now();
    for (const m of c.meshes) { this.city.remove(m); m.geometry.dispose(); }
    const gb = new GeoBuilder();
    const out = buildLots(gb, this.layout!, lots, this.theme!, c.defs);
    c.meshes = gb.build(this.mats!);
    for (const m of c.meshes) this.city.add(m);
    for (const [id, v] of out.lots) this.visuals.set(id, v);
    c.chimneys = out.chimneys;
    c.sig = this.chunkSig(c, lots);
    const ms = performance.now() - t0;
    this.perf.rebuilds++; this.perf.lastMs = ms; this.perf.maxMs = Math.max(this.perf.maxMs, ms);
  }

  private updateSmoke(): void {
    const all = this.chunks.flatMap((c) => c.chimneys);
    if (!this.smoke) { this.smoke = new Smoke(all, makeRng(5)); this.scene.add(this.smoke.mesh); } else this.smoke.setSources(all);
  }

  /** Full build (region change). Normal play only rebuilds the chunks whose lots changed. */
  private rebuildCity(lots: Record<string, LotState> | null): void {
    this.visuals = new Map();
    for (const c of this.chunks) this.buildChunk(c, lots);
    this.updateSmoke();
  }

  /** Apply sim state: rebuild only chunks whose lots changed look (bounded per call); markers
   *  when owners changed. Returns how many chunks were rebuilt. */
  syncLots(lots: Record<string, LotState>, ownerColor: (owner: string) => number | null, cashReady: Set<string>, permits: Set<string>): number {
    if (!this.layout) return 0;
    let rebuilt = 0;
    for (const c of this.chunks) {
      if (rebuilt >= MAX_CHUNKS_PER_SYNC) break;
      if (this.chunkSig(c, lots) === c.sig) continue;
      this.buildChunk(c, lots);
      rebuilt++;
    }
    if (rebuilt) { this.updateSmoke(); this.ownerSig = ''; }
    let o = '';
    for (const def of this.layout.lots) o += `${lots[def.id].owner}|`;
    if (o !== this.ownerSig) { this.markers.rebuild(this.layout, lots, this.visuals, ownerColor); this.ownerSig = o; }
    const cash: THREE.Vector3[] = [], hold: THREE.Vector3[] = [];
    for (const id of cashReady) { const v = this.visuals.get(id); if (v) cash.push(v.center); }
    for (const id of permits) { const v = this.visuals.get(id); if (v) hold.push(v.center); }
    this.markers.setStatus(cash, hold);
    return rebuilt;
  }

  select(lotId: string | null): void {
    const def = lotId ? this.layout?.lotById[lotId] : null;
    this.markers.select(def ? this.visuals.get(def.id) ?? null : null, def?.w, def?.d);
  }

  private updateEnv(simT: number): void {
    const theme = this.theme!;
    const tod = (simT / DAY + 0.08) % 1;
    const elev = tod < 0.72 ? Math.sin((Math.PI * tod) / 0.72) : -Math.sin((Math.PI * (tod - 0.72)) / 0.28) * 0.55;
    const az = tod < 0.72 ? Math.PI * (tod / 0.72) : Math.PI * (1 + (tod - 0.72) / 0.28);
    const e = Math.asin(Math.max(-1, Math.min(1, elev))) * 0.9;
    const dir = this.envState.sunDir.set(Math.cos(az) * Math.cos(e), Math.sin(e), 0.42).normalize();
    const night = smooth(0.06, -0.18, elev);
    const dusk = (1 - smooth(0.04, 0.42, elev)) * (1 - night);
    this.envState.night = night;
    this.envState.dusk = dusk;
    const lerp3 = (a: number, b: number, c: number) => new THREE.Color(a).lerp(new THREE.Color(b), dusk).lerp(new THREE.Color(c), night);
    const zen = lerp3(theme.sky.day.zenith, theme.sky.dusk.zenith, theme.sky.night.zenith);
    const hor = lerp3(theme.sky.day.horizon, theme.sky.dusk.horizon, theme.sky.night.horizon);
    const sunCol = new THREE.Color(theme.sunColor).lerp(new THREE.Color(theme.duskSun), dusk);
    const s = this.scenery!;
    s.skyMat.uniforms.zenith.value.copy(zen);
    s.skyMat.uniforms.horizon.value.copy(hor);
    s.skyMat.uniforms.sunCol.value.copy(sunCol);
    s.skyMat.uniforms.sunDir.value.copy(dir);
    s.skyMat.uniforms.night.value = night;
    (this.scene.fog as THREE.Fog).color.copy(hor);
    const lightDir = night > 0.5 ? new THREE.Vector3(-dir.x, Math.abs(dir.y) + 0.4, dir.z).normalize() : dir;
    const day = smooth(-0.05, 0.25, elev);
    this.sun.color.copy(night > 0.5 ? new THREE.Color(0x9fb6ff) : sunCol);
    this.sun.intensity = theme.sunIntensity * day + 0.45 * night;
    this.hemi.intensity = theme.hemi.intensity * (0.4 + 0.6 * (1 - night)) + 0.1;
    this.hemi.color.setHex(theme.hemi.sky).lerp(new THREE.Color(0x3a4a7a), night * 0.8);
    const focus = this.player.group.visible ? this.player.pos : new THREE.Vector3();
    this.sun.position.copy(focus).addScaledVector(lightDir, 200);
    this.sun.target.position.copy(focus);
    const m = this.mats!;
    (m.upper as THREE.MeshStandardMaterial).emissiveIntensity = 0.03 + night * 1.25 + dusk * 0.25;
    (m.glass as THREE.MeshStandardMaterial).emissiveIntensity = 0.02 + night * 0.9 + dusk * 0.25;
    (m.ground as THREE.MeshStandardMaterial).emissiveIntensity = 0.12 + night * 1.3 + dusk * 0.3;
    (m.glow as THREE.MeshBasicMaterial).color.setScalar(0.85 + night * 0.9);
    for (const w of s.waterMats) {
      w.uniforms.skyCol.value.copy(hor);
      w.uniforms.sunCol.value.copy(sunCol);
      w.uniforms.sunDir.value.copy(dir);
      w.uniforms.night.value = night;
      w.uniforms.time.value = this.time;
    }
    if (s.lampPools) (s.lampPools.material as THREE.MeshBasicMaterial).opacity = night * 0.55 + dusk * 0.15;
    if (s.lampHeads) (s.lampHeads.material as THREE.MeshBasicMaterial).color.setHex(theme.lampColor).multiplyScalar(0.5 + night * 1.6);
    if (s.blades) s.blades.bases.forEach((b, i) => { s.blades!.mesh.setMatrixAt(i, b.clone().multiply(new THREE.Matrix4().makeRotationZ(this.time * 0.9 + i))); });
    if (s.blades) s.blades.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Collision: keep the player on land, inside the map, and out of buildings. */
  resolve = (x: number, z: number, flying: boolean): [number, number] => {
    const L = this.layout!;
    const b = L.bounds;
    x = Math.min(b.maxX, Math.max(b.minX, x));
    z = Math.min(b.maxZ, Math.max(b.minZ, z));
    const hw = L.width / 2 + 9, hd = L.depth / 2 + 9;
    if (this.theme?.water) {
      if (L.water.includes('s')) z = Math.min(z, hd);
      if (L.water.includes('n')) z = Math.max(z, -hd);
      if (L.water.includes('e')) x = Math.min(x, hw);
      if (L.water.includes('w')) x = Math.max(x, -hw);
    }
    if (flying) return [x, z];
    const R = 0.6;
    for (const def of L.lots) {
      const v = this.visuals.get(def.id);
      if (!v || v.top < 2.2) continue;
      const x0 = def.x - def.w / 2 + 0.7 - R, x1 = def.x + def.w / 2 - 0.7 + R;
      const z0 = def.z - def.d / 2 + 0.7 - R, z1 = def.z + def.d / 2 - 0.7 + R;
      if (x > x0 && x < x1 && z > z0 && z < z1) {
        const dx = Math.min(x - x0, x1 - x), dz = Math.min(z - z0, z1 - z);
        if (dx < dz) x = x - x0 < x1 - x ? x0 : x1; else z = z - z0 < z1 - z ? z0 : z1;
      }
    }
    return [x, z];
  };

  /** Walk/drive along the road grid to the front of a lot. */
  autoTravel(lotId: string): void {
    const L = this.layout!;
    const def = L.lotById[lotId];
    if (!def) return;
    const [fx, fz] = SIDE_VEC[def.facing];
    const depth = fx ? def.w : def.d;
    const front = new THREE.Vector3(def.x + fx * (depth / 2 + 3.5), 0, def.z + fz * (depth / 2 + 3.5));
    const near = (arr: number[], v: number) => arr.reduce((bi, a, i) => (Math.abs(a - v) < Math.abs(arr[bi] - v) ? i : bi), 0);
    const p = this.player.pos;
    const i0 = near(L.roadX, p.x), j0 = near(L.roadZ, p.z);
    const i1 = near(L.roadX, front.x), j1 = near(L.roadZ, front.z);
    const pts = [new THREE.Vector3(L.roadX[i0], 0, L.roadZ[j0]), new THREE.Vector3(L.roadX[i1], 0, L.roadZ[j0]), new THREE.Vector3(L.roadX[i1], 0, L.roadZ[j1])];
    const onX = Math.abs(front.x - L.roadX[i1]) < Math.abs(front.z - L.roadZ[j1]);
    pts.push(onX ? new THREE.Vector3(L.roadX[i1], 0, front.z) : new THREE.Vector3(front.x, 0, L.roadZ[j1]), front);
    this.player.path = this.player.flying ? [front] : pts;
  }

  pick(clientX: number, clientY: number, rect: DOMRect): string | null {
    if (!this.layout) return null;
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.rig.camera);
    let best: string | null = null, bestD = Infinity;
    const hit = new THREE.Vector3();
    for (const [id, v] of this.visuals) {
      if (ray.ray.intersectBox(v.box, hit)) {
        const d = hit.distanceTo(ray.ray.origin);
        if (d < bestD) { bestD = d; best = id; }
      }
    }
    return best;
  }

  lotVisual(id: string): LotVisual | undefined { return this.visuals.get(id); }
  distanceToLot(id: string): number {
    const def = this.layout?.lotById[id];
    if (!def) return Infinity;
    const dx = Math.max(0, Math.abs(this.player.pos.x - def.x) - def.w / 2);
    const dz = Math.max(0, Math.abs(this.player.pos.z - def.z) - def.d / 2);
    return Math.hypot(dx, dz);
  }
  screenPos(v: THREE.Vector3, rect: DOMRect): { x: number; y: number; on: boolean } {
    const p = v.clone().project(this.rig.camera);
    return { x: rect.left + ((p.x + 1) / 2) * rect.width, y: rect.top + ((1 - p.y) / 2) * rect.height, on: p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1 };
  }

  /** dt in seconds; move = camera-relative joystick (x right, y forward), 0..1. */
  frame(dt: number, simT: number, move: THREE.Vector2): void {
    if (!this.layout || !this.scenery) return;
    dt = Math.min(dt, 0.1);
    this.time += dt;
    this.updateEnv(simT);
    if (this.player.group.visible) {
      const { fwd, right } = this.rig.basis();
      const dir = new THREE.Vector2().addScaledVector(right, move.x).addScaledVector(fwd, move.y);
      this.player.update(dt, dir, this.resolve);
    }
    this.rig.update(dt, this.player.group.visible ? this.player.pos : null, this.player.vel);
    this.scenery.sky.position.copy(this.rig.camera.position);
    this.traffic?.update(dt, this.envState.night);
    this.peds?.update(dt, this.time);
    this.weather?.update(dt, this.player.group.visible ? this.player.pos : new THREE.Vector3(), this.time);
    this.smoke?.update(dt, this.rig.camera);
    this.coins.update(dt);
    this.markers.update(this.time);
    this.renderer.render(this.scene, this.rig.camera);
    this.lastStats = { calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles };
    this.fps.acc += dt; this.fps.n++;
    if (this.fps.acc >= 1) { this.fps.value = this.fps.n / this.fps.acc; this.fps.acc = 0; this.fps.n = 0; }
    if (this.adaptive.sample(dt)) this.renderer.setPixelRatio(this.adaptive.dpr);
  }

  stats(): WorldStats {
    return { ...this.lastStats, dpr: this.renderer.getPixelRatio(), fps: this.fps.value, quality: this.quality.name, rebuilds: this.perf.rebuilds, rebuildMs: this.perf.lastMs, chunks: this.chunks.length };
  }

  dispose(): void {
    this.disposeRegion();
    this.markers.dispose();
    this.coins.dispose();
    this.player.dispose();
    this.renderer.dispose();
  }
}
