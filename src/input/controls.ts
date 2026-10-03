// Mobile controls on the 3D canvas (Pointer Events, so touch, pen and mouse share one path):
//   left half  → floating joystick (appears where the thumb lands)
//   right half → drag to orbit the camera
//   two fingers anywhere outside the joystick → pinch to zoom
//   quick tap anywhere → pick a building
// Desktop extras: WASD/arrow keys move, mouse wheel zooms.
import * as THREE from 'three';

export interface ControlHandlers {
  onTap(x: number, y: number): void;
  onOrbit(dx: number, dy: number): void;
  onZoom(factor: number): void;
  onFirstGesture(): void;
}

interface Ptr { id: number; x: number; y: number; sx: number; sy: number; t: number; moved: boolean; joy: boolean }

const TAP_MS = 260;
const TAP_SLOP = 12;
const JOY_R = 56;
const DEAD = 0.12;

export class Controls {
  /** camera-relative move intent: x = right, y = forward, length 0..1 */
  readonly move = new THREE.Vector2();
  enabled = true;
  private ptrs = new Map<number, Ptr>();
  private pinch = 0;
  private keys = new Set<string>();
  private joyVec = new THREE.Vector2();
  private base: HTMLDivElement;
  private knob: HTMLDivElement;
  private gestured = false;

  constructor(private el: HTMLElement, layer: HTMLElement, private h: ControlHandlers) {
    el.style.touchAction = 'none';
    this.base = document.createElement('div');
    this.base.className = 'joy-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joy-knob';
    this.base.appendChild(this.knob);
    layer.appendChild(this.base);
    el.addEventListener('pointerdown', this.down);
    el.addEventListener('pointermove', this.moveEv);
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.up);
    el.addEventListener('wheel', this.wheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', this.key);
    addEventListener('keyup', this.key);
    addEventListener('blur', () => { this.keys.clear(); this.reset(); });
  }

  private hasJoy(): boolean { for (const p of this.ptrs.values()) if (p.joy) return true; return false; }

  private down = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (!this.gestured) { this.gestured = true; this.h.onFirstGesture(); }
    const rect = this.el.getBoundingClientRect();
    const leftHalf = e.clientX - rect.left < rect.width * 0.5;
    // Gesture timing uses the events' own timestamps, so a slow frame (busy main thread) can't
    // turn a quick tap into a "long press" (seen on CI and on janky low-end phones).
    const p: Ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: e.timeStamp, moved: false, joy: leftHalf && !this.hasJoy() && e.button !== 2 };
    this.ptrs.set(e.pointerId, p);
    try { this.el.setPointerCapture(e.pointerId); } catch { /* synthetic pointers may not capture */ }
    const free = [...this.ptrs.values()].filter((q) => !q.joy);
    if (free.length === 2) this.pinch = Math.hypot(free[0].x - free[1].x, free[0].y - free[1].y);
  };

  private moveEv = (e: PointerEvent): void => {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (!p.moved && Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_SLOP) p.moved = true;
    if (p.joy) {
      if (!p.moved && e.timeStamp - p.t < 120) return;
      const v = new THREE.Vector2(p.x - p.sx, p.y - p.sy);
      const len = v.length();
      if (len > JOY_R) v.multiplyScalar(JOY_R / len);
      this.showJoy(p.sx, p.sy, v.x, v.y);
      const m = Math.min(1, len / JOY_R);
      this.joyVec.set(v.x, -v.y).normalize().multiplyScalar(m < DEAD ? 0 : (m - DEAD) / (1 - DEAD));
      return;
    }
    const free = [...this.ptrs.values()].filter((q) => !q.joy);
    if (free.length >= 2) {
      const d = Math.hypot(free[0].x - free[1].x, free[0].y - free[1].y);
      if (this.pinch > 0 && d > 0) this.h.onZoom(this.pinch / d);
      this.pinch = d;
      return;
    }
    if (p.moved) this.h.onOrbit(dx, dy);
  };

  private up = (e: PointerEvent): void => {
    const p = this.ptrs.get(e.pointerId);
    if (!p) return;
    this.ptrs.delete(e.pointerId);
    if (p.joy) { this.joyVec.set(0, 0); this.base.classList.remove('on'); }
    const quick = e.timeStamp - p.t < TAP_MS && !p.moved;
    if (quick && e.type === 'pointerup' && this.ptrs.size === 0) this.h.onTap(e.clientX, e.clientY);
    if ([...this.ptrs.values()].filter((q) => !q.joy).length < 2) this.pinch = 0;
  };

  private wheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.h.onZoom(1 + Math.max(-0.3, Math.min(0.3, e.deltaY * 0.0015)));
  };

  private key = (e: KeyboardEvent): void => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const k = e.key.toLowerCase();
    if (!['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) return;
    if (e.type === 'keydown') this.keys.add(k); else this.keys.delete(k);
  };

  private showJoy(x: number, y: number, kx: number, ky: number): void {
    const rect = this.el.getBoundingClientRect();
    this.base.classList.add('on');
    this.base.style.transform = `translate(${x - rect.left - JOY_R}px, ${y - rect.top - JOY_R}px)`;
    this.knob.style.transform = `translate(${kx}px, ${ky}px)`;
  }

  reset(): void {
    this.ptrs.clear();
    this.joyVec.set(0, 0);
    this.pinch = 0;
    this.base.classList.remove('on');
  }

  /** Call once per frame; merges joystick and keyboard into `move`. */
  update(): THREE.Vector2 {
    const k = this.keys;
    const kx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    const ky = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    this.move.copy(this.joyVec);
    if (kx || ky) this.move.set(kx, ky).normalize();
    if (!this.enabled) this.move.set(0, 0);
    return this.move;
  }

  dispose(): void {
    this.el.removeEventListener('pointerdown', this.down);
    this.el.removeEventListener('pointermove', this.moveEv);
    this.el.removeEventListener('pointerup', this.up);
    this.el.removeEventListener('pointercancel', this.up);
    this.el.removeEventListener('wheel', this.wheel);
    removeEventListener('keydown', this.key);
    removeEventListener('keyup', this.key);
    this.base.remove();
  }
}
