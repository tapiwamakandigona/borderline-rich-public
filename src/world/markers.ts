// In-world UI: for-sale coins, owner flags + outlines, cash-ready bundles, permit hourglasses and
// the selection beacon. Instanced, rebuilt only when ownership changes.
import * as THREE from 'three';
import type { LotState } from '../core/types';
import type { CityLayout } from '../core/city';
import { GeoBuilder } from './geo';
import { coinTexture } from './textures';
import type { LotVisual } from './buildings';

const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

export class Markers {
  readonly group = new THREE.Group();
  private coins: THREE.InstancedMesh;
  private poles: THREE.InstancedMesh;
  private cloths: THREE.InstancedMesh;
  private cash: THREE.InstancedMesh;
  private hourglass: THREE.InstancedMesh;
  private outline: THREE.Mesh | null = null;
  private outlineMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9 });
  private ring: THREE.Mesh;
  private arrow: THREE.Mesh;
  private coinTex = coinTexture();
  private coinPos: THREE.Vector3[] = [];
  private flagPos: THREE.Vector3[] = [];
  private cashPos: THREE.Vector3[] = [];
  private hourPos: THREE.Vector3[] = [];
  private selected: LotVisual | null = null;
  private selSize = new THREE.Vector2(10, 10);

  constructor(maxLots: number) {
    const cg = new THREE.CylinderGeometry(1.35, 1.35, 0.3, 28);
    cg.rotateX(Math.PI / 2);
    const gold = new THREE.MeshStandardMaterial({ color: 0xf2c14e, metalness: 0.85, roughness: 0.25, emissive: 0x4a3000 });
    const face = new THREE.MeshStandardMaterial({ map: this.coinTex, metalness: 0.6, roughness: 0.3, emissive: 0x3a2600 });
    this.coins = new THREE.InstancedMesh(cg, [gold, face, face], maxLots);
    const pg = new THREE.CylinderGeometry(0.07, 0.07, 3.4, 5); pg.translate(0, 1.7, 0);
    this.poles = new THREE.InstancedMesh(pg, new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.6, roughness: 0.3 }), maxLots);
    const fg = new THREE.BoxGeometry(2.0, 1.2, 0.06); fg.translate(1.0, 2.75, 0);
    this.cloths = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }), maxLots);
    const bills = new GeoBuilder();
    for (let k = 0; k < 3; k++) {
      bills.box('plain', 1.5, 0.22, 0.8, 0, k * 0.24, 0, 0x3ddc97, { ry: k * 0.25 });
      bills.box('plain', 0.3, 0.24, 0.82, 0, k * 0.24, 0, 0xf4efe6, { ry: k * 0.25 });
    }
    const tmp = new THREE.MeshBasicMaterial();
    const billGeo = bills.build({ plain: tmp })[0].geometry;
    tmp.dispose();
    this.cash = new THREE.InstancedMesh(billGeo, new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x0c3a22, roughness: 0.5 }), maxLots);
    const hg = new GeoBuilder();
    hg.add('plain', new THREE.ConeGeometry(0.6, 0.9, 10), 0xffb347, 0, 0.45, 0, Math.PI, 0, 0);
    hg.add('plain', new THREE.ConeGeometry(0.6, 0.9, 10), 0xffb347, 0, 1.35, 0);
    const hm = new THREE.MeshBasicMaterial();
    const hourGeo = hg.build({ plain: hm })[0].geometry;
    hm.dispose();
    this.hourglass = new THREE.InstancedMesh(hourGeo, new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x5a3000 }), maxLots);
    for (const m of [this.coins, this.poles, this.cloths, this.cash, this.hourglass]) { m.count = 0; m.frustumCulled = false; }
    this.poles.castShadow = this.cloths.castShadow = true;
    const rg = new THREE.RingGeometry(0.93, 1, 64); rg.rotateX(-Math.PI / 2);
    this.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    const ag = new THREE.ConeGeometry(1.0, 2.2, 4); ag.rotateX(Math.PI);
    this.arrow = new THREE.Mesh(ag, new THREE.MeshStandardMaterial({ color: 0xf2c14e, emissive: 0x7a5200, metalness: 0.4, roughness: 0.3 }));
    this.ring.visible = this.arrow.visible = false;
    this.group.add(this.coins, this.poles, this.cloths, this.cash, this.hourglass, this.ring, this.arrow);
  }

  /** Rebuild ownership markers. ownerColor returns null for owners without a flag (npc/vacant/civic). */
  rebuild(layout: CityLayout, lots: Record<string, LotState> | null, visuals: Map<string, LotVisual>, ownerColor: (owner: string) => number | null): void {
    this.coinPos = []; this.flagPos = [];
    const gb = new GeoBuilder();
    const col = new THREE.Color();
    let f = 0;
    for (const def of layout.lots) {
      const ls = lots?.[def.id];
      const vis = visuals.get(def.id)!;
      if (!ls || def.civic) continue;
      if (ls.owner === 'vacant') { this.coinPos.push(new THREE.Vector3(def.x, 4.2, def.z)); continue; }
      const c = ownerColor(ls.owner);
      if (c === null) continue;
      this.flagPos.push(new THREE.Vector3(def.x + def.w * 0.18, vis.top, def.z - def.d * 0.18));
      this.cloths.setColorAt(f++, col.setHex(c));
      const t = 0.35, y = 0.2;
      gb.box('glow', def.w - 0.6, 0.08, t, def.x, y, def.z - def.d / 2 + 0.3, c);
      gb.box('glow', def.w - 0.6, 0.08, t, def.x, y, def.z + def.d / 2 - 0.3, c);
      gb.box('glow', t, 0.08, def.d - 0.6, def.x - def.w / 2 + 0.3, y, def.z, c);
      gb.box('glow', t, 0.08, def.d - 0.6, def.x + def.w / 2 - 0.3, y, def.z, c);
    }
    if (this.outline) { this.group.remove(this.outline); this.outline.geometry.dispose(); }
    const meshes = gb.build({ glow: this.outlineMat });
    this.outline = meshes[0] ?? null;
    if (this.outline) { this.outline.castShadow = false; this.group.add(this.outline); }
    this.coins.count = this.coinPos.length;
    this.poles.count = this.cloths.count = this.flagPos.length;
    if (this.cloths.instanceColor) this.cloths.instanceColor.needsUpdate = true;
  }

  /** Cash-ready and permit icons for player lots (cheap; called a few times per second). */
  setStatus(cash: THREE.Vector3[], permits: THREE.Vector3[]): void {
    this.cashPos = cash; this.hourPos = permits;
    this.cash.count = cash.length; this.hourglass.count = permits.length;
  }

  select(v: LotVisual | null, w = 10, d = 10): void {
    this.selected = v;
    this.selSize.set(w, d);
    this.ring.visible = this.arrow.visible = !!v;
  }

  update(time: number): void {
    this.coinPos.forEach((p, k) => {
      _q.setFromAxisAngle(UP, time * 1.8 + k);
      _m.compose(_v.set(p.x, p.y + Math.sin(time * 2.2 + k) * 0.45, p.z), _q, _s.set(1, 1, 1));
      this.coins.setMatrixAt(k, _m);
    });
    this.flagPos.forEach((p, k) => {
      _m.makeTranslation(p.x, p.y, p.z);
      this.poles.setMatrixAt(k, _m);
      _m2.makeRotationY(Math.sin(time * 2.6 + k * 1.7) * 0.35 + 0.4);
      this.cloths.setMatrixAt(k, _m.multiply(_m2));
    });
    this.cashPos.forEach((p, k) => {
      _q.setFromAxisAngle(UP, time * 1.2 + k);
      _m.compose(_v.set(p.x, p.y + 2.2 + Math.sin(time * 3 + k) * 0.35, p.z), _q, _s.setScalar(1.15));
      this.cash.setMatrixAt(k, _m);
    });
    this.hourPos.forEach((p, k) => {
      _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.floor(time / 1.5) % 2 ? Math.PI : 0);
      _m.compose(_v.set(p.x, p.y + 2.4, p.z), _q, _s.setScalar(1.2));
      this.hourglass.setMatrixAt(k, _m);
    });
    for (const m of [this.coins, this.poles, this.cloths, this.cash, this.hourglass]) m.instanceMatrix.needsUpdate = true;
    if (this.selected) {
      const p = this.selected.center;
      const pulse = 1 + Math.sin(time * 4) * 0.04;
      this.ring.position.set(p.x, 0.3, p.z);
      this.ring.scale.set((this.selSize.x / 2 + 1.2) * pulse, 1, (this.selSize.y / 2 + 1.2) * pulse);
      this.arrow.position.set(p.x, this.selected.top + 4.5 + Math.sin(time * 3) * 0.6, p.z);
      this.arrow.rotation.y = time * 1.5;
    }
  }

  dispose(): void {
    for (const m of [this.coins, this.poles, this.cloths, this.cash, this.hourglass]) {
      m.geometry.dispose();
      (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
    }
    this.outline?.geometry.dispose();
    this.outlineMat.dispose(); this.coinTex.dispose();
    this.ring.geometry.dispose(); (this.ring.material as THREE.Material).dispose();
    this.arrow.geometry.dispose(); (this.arrow.material as THREE.Material).dispose();
  }
}
