// GeoBuilder: collects primitive parts with vertex colours into material buckets, then merges
// each bucket into ONE mesh. A whole city's static geometry costs ~5 draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type Bucket = 'upper' | 'ground' | 'plain' | 'glass' | 'glow';
export const BUCKETS: Bucket[] = ['upper', 'ground', 'plain', 'glass', 'glow'];

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

function colorize(g: THREE.BufferGeometry, color: number | THREE.Color): THREE.BufferGeometry {
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  if (typeof color === 'number') _c.setHex(color); else _c.copy(color);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Gable prism along local X: ridge at height h above y=0 base of size w×d. Indexed, with uv. */
export function prismGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  const x = w / 2, z = d / 2;
  const v = [
    // slope +z
    -x, 0, z, x, 0, z, x, h, 0, -x, h, 0,
    // slope -z
    x, 0, -z, -x, 0, -z, -x, h, 0, x, h, 0,
    // gable +x
    x, 0, z, x, 0, -z, x, h, 0,
    // gable -x
    -x, 0, -z, -x, 0, z, -x, h, 0,
    // bottom
    -x, 0, -z, x, 0, -z, x, 0, z, -x, 0, z,
  ];
  const idx = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 14, 16, 17];
  const uv = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 1, 1, 0, 1];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export class GeoBuilder {
  readonly parts: Record<Bucket, THREE.BufferGeometry[]> = { upper: [], ground: [], plain: [], glass: [], glow: [] };
  private frame = new THREE.Matrix4();

  /** Local frame for subsequent parts: translate to (x, y, z) and rotate about Y. */
  setFrame(x: number, z: number, rotY = 0, y = 0): this {
    this.frame.makeRotationY(rotY).setPosition(x, y, z);
    return this;
  }
  resetFrame(): this { this.frame.identity(); return this; }

  add(bucket: Bucket, g: THREE.BufferGeometry, color: number | THREE.Color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): void {
    colorize(g, color);
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    g.applyMatrix4(_m);
    g.applyMatrix4(this.frame);
    this.parts[bucket].push(g);
  }

  /** Box resting on y (bottom at y). Optional facade UVs tile a window texture per bay/floor. */
  box(bucket: Bucket, w: number, h: number, d: number, x: number, y: number, z: number, color: number | THREE.Color,
    opt: { tile?: [number, number]; uOff?: number; vOff?: number; ry?: number; rx?: number; rz?: number; front?: boolean } = {}): void {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(0, h / 2, 0);
    if (opt.tile) {
      const [tw, th] = opt.tile;
      const uv = g.attributes.uv as THREE.BufferAttribute;
      // Face order: +x, -x, +y, -y, +z, -z (4 verts each).
      for (let f = 0; f < 6; f++) {
        const faceW = f < 2 ? d : w;
        for (let k = 0; k < 4; k++) {
          const i = f * 4 + k;
          if (f === 2 || f === 3 || (opt.front && f !== 4)) { uv.setXY(i, 0.01, 0.01); continue; }
          uv.setXY(i, uv.getX(i) * (faceW / tw) + (opt.uOff ?? 0), uv.getY(i) * (h / th) + (opt.vOff ?? 0));
        }
      }
    }
    this.add(bucket, g, color, x, y, z, opt.rx ?? 0, opt.ry ?? 0, opt.rz ?? 0);
  }

  cyl(bucket: Bucket, rTop: number, rBot: number, h: number, x: number, y: number, z: number, color: number | THREE.Color, segs = 8, rx = 0, rz = 0): void {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, segs);
    g.translate(0, h / 2, 0);
    this.add(bucket, g, color, x, y, z, rx, 0, rz);
  }

  /** Four-sided pyramid roof (hip/terracotta) covering w×d, height h, resting on y. */
  hip(bucket: Bucket, w: number, h: number, d: number, x: number, y: number, z: number, color: number | THREE.Color): void {
    const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1);
    g.rotateY(Math.PI / 4);
    g.translate(0, 0.5, 0);
    this.add(bucket, g, color, x, y, z, 0, 0, 0, w, h, d);
  }

  gable(bucket: Bucket, w: number, h: number, d: number, x: number, y: number, z: number, color: number | THREE.Color, ry = 0): void {
    this.add(bucket, prismGeometry(w, h, d), color, x, y, z, 0, ry, 0);
  }

  sphere(bucket: Bucket, r: number, x: number, y: number, z: number, color: number | THREE.Color, half = false, sy = 1): void {
    const g = new THREE.SphereGeometry(r, 10, half ? 5 : 8, 0, Math.PI * 2, 0, half ? Math.PI / 2 : Math.PI);
    this.add(bucket, g, color, x, y, z, 0, 0, 0, 1, sy, 1);
  }

  /** Merge each bucket's parts into one non-indexed geometry (parts are disposed). Used to cache a
   *  single lot's geometry so a chunk rebuild only concatenates arrays (see World.buildChunk). */
  mergeParts(): Partial<Record<Bucket, THREE.BufferGeometry>> {
    const out: Partial<Record<Bucket, THREE.BufferGeometry>> = {};
    for (const b of BUCKETS) {
      const list = this.parts[b];
      if (!list.length) continue;
      const merged = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)), false);
      for (const g of list) g.dispose();
      this.parts[b] = [];
      if (merged) out[b] = merged;
    }
    return out;
  }

  /** Merge every bucket into a single mesh per material. */
  build(materials: Partial<Record<Bucket, THREE.Material>>): THREE.Mesh[] {
    const merged = this.mergeParts();
    return meshesFrom(BUCKETS.map((b) => ({ [b]: merged[b] })), materials, true);
  }
}

/** One mesh per material from per-bucket geometry lists (non-indexed, same attributes).
 *  `owned` disposes the inputs; cached inputs are left untouched. */
export function meshesFrom(sets: Partial<Record<Bucket, THREE.BufferGeometry>>[], materials: Partial<Record<Bucket, THREE.Material>>, owned = false): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  for (const b of BUCKETS) {
    const mat = materials[b];
    const list = sets.map((x) => x[b]).filter((g): g is THREE.BufferGeometry => !!g);
    if (!list.length || !mat) continue;
    const merged = list.length === 1 && owned ? list[0] : mergeGeometries(list, false);
    if (owned && merged !== list[0]) for (const g of list) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere();
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = 'city-' + b;
    mesh.castShadow = b !== 'glow';
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    out.push(mesh);
  }
  return out;
}
