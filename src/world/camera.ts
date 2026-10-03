// Third-person camera that leads the player, with drag-orbit, pinch-zoom, a showcase orbit for
// the region picker and trauma-based shake (camera only, never the UI).
import * as THREE from 'three';

/** Default follow framing (critic #6c): high enough that the roof in front of the camera doesn't
 *  fill the screen, with the look point led ahead so the player sits in the lower-middle of a
 *  portrait screen and you see the street ahead. */
export const FOLLOW = { dist: 66, polar: 0.76, lead: 7 };

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: 'follow' | 'showcase' = 'showcase';
  azimuth = Math.PI * 0.25;
  polar = 0.95;
  dist = 42;
  private target = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  private trauma = 0;
  private center = new THREE.Vector3();
  private radius = 200;
  private t = 0;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(44, aspect, 0.5, 3000);
  }

  orbit(dx: number, dy: number): void {
    this.azimuth -= dx * 0.006;
    this.polar = Math.min(1.32, Math.max(0.42, this.polar + dy * 0.004));
  }
  zoom(factor: number): void { this.dist = Math.min(150, Math.max(12, this.dist * factor)); }
  shake(amount: number): void { this.trauma = Math.min(1, this.trauma + amount); }

  showcase(center: THREE.Vector3, radius: number): void {
    this.mode = 'showcase';
    this.center.copy(center);
    this.radius = radius;
  }
  follow(at: THREE.Vector3): void {
    this.mode = 'follow';
    this.target.copy(at);
    this.lookAt.copy(at);
    this.resetView();
  }
  /** Default follow framing (distance + tilt). */
  resetView(): void { this.dist = FOLLOW.dist; this.polar = FOLLOW.polar; }
  /** Jump straight to the follow target (no easing), e.g. after a teleport. */
  snap(at: THREE.Vector3): void { this.target.copy(at); this.lookAt.copy(at); }
  /** Smoothly move the follow target to a point of interest (e.g. an event's building). */
  peek(at: THREE.Vector3): void { this.lookAt.lerp(at, 0.5); }

  /** Horizontal unit vectors for camera-relative movement. */
  basis(): { fwd: THREE.Vector2; right: THREE.Vector2 } {
    const fwd = new THREE.Vector2(-Math.sin(this.azimuth), -Math.cos(this.azimuth));
    return { fwd, right: new THREE.Vector2(-fwd.y, fwd.x) };
  }

  update(dt: number, player: THREE.Vector3 | null, vel: THREE.Vector3 | null): void {
    this.t += dt;
    const c = this.camera;
    if (this.mode === 'showcase' || !player) {
      this.azimuth += dt * 0.07;
      const r = this.radius;
      const y = r * 0.62 + Math.sin(this.t * 0.25) * 6;
      c.position.set(this.center.x + Math.sin(this.azimuth) * r, y, this.center.z + Math.cos(this.azimuth) * r);
      c.lookAt(this.center.x, 6, this.center.z);
    } else {
      const velLead = vel ? new THREE.Vector3(vel.x, 0, vel.z).multiplyScalar(0.35) : new THREE.Vector3();
      const want = player.clone().add(velLead);
      this.target.lerp(want, 1 - Math.exp(-dt * 5));
      this.lookAt.lerp(this.target, 1 - Math.exp(-dt * 8));
      const sp = Math.sin(this.polar), cp = Math.cos(this.polar);
      const lead = FOLLOW.lead * (this.dist / FOLLOW.dist);
      const lx = this.lookAt.x - Math.sin(this.azimuth) * lead, lz = this.lookAt.z - Math.cos(this.azimuth) * lead;
      c.position.set(
        lx + Math.sin(this.azimuth) * sp * this.dist,
        this.lookAt.y + cp * this.dist + 1.5,
        lz + Math.cos(this.azimuth) * sp * this.dist,
      );
      c.lookAt(lx, this.lookAt.y + 1.5, lz);
    }
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma * 0.8;
      c.position.x += (Math.sin(this.t * 61) + Math.sin(this.t * 37)) * s;
      c.position.y += Math.sin(this.t * 53) * s;
      this.trauma = Math.max(0, this.trauma - dt * 2.8);
    }
  }
}
