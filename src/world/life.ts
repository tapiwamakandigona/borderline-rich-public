// Moving life: traffic on the road graph, pedestrians on sidewalks, weather, chimney smoke and
// coin-burst particles. All instanced (one draw call per kind).
import * as THREE from 'three';
import type { CityLayout } from '../core/city';
import { makeRng, next, range, type RngHolder } from '../core/rng';
import { GeoBuilder } from './geo';
import type { Theme } from './themes';
import { glowTexture } from './textures';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function mergedGeometry(fill: (gb: GeoBuilder) => void): THREE.BufferGeometry {
  const gb = new GeoBuilder();
  fill(gb);
  const tmp = new THREE.MeshBasicMaterial();
  const mesh = gb.build({ plain: tmp, glow: tmp })[0];
  tmp.dispose();
  return mesh.geometry;
}

// ── Traffic ──────────────────────────────────────────────────────────────────
interface Car { i: number; j: number; ti: number; tj: number; s: number; len: number; speed: number; }
export class Traffic {
  readonly body: THREE.InstancedMesh;
  readonly lights: THREE.InstancedMesh;
  private cars: Car[] = [];
  private lightMat: THREE.MeshBasicMaterial;
  constructor(private layout: CityLayout, count: number, r: RngHolder) {
    const bodyG = mergedGeometry((gb) => {
      gb.box('plain', 2.0, 0.85, 4.3, 0, 0.35, 0, 0xffffff);
      gb.box('plain', 1.75, 0.72, 2.3, 0, 1.2, -0.2, 0x26303a);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box('plain', 0.3, 0.6, 0.75, sx * 0.95, 0.05, sz * 1.35, 0x1b1b1b);
    });
    const lightG = mergedGeometry((gb) => {
      for (const sx of [-1, 1]) {
        gb.box('plain', 0.45, 0.22, 0.08, sx * 0.62, 0.75, 2.17, 0xfff3d0);
        gb.box('plain', 0.45, 0.2, 0.08, sx * 0.62, 0.78, -2.17, 0xff3030);
      }
    });
    this.body = new THREE.InstancedMesh(bodyG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.3 }), count);
    this.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.lights = new THREE.InstancedMesh(lightG, this.lightMat, count);
    this.body.castShadow = true;
    const palette = [0xd9483b, 0xf2c14e, 0x2a6fa8, 0xffffff, 0x1f8a8a, 0x3a3f46, 0xc2408f, 0xe07a1f, 0x8fb35a, 0xdedede];
    const col = new THREE.Color();
    const nx = layout.roadX.length, nz = layout.roadZ.length;
    for (let k = 0; k < count; k++) {
      const i = Math.floor(next(r) * nx), j = Math.floor(next(r) * nz);
      const car: Car = { i, j, ti: i, tj: j, s: 0, len: 1, speed: range(r, 9, 15) };
      this.pickNext(car, r);
      car.s = next(r) * car.len;
      this.cars.push(car);
      this.body.setColorAt(k, col.setHex(palette[Math.floor(next(r) * palette.length)]));
    }
    this.rng = r;
  }
  private rng: RngHolder;
  private pickNext(c: Car, r: RngHolder): void {
    const nx = this.layout.roadX.length, nz = this.layout.roadZ.length;
    const opts: [number, number][] = [];
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = c.ti + di, nj = c.tj + dj;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= nz) continue;
      if (ni === c.i && nj === c.j && opts.length) continue;
      opts.push([ni, nj]);
    }
    const [ni, nj] = opts[Math.floor(next(r) * opts.length)] ?? [c.i, c.j];
    c.i = c.ti; c.j = c.tj; c.ti = ni; c.tj = nj; c.s = 0;
    const a = this.node(c.i, c.j), b = this.node(c.ti, c.tj);
    c.len = Math.max(1, Math.hypot(b.x - a.x, b.z - a.z));
  }
  private node(i: number, j: number) { return { x: this.layout.roadX[i], z: this.layout.roadZ[j] }; }
  update(dt: number, night: number): void {
    const lane = this.layout.road * 0.22;
    this.cars.forEach((c, k) => {
      c.s += c.speed * dt;
      if (c.s >= c.len) this.pickNext(c, this.rng);
      const a = this.node(c.i, c.j), b = this.node(c.ti, c.tj);
      const dx = (b.x - a.x) / c.len, dz = (b.z - a.z) / c.len;
      const x = a.x + dx * c.s - dz * lane, z = a.z + dz * c.s + dx * lane;
      _q.setFromAxisAngle(UP, Math.atan2(dx, dz));
      _m.compose(_v.set(x, 0.15, z), _q, _s.set(1, 1, 1));
      this.body.setMatrixAt(k, _m);
      this.lights.setMatrixAt(k, _m);
    });
    this.body.instanceMatrix.needsUpdate = true;
    this.lights.instanceMatrix.needsUpdate = true;
    this.lightMat.color.setScalar(0.35 + night * 1.6);
  }
  dispose(): void { this.body.geometry.dispose(); this.lights.geometry.dispose(); (this.body.material as THREE.Material).dispose(); this.lightMat.dispose(); }
}

// ── Pedestrians ──────────────────────────────────────────────────────────────
interface Ped { x0: number; z0: number; w: number; d: number; p: number; v: number; phase: number; }
export class Pedestrians {
  readonly bodies: THREE.InstancedMesh;
  readonly heads: THREE.InstancedMesh;
  private peds: Ped[] = [];
  constructor(layout: CityLayout, count: number, r: RngHolder) {
    const bg = new THREE.CylinderGeometry(0.26, 0.3, 1.25, 7); bg.translate(0, 0.75, 0);
    const hg = new THREE.SphereGeometry(0.22, 8, 6); hg.translate(0, 1.6, 0);
    this.bodies = new THREE.InstancedMesh(bg, new THREE.MeshStandardMaterial({ roughness: 0.8 }), count);
    this.heads = new THREE.InstancedMesh(hg, new THREE.MeshStandardMaterial({ roughness: 0.7 }), count);
    const clothes = [0xd9483b, 0x2a6fa8, 0xf2c14e, 0x1f8a8a, 0x3a3f46, 0xffffff, 0xc2408f, 0x6b8f4e, 0xe07a1f];
    const skins = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x7a4a2a];
    const col = new THREE.Color();
    const { roadX, roadZ, road } = layout;
    for (let k = 0; k < count; k++) {
      const i = Math.floor(next(r) * (roadX.length - 1)), j = Math.floor(next(r) * (roadZ.length - 1));
      const x0 = roadX[i] + road / 2 + 1.0, z0 = roadZ[j] + road / 2 + 1.0;
      const w = roadX[i + 1] - roadX[i] - road - 2.0, d = roadZ[j + 1] - roadZ[j] - road - 2.0;
      this.peds.push({ x0, z0, w, d, p: next(r) * 2 * (w + d), v: range(r, 1.1, 1.9) * (next(r) < 0.5 ? -1 : 1), phase: next(r) * 6 });
      this.bodies.setColorAt(k, col.setHex(clothes[Math.floor(next(r) * clothes.length)]));
      this.heads.setColorAt(k, col.setHex(skins[Math.floor(next(r) * skins.length)]));
    }
    this.bodies.castShadow = true;
  }
  update(dt: number, time: number): void {
    this.peds.forEach((p, k) => {
      const per = 2 * (p.w + p.d);
      p.p = (((p.p + p.v * dt) % per) + per) % per;
      let x: number, z: number, dir: number;
      if (p.p < p.w) { x = p.x0 + p.p; z = p.z0; dir = Math.PI / 2; }
      else if (p.p < p.w + p.d) { x = p.x0 + p.w; z = p.z0 + (p.p - p.w); dir = 0; }
      else if (p.p < 2 * p.w + p.d) { x = p.x0 + p.w - (p.p - p.w - p.d); z = p.z0 + p.d; dir = -Math.PI / 2; }
      else { x = p.x0; z = p.z0 + p.d - (p.p - 2 * p.w - p.d); dir = Math.PI; }
      if (p.v < 0) dir += Math.PI;
      const bob = Math.abs(Math.sin(time * 7 * Math.abs(p.v) + p.phase)) * 0.08;
      _q.setFromAxisAngle(UP, dir);
      _m.compose(_v.set(x, 0.22 + bob, z), _q, _s.set(1, 1, 1));
      this.bodies.setMatrixAt(k, _m);
      this.heads.setMatrixAt(k, _m);
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }
  dispose(): void { for (const m of [this.bodies, this.heads]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } }
}

// ── Weather ──────────────────────────────────────────────────────────────────
export class Weather {
  readonly object: THREE.Object3D;
  private pos: Float32Array;
  private kind: Theme['weather'];
  private count: number;
  private tex: THREE.Texture | null = null;
  constructor(kind: Theme['weather'], count: number, r: RngHolder) {
    this.kind = kind;
    this.count = kind === 'none' ? 0 : count;
    const n = this.count;
    if (kind === 'rain') {
      this.pos = new Float32Array(n * 6);
      for (let k = 0; k < n; k++) {
        const x = range(r, -80, 80), y = range(r, 0, 60), z = range(r, -80, 80);
        this.pos.set([x, y, z, x + 0.25, y + 1.6, z], k * 6);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      this.object = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab8d0, transparent: true, opacity: 0.45 }));
    } else {
      this.pos = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) this.pos.set([range(r, -90, 90), range(r, 0, 60), range(r, -90, 90)], k * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      this.tex = glowTexture();
      this.object = new THREE.Points(g, new THREE.PointsMaterial({
        size: kind === 'snow' ? 0.55 : 0.9, map: this.tex, transparent: true, depthWrite: false,
        color: kind === 'snow' ? 0xffffff : 0xd8a46a, opacity: kind === 'snow' ? 0.95 : 0.35,
      }));
    }
    this.object.frustumCulled = false;
    this.object.visible = this.count > 0;
  }
  update(dt: number, center: THREE.Vector3, time: number): void {
    if (!this.count) return;
    this.object.position.set(center.x, 0, center.z);
    const p = this.pos;
    if (this.kind === 'rain') {
      for (let k = 0; k < this.count; k++) {
        const o = k * 6;
        p[o + 1] -= 38 * dt; p[o + 4] -= 38 * dt; p[o] += 3 * dt; p[o + 3] += 3 * dt;
        if (p[o + 1] < 0) { p[o + 1] += 60; p[o + 4] += 60; }
        if (p[o] > 80) { p[o] -= 160; p[o + 3] -= 160; }
      }
    } else {
      const fall = this.kind === 'snow' ? 3.2 : 0.6;
      for (let k = 0; k < this.count; k++) {
        const o = k * 3;
        p[o + 1] -= fall * dt;
        p[o] += (this.kind === 'snow' ? Math.sin(time + k) * 0.6 : 5) * dt;
        if (p[o + 1] < 0) p[o + 1] += 60;
        if (p[o] > 90) p[o] -= 180;
      }
    }
    ((this.object as THREE.Points).geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
  dispose(): void {
    const o = this.object as THREE.Points;
    o.geometry.dispose(); (o.material as THREE.Material).dispose(); this.tex?.dispose();
  }
}

// ── Smoke & coin bursts ──────────────────────────────────────────────────────
export class Smoke {
  readonly mesh: THREE.InstancedMesh;
  private puffs: { src: number; age: number; life: number; dx: number; dz: number }[] = [];
  private tex = glowTexture();
  private sources: THREE.Vector3[] = [];
  private static readonly PER = 6;
  private static readonly MAX_SOURCES = 96;
  constructor(sources: THREE.Vector3[], private r: RngHolder) {
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.tex, color: 0xd9dde2, transparent: true, opacity: 0.55, depthWrite: false }), Smoke.PER * Smoke.MAX_SOURCES);
    this.mesh.frustumCulled = false;
    this.setSources(sources);
  }
  /** Swap the chimney list in place (no new texture/material/mesh): city chunks rebuild often. */
  setSources(sources: THREE.Vector3[]): void {
    this.sources = sources.slice(0, Smoke.MAX_SOURCES);
    const per = Smoke.PER;
    this.puffs = [];
    this.sources.forEach((_, si) => { for (let k = 0; k < per; k++) this.puffs.push({ src: si, age: (k / per) * 4.5, life: 4.5, dx: range(this.r, -0.3, 0.3), dz: range(this.r, -0.3, 0.3) }); });
    this.mesh.count = this.puffs.length;
  }
  update(dt: number, cam: THREE.Camera): void {
    this.puffs.forEach((p, k) => {
      p.age += dt;
      if (p.age > p.life) p.age -= p.life;
      const f = p.age / p.life;
      const s = this.sources[p.src];
      const size = 1.2 + f * 4.5;
      _m.compose(_v.set(s.x + p.dx * p.age * 3 + f * 3, s.y + p.age * 2.6, s.z + p.dz * p.age * 3), cam.quaternion, _s.setScalar(size * (1 - f * 0.6)));
      this.mesh.setMatrixAt(k, _m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); this.tex.dispose(); }
}

export class CoinBurst {
  readonly mesh: THREE.InstancedMesh;
  private parts: { p: THREE.Vector3; v: THREE.Vector3; age: number; spin: number }[] = [];
  private rng = makeRng(99);
  constructor(max = 90) {
    const g = new THREE.CylinderGeometry(0.42, 0.42, 0.09, 12);
    g.rotateX(Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.8, roughness: 0.25, emissive: 0x6a4a00 }), max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }
  emit(at: THREE.Vector3, n = 18, color?: number): void {
    if (color) (this.mesh.material as THREE.MeshStandardMaterial).color.setHex(color);
    for (let k = 0; k < n && this.parts.length < this.mesh.instanceMatrix.count; k++) {
      const a = next(this.rng) * Math.PI * 2, sp = range(this.rng, 3, 8);
      this.parts.push({ p: at.clone(), v: new THREE.Vector3(Math.cos(a) * sp, range(this.rng, 9, 15), Math.sin(a) * sp), age: 0, spin: range(this.rng, -12, 12) });
    }
  }
  update(dt: number): void {
    this.parts = this.parts.filter((p) => (p.age += dt) < 1.3);
    this.parts.forEach((p, k) => {
      p.v.y -= 30 * dt;
      p.p.addScaledVector(p.v, dt);
      const s = p.age > 1 ? (1.3 - p.age) / 0.3 : 1;
      _q.setFromAxisAngle(UP, p.age * p.spin);
      _m.compose(p.p, _q, _s.setScalar(Math.max(0.01, s)));
      this.mesh.setMatrixAt(k, _m);
    });
    this.mesh.count = this.parts.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}
