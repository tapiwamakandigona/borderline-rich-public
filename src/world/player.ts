// The player's avatar and vehicles, with walk cycle, collision and road-graph auto-travel.
import * as THREE from 'three';
import type { VehicleId } from '../core/types';
import { VEHICLE } from '../core/data/progression';

const mat = (color: number, extra: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...extra });

export interface Outfit { top: number; legs: number; cap: number | null; tie: number | null; }
export function outfitFor(rank: number): Outfit {
  if (rank >= 6) return { top: 0x1d2a44, legs: 0x1d2a44, cap: null, tie: 0xf2c14e };
  if (rank >= 3) return { top: 0x9cc3e6, legs: 0x3a3f46, cap: null, tie: null };
  return { top: 0xf4efe6, legs: 0x2f5b8a, cap: 0xf2c14e, tie: null };
}

export class Player {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  heading = 0;
  vehicle: VehicleId = 'foot';
  path: THREE.Vector3[] | null = null;
  private body = new THREE.Group();
  private legL: THREE.Mesh; private legR: THREE.Mesh; private armL: THREE.Mesh; private armR: THREE.Mesh;
  private torso: THREE.Mesh; private cap: THREE.Mesh; private tie: THREE.Mesh;
  private rides = new Map<VehicleId, THREE.Group>();
  private rotor: THREE.Mesh | null = null;
  private walkT = 0;
  private paint = 0xf2c14e;
  private disposables: { dispose(): void }[] = [];

  constructor() {
    const skin = mat(0xc68642);
    const m = (g: THREE.BufferGeometry, material: THREE.Material) => { const x = new THREE.Mesh(g, material); x.castShadow = true; this.disposables.push(g); return x; };
    this.torso = m(new THREE.BoxGeometry(0.82, 0.95, 0.46), mat(0xf4efe6)); this.torso.position.y = 1.55;
    const head = m(new THREE.SphereGeometry(0.33, 12, 10), skin); head.position.y = 2.32;
    this.cap = m(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 12), mat(0xf2c14e)); this.cap.position.y = 2.55;
    const brim = m(new THREE.BoxGeometry(0.5, 0.05, 0.35), this.cap.material as THREE.Material); brim.position.set(0, -0.08, 0.3); this.cap.add(brim);
    this.tie = m(new THREE.BoxGeometry(0.12, 0.55, 0.05), mat(0xf2c14e)); this.tie.position.set(0, 1.6, 0.25);
    const limb = (w: number, h: number, material: THREE.Material, x: number, y: number) => {
      const g = new THREE.BoxGeometry(w, h, w); g.translate(0, -h / 2, 0);
      const mesh = m(g, material); mesh.position.set(x, y, 0); return mesh;
    };
    const legMat = mat(0x2f5b8a);
    this.legL = limb(0.3, 1.0, legMat, -0.2, 1.08); this.legR = limb(0.3, 1.0, legMat, 0.2, 1.08);
    this.armL = limb(0.22, 0.85, this.torso.material as THREE.Material, -0.53, 1.98); this.armR = limb(0.22, 0.85, this.torso.material as THREE.Material, 0.53, 1.98);
    this.body.add(this.torso, head, this.cap, this.tie, this.legL, this.legR, this.armL, this.armR);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.32;
    this.group.add(this.body, shadow);
    this.disposables.push(shadow.geometry, shadow.material as THREE.Material, skin, legMat);
    this.setOutfit(0);
  }

  setOutfit(rank: number): void {
    const o = outfitFor(rank);
    (this.torso.material as THREE.MeshStandardMaterial).color.setHex(o.top);
    (this.legL.material as THREE.MeshStandardMaterial).color.setHex(o.legs);
    this.cap.visible = o.cap !== null;
    if (o.cap !== null) (this.cap.material as THREE.MeshStandardMaterial).color.setHex(o.cap);
    this.tie.visible = o.tie !== null;
  }

  setPaint(color: number | null): void {
    this.paint = color ?? 0xf2c14e;
    for (const g of this.rides.values()) g.traverse((o) => { if ((o as THREE.Mesh).userData.paint) ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).color.setHex(this.paint); });
  }

  private ride(id: VehicleId): THREE.Group {
    let g = this.rides.get(id);
    if (g) return g;
    g = new THREE.Group();
    const add = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number, paint = false, rx = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geo, mat(paint ? this.paint : color, { metalness: paint ? 0.5 : 0.1, roughness: paint ? 0.3 : 0.7 }));
      mesh.position.set(x, y, z); mesh.rotation.set(rx, 0, rz); mesh.castShadow = true; mesh.userData.paint = paint;
      g!.add(mesh); this.disposables.push(geo, mesh.material as THREE.Material);
      return mesh;
    };
    const wheel = (r: number) => new THREE.TorusGeometry(r, r * 0.25, 6, 14);
    switch (id) {
      case 'bicycle':
        add(wheel(0.5), 0x222222, 0, 0.55, 0.7, false, 0, 0).rotation.y = Math.PI / 2;
        add(wheel(0.5), 0x222222, 0, 0.55, -0.7, false, 0, 0).rotation.y = Math.PI / 2;
        add(new THREE.BoxGeometry(0.1, 0.1, 1.4), 0, 0, 0.95, 0, true);
        add(new THREE.BoxGeometry(0.1, 0.7, 0.1), 0, 0, 0.9, 0.6, true);
        break;
      case 'scooter':
        add(new THREE.BoxGeometry(0.7, 0.5, 1.8), 0, 0, 0.6, 0, true);
        add(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 12), 0x222222, 0, 0.32, 0.75, false, 0, Math.PI / 2);
        add(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 12), 0x222222, 0, 0.32, -0.75, false, 0, Math.PI / 2);
        add(new THREE.BoxGeometry(0.1, 1.0, 0.1), 0x333333, 0, 1.1, 0.8);
        break;
      case 'hatchback':
      case 'sports': {
        const low = id === 'sports';
        add(new THREE.BoxGeometry(2.1, low ? 0.7 : 1.0, low ? 4.6 : 4.0), 0, 0, low ? 0.55 : 0.7, 0, true);
        add(new THREE.BoxGeometry(1.8, low ? 0.6 : 0.85, low ? 2.0 : 2.4), 0x1d2731, 0, low ? 1.15 : 1.5, low ? -0.3 : -0.2);
        if (low) add(new THREE.BoxGeometry(2.1, 0.12, 0.6), 0x1d2731, 0, 1.15, -2.2);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 12), 0x161616, sx * 1.0, 0.4, sz * 1.4, false, 0, Math.PI / 2);
        for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.4, 0.2, 0.05), 0xfff3d0, sx * 0.6, low ? 0.7 : 0.9, low ? 2.31 : 2.01);
        break;
      }
      case 'helicopter':
        add(new THREE.SphereGeometry(1.4, 14, 10), 0, 0, 1.6, 0.2, true);
        add(new THREE.BoxGeometry(0.4, 0.4, 4.2), 0, 0, 1.8, -2.6, true);
        add(new THREE.BoxGeometry(0.1, 1.0, 0.6), 0x222222, 0, 2.2, -4.6);
        add(new THREE.BoxGeometry(0.15, 0.15, 3), 0x333333, -0.8, 0.2, 0.2);
        add(new THREE.BoxGeometry(0.15, 0.15, 3), 0x333333, 0.8, 0.2, 0.2);
        this.rotor = add(new THREE.BoxGeometry(7, 0.06, 0.35), 0x2a2a2a, 0, 3.2, 0.2);
        break;
    }
    g.visible = false;
    this.group.add(g);
    this.rides.set(id, g);
    return g;
  }

  setVehicle(id: VehicleId): void {
    this.vehicle = id;
    for (const [k, g] of this.rides) g.visible = k === id;
    if (id !== 'foot') this.ride(id).visible = true;
    const enclosed = id === 'hatchback' || id === 'sports' || id === 'helicopter';
    this.body.visible = !enclosed;
    this.body.position.y = id === 'bicycle' || id === 'scooter' ? 0.15 : 0;
  }

  get speed(): number { return VEHICLE[this.vehicle].speed; }
  get flying(): boolean { return !!VEHICLE[this.vehicle].flies; }

  /** dir: desired world-space move direction (length 0..1). resolve: collision resolver. */
  update(dt: number, dir: THREE.Vector2, resolve: (x: number, z: number, flying: boolean) => [number, number]): void {
    let want = dir.clone();
    if (this.path && this.path.length) {
      if (want.lengthSq() > 0.01) this.path = null;
      else {
        const t = this.path[0];
        const d = new THREE.Vector2(t.x - this.pos.x, t.z - this.pos.z);
        if (d.length() < 1.6) { this.path.shift(); if (!this.path.length) this.path = null; }
        want = d.lengthSq() > 0 ? d.normalize() : d;
      }
    }
    const target = new THREE.Vector3(want.x, 0, want.y).multiplyScalar(this.speed);
    const k = 1 - Math.exp(-dt * (this.vehicle === 'foot' ? 12 : 4));
    this.vel.lerp(target, k);
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    const [rx, rz] = resolve(nx, nz, this.flying);
    this.pos.x = rx; this.pos.z = rz;
    const alt = this.flying ? 26 : 0;
    this.pos.y += (alt - this.pos.y) * Math.min(1, dt * 2);
    const sp = Math.hypot(this.vel.x, this.vel.z);
    if (sp > 0.3) {
      const h = Math.atan2(this.vel.x, this.vel.z);
      let dh = h - this.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.heading += dh * Math.min(1, dt * 10);
    }
    this.walkT += dt * sp * (this.vehicle === 'foot' ? 1.4 : 0);
    const swing = this.vehicle === 'foot' ? Math.sin(this.walkT) * Math.min(1, sp / 4) * 0.7 : 0;
    this.legL.rotation.x = swing; this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8; this.armR.rotation.x = swing * 0.8;
    const seated = this.vehicle === 'bicycle' || this.vehicle === 'scooter';
    if (seated) { this.legL.rotation.x = this.legR.rotation.x = -1.1; }
    this.body.position.y = (seated ? 0.15 : 0) + (this.vehicle === 'foot' ? Math.abs(Math.sin(this.walkT)) * 0.06 * Math.min(1, sp / 4) : 0);
    if (this.rotor) this.rotor.rotation.y += dt * 30;
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.heading;
  }

  dispose(): void { for (const d of this.disposables) d.dispose(); }
}
