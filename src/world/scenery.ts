// Static scenery: ground, roads, blocks, parks, outskirts, water, sky, trees and streetlights.
import * as THREE from 'three';
import type { CityLayout } from '../core/city';
import { makeRng, next, range, type RngHolder } from '../core/rng';
import { GeoBuilder, type Bucket } from './geo';
import type { Theme, Vegetation } from './themes';
import { crossingTexture, cropTexture, glowTexture, groundTexture, roadTexture } from './textures';
import type { QualityPreset } from './quality';

export interface Env { night: number; dusk: number; sunDir: THREE.Vector3; time: number; }

const WATER_VS = /* glsl */ `
#include <fog_pars_vertex>
varying vec3 vWorld;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const WATER_FS = /* glsl */ `
uniform vec3 deep; uniform vec3 shallow; uniform vec3 skyCol; uniform vec3 sunCol; uniform vec3 sunDir;
uniform float time; uniform vec2 halfSize; uniform float night;
varying vec3 vWorld;
#include <fog_pars_fragment>
void main() {
  vec2 p = vWorld.xz * 0.045;
  float t = time;
  float dx = cos(p.x * 3.0 + t * 1.1) * 0.6 + cos((p.x + p.y) * 4.7 + t * 1.6) * 0.35 + cos(p.x * 9.0 - t * 2.3) * 0.12;
  float dz = cos(p.y * 2.3 - t * 0.9) * 0.5 + cos((p.x + p.y) * 4.7 + t * 1.6) * 0.35 + cos(p.y * 8.0 + t * 2.0) * 0.12;
  vec3 n = normalize(vec3(-dx * 0.12, 1.0, -dz * 0.12));
  vec3 v = normalize(cameraPosition - vWorld);
  vec2 q = abs(vWorld.xz) - halfSize;
  float shore = length(max(q, 0.0));
  vec3 col = mix(shallow, deep, smoothstep(4.0, 140.0, shore));
  float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col = mix(col, skyCol, fres * 0.55);
  float spec = pow(max(dot(reflect(-sunDir, n), v), 0.0), 140.0);
  col += sunCol * spec * (1.6 - night);
  float foam = (1.0 - smoothstep(0.0, 5.0, shore)) * (0.55 + 0.45 * sin(shore * 2.2 - t * 2.4));
  col = mix(col, vec3(1.0), clamp(foam, 0.0, 1.0) * 0.55);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const SKY_VS = /* glsl */ `
varying vec3 vDir;
void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
const SKY_FS = /* glsl */ `
uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunCol; uniform vec3 sunDir; uniform float night;
varying vec3 vDir;
float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
void main() {
  vec3 d = normalize(vDir);
  float h = max(d.y, 0.0);
  vec3 col = mix(horizon, zenith, pow(h, 0.5));
  float s = max(dot(d, sunDir), 0.0);
  col += sunCol * (pow(s, 900.0) * 4.0 + pow(s, 14.0) * 0.28) * (1.0 - night * 0.7);
  if (night > 0.01 && d.y > 0.02) {
    vec3 cell = floor(d * 380.0);
    float r = hash(cell);
    col += vec3(step(0.9982, r)) * night * smoothstep(0.02, 0.3, d.y) * (0.6 + 0.4 * hash(cell + 1.0));
  }
  if (d.y < 0.0) col = horizon * 0.92;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export interface SceneryHandles {
  group: THREE.Group;
  sky: THREE.Mesh;
  skyMat: THREE.ShaderMaterial;
  waterMats: THREE.ShaderMaterial[];
  lampPools: THREE.InstancedMesh | null;
  lampHeads: THREE.InstancedMesh | null;
  blades: { mesh: THREE.InstancedMesh; bases: THREE.Matrix4[] } | null;
  dispose(): void;
}

// ── Trees ─────────────────────────────────────────────────────────────────────
/** A palm frond: a tapered leaf strip that arcs up then droops, folded into a shallow V along its
 *  midrib, with a slightly lower underside layer so it reads (and casts shadows) from any angle.
 *  Replaces the flat planks that read as propellers (critic #6b). Local +z = outward. */
function frondGeometry(len: number, width: number, droop: number, segs = 4): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const ring = (t: number) => {
    const z = t * len;
    const y = 0.32 * len * t - droop * len * t * t;
    const w = width * Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)) * (1 - 0.45 * t) + 0.03;
    return { z, y, w, fold: w * 0.4 };
  };
  for (const under of [0, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const { z, y, w, fold } = ring(i / segs);
      const dy = under ? -0.05 : 0;
      pos.push(-w, y - fold + dy, z, 0, y + dy, z, w, y - fold + dy, z);
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 3, b = base + (i + 1) * 3;
      const quads = [[a, b, a + 1], [a + 1, b, b + 1], [a + 1, b + 1, a + 2], [a + 2, b + 1, b + 2]];
      for (const [p, q, r] of quads) under ? idx.push(p, r, q) : idx.push(p, q, r);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2)); // merge-compatible
  g.setIndex(idx);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

function treeGeometry(kind: Vegetation, snow: boolean): THREE.BufferGeometry {
  const gb = new GeoBuilder();
  const trunk = 0x6b4a35;
  switch (kind) {
    case 'cypress':
      gb.cyl('plain', 0.18, 0.22, 1.4, 0, 0, 0, trunk, 5);
      gb.add('plain', new THREE.ConeGeometry(1.0, 7.5, 7), 0x3f5e3a, 0, 1.0 + 3.75, 0);
      gb.sphere('plain', 1.0, 0, 1.6, 0, 0x3f5e3a);
      break;
    case 'palm': {
      let x = 0, y = 0;
      for (let i = 0; i < 6; i++) {
        gb.cyl('plain', 0.2 - i * 0.012, 0.26 - i * 0.012, 1.5, x, y, 0, i % 2 ? 0x8a6a4a : 0x7a5a3c, 6, 0, -0.06 * i);
        x += Math.sin(0.06 * i) * 1.5; y += 1.45;
      }
      const fronds = 9;
      for (let k = 0; k < fronds; k++) {
        const a = (k / fronds) * Math.PI * 2 + (k % 2) * 0.18;
        const len = 3.6 + (k % 3) * 0.45;
        gb.add('plain', frondGeometry(len, 0.62, 0.62 + (k % 2) * 0.18), k % 3 === 0 ? 0x3f8f4a : k % 3 === 1 ? 0x4fa055 : 0x5aa85c, x, y + 0.05, 0, 0, a, 0);
      }
      // Coconut cluster: low-poly (20 tris each) — palms are instanced by the hundred and cast shadows,
      // so every triangle here is paid for twice per palm per frame.
      for (let k = 0; k < 3; k++) gb.add('plain', new THREE.IcosahedronGeometry(0.26, 0), 0x5a3f2a, x + Math.cos(k * 2.1) * 0.32, y - 0.25, Math.sin(k * 2.1) * 0.32);
      break;
    }
    case 'cactus':
      gb.cyl('plain', 0.42, 0.48, 4.6, 0, 0, 0, 0x6f8f4e, 8);
      gb.sphere('plain', 0.42, 0, 4.6, 0, 0x6f8f4e);
      gb.cyl('plain', 0.24, 0.24, 1.2, 0.5, 1.8, 0, 0x6f8f4e, 6, 0, -Math.PI / 2);
      gb.cyl('plain', 0.26, 0.26, 1.6, 1.0, 1.8, 0, 0x7a9a55, 6);
      gb.sphere('plain', 0.26, 1.0, 3.4, 0, 0x7a9a55);
      gb.cyl('plain', 0.22, 0.22, 1.0, -0.4, 2.6, 0, 0x6f8f4e, 6, 0, Math.PI / 2);
      gb.cyl('plain', 0.24, 0.24, 1.2, -0.95, 2.6, 0, 0x6f8f4e, 6);
      gb.sphere('plain', 0.24, -0.95, 3.8, 0, 0x6f8f4e);
      break;
    case 'street':
      gb.cyl('plain', 0.12, 0.16, 2.4, 0, 0, 0, trunk, 5);
      gb.add('plain', new THREE.IcosahedronGeometry(1.5, 1), 0x2f5d4a, 0, 3.4, 0);
      gb.box('plain', 1.6, 0.6, 1.6, 0, 0, 0, 0x4a5162);
      break;
    case 'oak':
      gb.cyl('plain', 0.26, 0.36, 2.8, 0, 0, 0, trunk, 6);
      gb.add('plain', new THREE.IcosahedronGeometry(2.1, 1), 0x5f8a3a, 0, 4.3, 0);
      gb.add('plain', new THREE.IcosahedronGeometry(1.5, 1), 0x6f9a42, 1.2, 3.6, 0.4);
      gb.add('plain', new THREE.IcosahedronGeometry(1.4, 1), 0x56803a, -1.0, 3.8, -0.5);
      break;
    case 'pine':
      gb.cyl('plain', 0.2, 0.26, 1.6, 0, 0, 0, trunk, 5);
      [[2.3, 1.2], [1.8, 2.9], [1.2, 4.5]].forEach(([r, y]) => {
        gb.add('plain', new THREE.ConeGeometry(r, 2.8, 8), 0x2f4f3a, 0, y + 1.4, 0);
        if (snow) gb.add('plain', new THREE.ConeGeometry(r * 0.55, 1.0, 8), 0xf2f6f9, 0, y + 2.4, 0);
      });
      break;
  }
  const list = gb.parts.plain.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = new THREE.BufferGeometry();
  // Reuse GeoBuilder merge through a throwaway material map.
  const mesh = new GeoBuilder();
  mesh.parts.plain.push(...list);
  const built = mesh.build({ plain: new THREE.MeshBasicMaterial() })[0];
  merged.copy(built.geometry);
  built.geometry.dispose();
  return merged;
}

function placeTrees(layout: CityLayout, theme: Theme, q: QualityPreset, r: RngHolder, waterSide: (x: number, z: number) => boolean): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const dens = theme.treeDensity * q.props;
  for (const p of layout.parks) {
    const n = Math.round(12 * dens);
    for (let i = 0; i < n; i++) {
      const x = p.x + (next(r) - 0.5) * (p.w - 6), z = p.z + (next(r) - 0.5) * (p.d - 6);
      if (Math.abs(x - p.x) < 3 || Math.abs(z - p.z) < 3) continue;
      pts.push(new THREE.Vector3(x, 0.25, z));
    }
  }
  const { roadX, roadZ, road } = layout;
  for (let i = 0; i < roadX.length - 1; i++) for (let j = 0; j < roadZ.length - 1; j++) {
    const x0 = roadX[i] + road / 2 + 1.4, x1 = roadX[i + 1] - road / 2 - 1.4;
    const z0 = roadZ[j] + road / 2 + 1.4, z1 = roadZ[j + 1] - road / 2 - 1.4;
    for (const [ax, az, bx, bz] of [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1]]) {
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.floor((len / 13) * dens);
      for (let k = 1; k <= n; k++) {
        if (next(r) < 0.35) continue;
        const f = k / (n + 1);
        pts.push(new THREE.Vector3(ax + (bx - ax) * f, 0.25, az + (bz - az) * f));
      }
    }
  }
  const hw = layout.width / 2, hd = layout.depth / 2;
  const n = Math.round(160 * dens);
  for (let i = 0; i < n; i++) {
    const a = next(r) * Math.PI * 2;
    const rad = range(r, 12, 240);
    const x = Math.cos(a) * (hw + rad), z = Math.sin(a) * (hd + rad);
    if (waterSide(x, z)) continue;
    if (Math.abs(x) < hw + 6 && Math.abs(z) < hd + 6) continue;
    pts.push(new THREE.Vector3(x, 0, z));
  }
  return pts;
}

// ── Outskirts ─────────────────────────────────────────────────────────────────
function outskirts(gb: GeoBuilder, fgb: GeoBuilder, layout: CityLayout, theme: Theme, r: RngHolder, water: (x: number, z: number) => boolean, blades: THREE.Matrix4[]): void {
  const hw = layout.width / 2, hd = layout.depth / 2;
  const ring = (minD: number, maxD: number) => {
    for (let tries = 0; tries < 40; tries++) {
      const a = next(r) * Math.PI * 2;
      const d = range(r, minD, maxD);
      const x = Math.cos(a) * (hw + d), z = Math.sin(a) * (hd + d);
      if (!water(x, z)) return [x, z] as const;
    }
    return [hw + maxD, 0] as const;
  };
  switch (theme.outskirts) {
    case 'hills':
      for (let i = 0; i < 14; i++) {
        const [x, z] = ring(90, 420);
        const s = range(r, 60, 130);
        gb.add('plain', new THREE.IcosahedronGeometry(1, 1), i % 2 ? 0x8d9a62 : 0x7d8f5a, x, -s * 0.15, z, 0, next(r) * 3, 0, s, s * range(r, 0.28, 0.45), s * range(r, 0.7, 1));
        for (let k = 0; k < 4; k++) {
          const hx = x + (next(r) - 0.5) * s * 0.9, hz = z + (next(r) - 0.5) * s * 0.9;
          gb.box('plain', 4, 3.5, 4, hx, s * 0.12, hz, 0xf4efe6);
          gb.hip('plain', 4.8, 1.8, 4.8, hx, s * 0.12 + 3.5, hz, 0xc8553d);
        }
      }
      gb.cyl('plain', 2.2, 2.8, 22, -hw - 22, 0, hd + 26, 0xf4f1ea, 12);
      for (let k = 0; k < 4; k++) gb.cyl('plain', 2.25, 2.25, 1.6, -hw - 22, 4 + k * 5, hd + 26, 0xc8553d, 12);
      gb.cyl('glow', 1.6, 1.6, 2.2, -hw - 22, 22, hd + 26, 0xfff2c4, 10);
      gb.add('plain', new THREE.ConeGeometry(2.4, 2.4, 10), 0xc8553d, -hw - 22, 25.4, hd + 26);
      break;
    case 'mesas':
      for (let i = 0; i < 12; i++) {
        const [x, z] = ring(180, 620);
        const rad = range(r, 28, 80), h = range(r, 22, 62);
        gb.cyl('plain', rad * 0.82, rad, h * 0.6, x, -1, z, 0xb5562e, 7);
        gb.cyl('plain', rad * 0.7, rad * 0.82, h * 0.25, x, h * 0.6 - 1, z, 0xc8743f, 7);
        gb.cyl('plain', rad * 0.66, rad * 0.7, h * 0.15, x, h * 0.85 - 1, z, 0xd9925a, 7);
      }
      for (let i = 0; i < 40; i++) {
        const [x, z] = ring(10, 160);
        gb.add('plain', new THREE.DodecahedronGeometry(range(r, 1, 3.5)), 0xa86a44, x, 0.3, z, next(r), next(r), 0);
      }
      break;
    case 'skyline':
      // Far shore across the bay so the distant towers stand on land, not on water.
      gb.box('plain', 320, 1.2, 1800, -hw - 400, -0.4, 0, theme.groundAlt);
      gb.box('plain', 6, 1.6, 1800, -hw - 238, -0.4, 0, 0x596173);
      for (let i = 0; i < 48; i++) {
        const [x, z] = i < 20 ? [-hw - range(r, 240, 420), (next(r) - 0.5) * 700] : ring(120, 420);
        const w = range(r, 12, 30), h = range(r, 40, 170);
        gb.box('glass', w, h, w * range(r, 0.7, 1.2), x, 0, z, 0x3d5a7a, { tile: [12.8, 12.8], uOff: next(r) });
        if (next(r) < 0.4) gb.box('glow', 0.4, h * 0.4, 0.4, x + w / 2, h * 0.5, z, next(r) < 0.5 ? 0xff3e9a : 0x3df2ff);
      }
      break;
    case 'fields': {
      const crops = [0xe8c15a, 0x8fb35a, 0x9a7a4a, 0xf2d64b, 0x6f9a3a, 0xc9a96a];
      for (let i = 0; i < 70; i++) {
        const [x, z] = ring(14, 300);
        if (Math.abs(x) < hw + 8 && Math.abs(z) < hd + 8) continue;
        const w = range(r, 30, 70), d = range(r, 30, 70);
        fgb.box('plain', w, 0.18, d, x, 0.02, z, crops[Math.floor(next(r) * crops.length)], { tile: [6, 6], ry: next(r) < 0.5 ? 0 : Math.PI / 2 });
      }
      for (let i = 0; i < 7; i++) {
        const [x, z] = ring(40, 260);
        gb.box('plain', 10, 6, 14, x, 0, z, 0xa63a2b);
        gb.gable('plain', 10.8, 4.5, 15, x, 6, z, 0x4a3a32, Math.PI / 2);
        gb.cyl('plain', 2.6, 2.6, 12, x + 8, 0, z + 3, 0xd8dde2, 12);
        gb.sphere('plain', 2.6, x + 8, 12, z + 3, 0xb9c0c8, true);
      }
      for (let i = 0; i < 5; i++) {
        const [x, z] = ring(30, 220);
        gb.cyl('plain', 0.9, 1.6, 18, x, 0, z, 0xf1ede4, 8);
        blades.push(new THREE.Matrix4().makeTranslation(x, 18, z + 1.6));
      }
      break;
    }
    case 'islands':
      for (let i = 0; i < 9; i++) {
        const a = next(r) * Math.PI * 2, d = range(r, 140, 520);
        const x = Math.cos(a) * (hw + d), z = Math.abs(Math.sin(a)) * (hd + d) * (next(r) < 0.8 ? 1 : -1);
        if (!water(x, z)) continue;
        const rad = range(r, 14, 46);
        gb.cyl('plain', rad * 1.3, rad * 1.4, 0.8, x, -0.4, z, 0xf4e7c5, 12);
        gb.add('plain', new THREE.ConeGeometry(rad, range(r, 8, 26), 9), 0x3f8f4a, x, 0.4 + 6, z);
      }
      gb.add('plain', new THREE.ConeGeometry(190, 150, 12, 1, true), 0x5a6b4a, hw + 520, 74, hd + 520);
      gb.add('plain', new THREE.ConeGeometry(70, 26, 12), 0x6b5a4a, hw + 520, 150, hd + 520);
      for (let i = 0; i < 8; i++) {
        const x = (next(r) - 0.5) * 600, z = hd + range(r, 30, 220);
        if (!water(x, z)) continue;
        gb.box('plain', 2.2, 1.0, 6, x, 0.1, z, 0xffffff);
        gb.cyl('plain', 0.1, 0.1, 8, x, 1, z, 0xdddddd, 4);
        gb.add('plain', new THREE.ConeGeometry(2.4, 7, 3), next(r) < 0.5 ? 0xffffff : 0xff7f66, x, 5.5, z + 0.8, 0, 0, 0, 0.2, 1, 1);
      }
      break;
    case 'mountains':
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + next(r) * 0.3;
        const d = range(r, 340, 700);
        const x = Math.cos(a) * (hw + d), z = Math.sin(a) * (hd + d);
        const rad = range(r, 100, 210), h = range(r, 130, 280);
        gb.add('plain', new THREE.ConeGeometry(rad, h, 7), 0x6f7d8f, x, h / 2 - 2, z, 0, next(r), 0);
        gb.add('plain', new THREE.ConeGeometry(rad * 0.42, h * 0.42, 7), 0xf4f7fa, x, h - h * 0.21 - 1.5, z, 0, next(r), 0);
      }
      break;
  }
}

export function buildScenery(layout: CityLayout, theme: Theme, q: QualityPreset, mats: Partial<Record<Bucket, THREE.Material>>): SceneryHandles {
  const group = new THREE.Group();
  group.name = 'scenery';
  const r = makeRng(layout.cols * 7919 + layout.rows * 104729 + layout.block);
  const disposables: { dispose(): void }[] = [];
  const hw = layout.width / 2, hd = layout.depth / 2;
  const sides = theme.water ? layout.water : [];
  const water = (x: number, z: number) =>
    (sides.includes('s') && z > hd + 6) || (sides.includes('n') && z < -hd - 6) ||
    (sides.includes('e') && x > hw + 6) || (sides.includes('w') && x < -hw - 6);

  // Ground
  const gTex = groundTexture(theme);
  gTex.repeat.set(60, 60);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), new THREE.MeshStandardMaterial({ map: gTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);
  disposables.push(ground.geometry, ground.material as THREE.Material, gTex);

  // Blocks, parks, plazas (static GeoBuilder)
  const gb = new GeoBuilder();
  const { roadX, roadZ, road: W } = layout;
  for (let i = 0; i < roadX.length - 1; i++) for (let j = 0; j < roadZ.length - 1; j++) {
    const cx = (roadX[i] + roadX[i + 1]) / 2, cz = (roadZ[j] + roadZ[j + 1]) / 2;
    gb.box('plain', layout.block, 0.22, layout.block, cx, 0, cz, theme.sidewalk);
  }
  const parkGround = theme.id === 'redmesa' ? 0xe2bb88 : theme.id === 'neonvale' ? 0x4f7a5a : theme.id === 'ironhold' ? 0xf1f4f7 : theme.id === 'verano' ? 0x7fc46a : 0x8fb35a;
  for (const p of layout.parks) {
    gb.box('plain', p.w, 0.3, p.d, p.x, 0, p.z, parkGround);
    gb.box('plain', p.w, 0.34, 3.2, p.x, 0, p.z, theme.plaza);
    gb.box('plain', 3.2, 0.34, p.d, p.x, 0, p.z, theme.plaza);
    gb.cyl('plain', 4.2, 4.4, 0.9, p.x, 0.3, p.z, 0xd8d1c3, 16);
    gb.cyl('glow', 3.6, 3.6, 0.2, p.x, 1.0, p.z, theme.id === 'ironhold' ? 0xcfe8f5 : 0x7fd8e8, 16);
    gb.cyl('plain', 0.5, 0.7, 3.2, p.x, 0.3, p.z, 0xe8e1d3, 8);
    for (const [bx, bz] of [[5, 0], [-5, 0], [0, 5], [0, -5]]) gb.box('plain', bx ? 0.6 : 2.4, 0.5, bx ? 2.4 : 0.6, p.x + bx * 1.6, 0.3, p.z + bz * 1.6, 0x7a5a3c);
  }
  // Shore: beach (Verano) or quay (others) between the city and the water.
  for (const s of sides) {
    const col = theme.id === 'verano' ? 0xf4e7c5 : theme.plaza;
    if (s === 's' || s === 'n') gb.box('plain', layout.width + 40, 0.2, 12, 0, 0, (s === 's' ? 1 : -1) * (hd + 6), col);
    else gb.box('plain', 12, 0.2, layout.depth + 40, (s === 'e' ? 1 : -1) * (hw + 6), 0, 0, col);
  }
  const blades: THREE.Matrix4[] = [];
  const fgb = new GeoBuilder();
  outskirts(gb, fgb, layout, theme, r, water, blades);
  for (const m of gb.build(mats)) { m.castShadow = false; group.add(m); disposables.push(m.geometry); }
  if (fgb.parts.plain.length) {
    const crop = cropTexture(0xffffff, 0xb8b0a0);
    const fieldMat = new THREE.MeshStandardMaterial({ map: crop, vertexColors: true, roughness: 1 });
    for (const m of fgb.build({ plain: fieldMat })) { m.castShadow = false; group.add(m); disposables.push(m.geometry); }
    disposables.push(crop, fieldMat);
  }

  // Roads: straight segments + intersections, plus highways leaving the city on dry sides.
  const rt = roadTexture(theme.asphalt, theme.roadLine);
  const ct = crossingTexture(theme.asphalt);
  const segs: THREE.BufferGeometry[] = [];
  const xs: THREE.BufferGeometry[] = [];
  const seg = (x: number, z: number, len: number, alongZ: boolean) => {
    const g = new THREE.PlaneGeometry(W, len);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * (len / W));
    g.rotateX(-Math.PI / 2);
    if (!alongZ) g.rotateY(Math.PI / 2);
    g.translate(x, 0.05, z);
    segs.push(g);
  };
  for (let i = 0; i < roadX.length; i++) for (let j = 0; j < roadZ.length; j++) {
    const g = new THREE.PlaneGeometry(W, W);
    g.rotateX(-Math.PI / 2);
    g.translate(roadX[i], 0.06, roadZ[j]);
    xs.push(g);
    if (j < roadZ.length - 1) seg(roadX[i], (roadZ[j] + roadZ[j + 1]) / 2, roadZ[j + 1] - roadZ[j] - W, true);
    if (i < roadX.length - 1) seg((roadX[i] + roadX[i + 1]) / 2, roadZ[j], roadX[i + 1] - roadX[i] - W, false);
  }
  const midX = roadX[Math.floor(roadX.length / 2)], midZ = roadZ[Math.floor(roadZ.length / 2)];
  if (!sides.includes('n')) seg(midX, -hd - 260, 520 - W, true);
  if (!sides.includes('s')) seg(midX, hd + 260, 520 - W, true);
  if (!sides.includes('e')) seg(hw + 260, midZ, 520 - W, false);
  if (!sides.includes('w')) seg(-hw - 260, midZ, 520 - W, false);
  const mergedRoads = mergeAll(segs);
  const roads = new THREE.Mesh(mergedRoads, new THREE.MeshStandardMaterial({ map: rt, roughness: 0.92 }));
  const crossings = new THREE.Mesh(mergeAll(xs), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.92 }));
  for (const m of [roads, crossings]) { m.receiveShadow = true; group.add(m); disposables.push(m.geometry, m.material as THREE.Material); }
  disposables.push(rt, ct);

  // Water
  const waterMats: THREE.ShaderMaterial[] = [];
  if (theme.water && sides.length) {
    const mat = new THREE.ShaderMaterial({
      vertexShader: WATER_VS, fragmentShader: WATER_FS, fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        deep: { value: new THREE.Color(theme.water.deep) }, shallow: { value: new THREE.Color(theme.water.shallow) },
        skyCol: { value: new THREE.Color(theme.sky.day.horizon) }, sunCol: { value: new THREE.Color(theme.sunColor) },
        sunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2) }, time: { value: 0 }, night: { value: 0 },
        halfSize: { value: new THREE.Vector2(hw + 12, hd + 12) },
      }]),
    });
    waterMats.push(mat);
    for (const s of sides) {
      const g = new THREE.PlaneGeometry(3000, 1500, 1, 1);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      if (s === 's') m.position.set(0, 0.12, hd + 12 + 750);
      if (s === 'n') m.position.set(0, 0.12, -hd - 12 - 750);
      if (s === 'e') { m.rotation.y = Math.PI / 2; m.position.set(hw + 12 + 750, 0.12, 0); }
      if (s === 'w') { m.rotation.y = Math.PI / 2; m.position.set(-hw - 12 - 750, 0.12, 0); }
      group.add(m);
      disposables.push(g);
    }
    disposables.push(mat);
  }

  // Trees (instanced per kind)
  const pts = placeTrees(layout, theme, q, r, water);
  const kinds = theme.vegetation;
  const perKind = new Map<Vegetation, THREE.Vector3[]>();
  pts.forEach((p, i) => { const k = kinds[i % kinds.length]; perKind.set(k, [...(perKind.get(k) ?? []), p]); });
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  disposables.push(treeMat);
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), sc = new THREE.Vector3(), col = new THREE.Color();
  for (const [kind, list] of perKind) {
    const g = treeGeometry(kind, theme.snowRoofs);
    const inst = new THREE.InstancedMesh(g, treeMat, list.length);
    list.forEach((p, i) => {
      const s = range(r, 0.8, 1.35);
      qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), next(r) * Math.PI * 2);
      m4.compose(p, qq, sc.set(s, s * range(r, 0.9, 1.15), s));
      inst.setMatrixAt(i, m4);
      col.setHex(theme.treeColors[Math.floor(next(r) * theme.treeColors.length)]).lerp(new THREE.Color(1, 1, 1), 0.55);
      inst.setColorAt(i, col);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    group.add(inst);
    disposables.push(g);
  }

  // Streetlights at intersections: pole + glowing head + light pool on the ground.
  let lampPools: THREE.InstancedMesh | null = null;
  let lampHeads: THREE.InstancedMesh | null = null;
  const lamps: THREE.Vector3[] = [];
  for (let i = 0; i < roadX.length; i++) for (let j = 0; j < roadZ.length; j++) {
    if ((i + j) % 2) continue;
    lamps.push(new THREE.Vector3(roadX[i] + W / 2 + 0.9, 0, roadZ[j] + W / 2 + 0.9));
    lamps.push(new THREE.Vector3(roadX[i] - W / 2 - 0.9, 0, roadZ[j] - W / 2 - 0.9));
  }
  if (lamps.length) {
    const poleG = new THREE.CylinderGeometry(0.1, 0.14, 6.5, 6); poleG.translate(0, 3.25, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.6, metalness: 0.4 });
    const poles = new THREE.InstancedMesh(poleG, poleMat, lamps.length);
    const headG = new THREE.SphereGeometry(0.42, 8, 6);
    const headMat = new THREE.MeshBasicMaterial({ color: theme.lampColor });
    lampHeads = new THREE.InstancedMesh(headG, headMat, lamps.length);
    const poolG = new THREE.PlaneGeometry(14, 14); poolG.rotateX(-Math.PI / 2);
    const glow = glowTexture();
    const poolMat = new THREE.MeshBasicMaterial({ map: glow, color: theme.lampColor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    lampPools = new THREE.InstancedMesh(poolG, poolMat, lamps.length);
    lamps.forEach((p, i) => {
      m4.makeTranslation(p.x, 0, p.z); poles.setMatrixAt(i, m4);
      m4.makeTranslation(p.x, 6.6, p.z); lampHeads!.setMatrixAt(i, m4);
      m4.makeTranslation(p.x, 0.32, p.z); lampPools!.setMatrixAt(i, m4);
    });
    poles.castShadow = true;
    lampPools.renderOrder = 2;
    group.add(poles, lampHeads, lampPools);
    disposables.push(poleG, poleMat, headG, headMat, poolG, poolMat, glow);
  }

  // Windmill blades (Amberfield)
  let bladeHandle: SceneryHandles['blades'] = null;
  if (blades.length) {
    const bg = new GeoBuilder();
    for (let k = 0; k < 4; k++) bg.box('plain', 0.9, 9, 0.18, 0, 0, 0, 0xf6f3ea, { rz: (k * Math.PI) / 2 });
    const bm = bg.build({ plain: treeMat })[0];
    const inst = new THREE.InstancedMesh(bm.geometry, treeMat, blades.length);
    blades.forEach((b, i) => inst.setMatrixAt(i, b));
    group.add(inst);
    disposables.push(bm.geometry);
    bladeHandle = { mesh: inst, bases: blades };
  }

  // Sky dome
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false,
    uniforms: {
      zenith: { value: new THREE.Color(theme.sky.day.zenith) }, horizon: { value: new THREE.Color(theme.sky.day.horizon) },
      sunCol: { value: new THREE.Color(theme.sunColor) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, night: { value: 0 },
    },
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
  sky.scale.setScalar(1500);
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  group.add(sky);
  disposables.push(sky.geometry, skyMat);

  return {
    group, sky, skyMat, waterMats, lampPools, lampHeads, blades: bladeHandle,
    dispose: () => { for (const d of disposables) d.dispose(); },
  };
}

function mergeAll(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const gb = new GeoBuilder();
  for (const g of list) gb.parts.plain.push(g.index ? g.toNonIndexed() : g);
  const tmp = new THREE.MeshBasicMaterial();
  const mesh = gb.build({ plain: tmp })[0];
  tmp.dispose();
  return mesh.geometry;
}

