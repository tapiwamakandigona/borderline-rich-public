// Session: the one object that owns the game state, the 3D world, input, audio, the store and
// persistence. UI components read its signals and call its methods; only core/actions mutate state.
import { signal } from '@preact/signals';
import * as THREE from 'three';
import { World } from '../world/World';
import { Controls } from '../input/controls';
import { Sfx, type SfxName } from '../audio/sfx';
import { JUICE, setReducedMotion } from '../ui/juice';
import type { ActionResult, GameState, RegionId } from '../core/types';
import { newGame } from '../core/state';
import { step } from '../core/sim';
import { DT } from '../core/constants';
import { serialize, deserialize } from '../core/save';
import { applyOffline, type OfflineReport } from '../core/offline';
import { hustleTap, collect } from '../core/actions';
import { rivalDef } from '../core/rivals';
import { PAINTS } from '../core/data/progression';
import { money } from '../core/format';
import { SandboxStore, type KeyValue, type Store } from '../iap/store';
import { fulfill, restoreEntitlements } from '../iap/fulfill';
import type { Product } from '../iap/catalog';
import type { QualityName } from '../world/quality';

export const SAVE_KEY = 'br.save.v1';
const SETTINGS_KEY = 'br.settings.v1';

export type SheetId = 'empire' | 'trade' | 'politics' | 'rivals' | 'store' | 'settings';
export type Screen = 'select' | 'game';
export interface Toast { id: number; text: string; kind: string }
export interface Pop { id: number; x: number; y: number; text: string; kind: 'cash' | 'gold' | 'bad' }
export interface Settings { quality: QualityName; sound: boolean; reducedMotion: boolean }

const localKV: KeyValue = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

function defaultQuality(): QualityName {
  const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  return mem <= 2 || cores <= 4 ? 'medium' : 'high';
}

function loadSettings(): Settings {
  const d: Settings = { quality: defaultQuality(), sound: true, reducedMotion: matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false };
  try { return { ...d, ...(JSON.parse(localKV.get(SETTINGS_KEY) ?? '{}') as Partial<Settings>) }; } catch { return d; }
}

export class Session {
  state: GameState | null = null;
  readonly world: World;
  readonly controls: Controls;
  readonly sfx = new Sfx();
  readonly store: Store;
  readonly settings = signal<Settings>(loadSettings());
  readonly screen = signal<Screen>('select');
  readonly tick = signal(0);
  readonly selected = signal<string | null>(null);
  readonly sheet = signal<SheetId | null>(null);
  readonly sheetTab = signal<string | null>(null);
  readonly toasts = signal<Toast[]>([]);
  readonly pops = signal<Pop[]>([]);
  readonly welcome = signal<OfflineReport | null>(null);
  readonly rankUp = signal<string | null>(null);
  readonly preview = signal<RegionId>('solenne');
  readonly pendingPurchase = signal<{ product: Product; resolve: (ok: boolean) => void } | null>(null);
  readonly traveling = signal(false);
  readonly hasSave: boolean;

  private last = performance.now();
  private acc = 0;
  private uiAcc = 0;
  private syncAcc = 0;
  private saveAcc = 0;
  private collectAcc = 0;
  private lastNotice = 0;
  private lastRivalToast = -1e9;
  /** Toasts that arrived while a modal was open; shown (newest two) once it closes. */
  private held: Toast[] = [];
  private pendingRank: string | null = null;
  private nextId = 1;
  private hiddenAt = 0;
  private lastVehicle = '';
  private lastPaint: string | null | undefined = undefined;
  private lastRank = -1;
  private eventSeen: string | null = null;
  private showT = 55;
  private raf = 0;

  /** @param joyLayer element that hosts the floating joystick (never the Preact root). */
  constructor(readonly canvas: HTMLCanvasElement, joyLayer: HTMLElement) {
    const st = this.settings.value;
    setReducedMotion(st.reducedMotion);
    this.sfx.enabled = st.sound;
    this.world = new World(canvas, st.quality);
    this.controls = new Controls(canvas, joyLayer, {
      onTap: (x, y) => this.tap(x, y),
      onOrbit: (dx, dy) => this.world.rig.orbit(dx, dy),
      onZoom: (f) => this.world.rig.zoom(f),
      onFirstGesture: () => this.sfx.unlock(),
    });
    this.store = new SandboxStore((p) => this.askConfirm(p), localKV);
    const resize = () => this.world.resize(canvas.clientWidth || innerWidth, canvas.clientHeight || innerHeight);
    addEventListener('resize', resize);
    resize();
    const saved = deserialize(localKV.get(SAVE_KEY));
    this.hasSave = !!saved;
    if (saved) {
      this.state = saved;
      this.lastNotice = saved.nextNoticeId - 1;
      this.applyAway(saved.lastSeenWall ? Date.now() / 1000 - saved.lastSeenWall : 0);
      this.enterRegion();
      this.screen.value = 'game';
    } else {
      this.previewRegion('solenne');
    }
    document.addEventListener('visibilitychange', this.onVisibility);
    addEventListener('pagehide', () => this.save());
    addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.back()) e.preventDefault(); });
    addEventListener('pointerdown', () => this.sfx.unlock(), { capture: true });
    this.raf = requestAnimationFrame(this.frame);
  }

  // ── Screens ────────────────────────────────────────────────────────────────
  previewRegion(id: RegionId): void {
    this.preview.value = id;
    this.world.setRegion(id, null, 'showcase');
  }

  start(home: RegionId): void {
    this.state = newGame(home, (Math.random() * 2 ** 31) | 0);
    this.lastNotice = 0;
    this.lastRank = this.state.stats.rankIndex;
    this.enterRegion();
    this.screen.value = 'game';
    this.sfx.play('buy');
    this.save();
  }

  /** Abandon the current save and go back to the region picker. */
  newGame(): void {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    this.state = null;
    this.selected.value = null;
    this.sheet.value = null;
    this.screen.value = 'select';
    this.previewRegion(this.preview.value);
  }

  private enterRegion(): void {
    const s = this.state!;
    this.world.setRegion(s.currentRegion, s.regions[s.currentRegion].lots, 'play');
    this.lastVehicle = '';
    this.lastPaint = undefined;
    this.lastRank = -1;
    this.selected.value = null;
    this.world.select(null);
    this.syncWorld();
  }

  // ── Frame loop ─────────────────────────────────────────────────────────────
  private frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.25, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const s = this.state;
    const playing = !!s && this.screen.value === 'game';
    if (playing) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= DT && n < 40) { step(s); this.acc -= DT; n++; }
      if (n >= 40) this.acc = 0;
      this.afterSim(dt);
    } else this.showT += dt * 0.6;
    const move = this.controls.update();
    this.world.frame(dt, playing ? s!.t : this.showT, move);
    if (playing && move.lengthSq() > 0.01 && this.world.player.path) this.world.player.path = null;
    this.uiAcc += dt;
    if (this.uiAcc >= 0.1) { this.uiAcc = 0; this.tick.value++; }
  };

  private afterSim(dt: number): void {
    const s = this.state!;
    if (s.currentRegion !== this.world.region) this.enterRegion();
    // Notices → toasts (+ rank-up celebration). Market news (NPC churn, routine rival grabs) is
    // feed-only; rival moves toast at most once per 30 s. Everything stays in Rivals → News.
    for (const n of s.notices) {
      if (n.id <= this.lastNotice) continue;
      this.lastNotice = n.id;
      if (n.text.startsWith('RANK UP')) { this.pendingRank = n.text.replace(/^RANK UP — /, ''); continue; }
      if (n.kind === 'market') continue;
      if (n.kind === 'rival') {
        const now = performance.now();
        if (now - this.lastRivalToast < 30_000) continue;
        this.lastRivalToast = now;
      }
      this.toast(n.text, n.kind);
      if (n.kind === 'bad') { this.sfx.play('bad'); this.shake(JUICE.shake.bad); }
    }
    // The rank-up celebration waits until nothing covers the screen (no card, sheet or modal).
    if (this.pendingRank && !this.uiBusy()) {
      this.rankUp.value = this.pendingRank;
      this.pendingRank = null;
      this.sfx.play('rankup');
      this.shake(JUICE.shake.rankUp);
      this.burst(this.world.player.pos.clone().setY(2), 24);
      setTimeout(() => { this.rankUp.value = null; }, 2600);
    }
    if (this.held.length && !this.modalOpen()) {
      const h = this.held.slice(-2);
      this.held = [];
      for (const t of h) this.toast(t.text, t.kind);
    }
    const evKey = s.pendingEvent ? `${s.pendingEvent.defId}@${s.pendingEvent.at}` : null;
    if (evKey && evKey !== this.eventSeen) { this.sfx.play('event'); this.selected.value = null; this.world.select(null); }
    this.eventSeen = evKey;
    // Player look follows progress
    if (s.vehicle !== this.lastVehicle) { this.world.player.setVehicle(s.vehicle); this.lastVehicle = s.vehicle; }
    if (s.paint !== this.lastPaint) {
      const p = PAINTS.find((x) => x.id === s.paint);
      this.world.player.setPaint(p ? parseInt(p.color.slice(1), 16) : null);
      this.lastPaint = s.paint;
    }
    if (s.stats.rankIndex !== this.lastRank) { this.world.player.setOutfit(s.stats.rankIndex); this.lastRank = s.stats.rankIndex; }
    // Walk past your own business to collect its till
    this.collectAcc += dt;
    if (this.collectAcc >= 0.2) { this.collectAcc = 0; this.autoCollect(); }
    this.syncAcc += dt;
    if (this.syncAcc >= 0.25) { this.syncAcc = 0; this.syncWorld(); }
    this.saveAcc += dt;
    if (this.saveAcc >= 15) { this.saveAcc = 0; this.save(); }
  }

  syncWorld(): void {
    const s = this.state;
    if (!s || this.world.region !== s.currentRegion) return;
    const lots = s.regions[s.currentRegion].lots;
    const cash = new Set<string>(), permits = new Set<string>();
    for (const [id, l] of Object.entries(lots)) {
      if (l.owner !== 'player') continue;
      if (l.permitUntil > s.t) permits.add(id);
      else if (!l.manager && l.till >= 1) cash.add(id);
    }
    const paint = PAINTS.find((x) => x.id === s.paint);
    const mine = paint ? parseInt(paint.color.slice(1), 16) : 0xf2c14e;
    this.world.syncLots(lots, (o) => (o === 'player' ? mine : o === 'npc' || o === 'vacant' || o === 'civic' ? null : parseInt(rivalDef(o).color.slice(1), 16)), cash, permits);
  }

  private autoCollect(): void {
    const s = this.state!;
    const rid = s.currentRegion;
    for (const [id, l] of Object.entries(s.regions[rid].lots)) {
      if (l.owner !== 'player' || l.manager || l.till < 1) continue;
      if (this.world.distanceToLot(id) > JUICE.autoCollectRadius) continue;
      this.collectLot(id);
    }
  }

  collectLot(lotId: string): void {
    const s = this.state!;
    const v = collect(s, s.currentRegion, lotId);
    if (v <= 0) return;
    this.sfx.play('cash');
    const vis = this.world.lotVisual(lotId);
    if (vis) {
      this.burst(vis.center.clone().setY(Math.min(vis.top, 12)), JUICE.coins.collect);
      const p = this.world.screenPos(vis.center.clone().setY(Math.min(vis.top, 12) + 2), this.canvas.getBoundingClientRect());
      if (p.on) this.pop(p.x, p.y, `+${money(v)}`, 'cash');
    }
    this.shake(JUICE.shake.collect);
    this.syncWorld();
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  private tap(x: number, y: number): void {
    if (this.screen.value !== 'game' || !this.state) return;
    const id = this.world.pick(x, y, this.canvas.getBoundingClientRect());
    this.select(id);
  }

  select(id: string | null): void {
    this.selected.value = id;
    this.world.select(id);
    if (id) { this.sheet.value = null; this.sfx.play('select'); }
  }

  openSheet(id: SheetId | null, tab: string | null = null): void {
    if (id) { this.selected.value = null; this.world.select(null); }
    this.sfx.play(id ? 'open' : 'close');
    this.sheet.value = id;
    this.sheetTab.value = tab;
  }

  canDeal(lotId: string): boolean {
    return !!this.state && (this.state.broker || this.world.distanceToLot(lotId) <= JUICE.dealRadius);
  }

  goTo(lotId: string): void {
    this.world.autoTravel(lotId);
    this.sfx.play('tap');
  }

  // ── Actions ────────────────────────────────────────────────────────────────
  /** Run a core action with feedback. Returns whether it succeeded. */
  run(fn: (s: GameState) => ActionResult, fx: { sfx?: SfxName; lot?: string; coins?: number; shake?: number; toast?: string; pulse?: 'grow' | 'pop' } = {}): boolean {
    const s = this.state;
    if (!s) return false;
    const r = fn(s);
    if (!r.ok) {
      this.toast(r.msg ?? 'Not possible right now.', 'bad');
      this.sfx.play('error');
      return false;
    }
    this.sfx.play(fx.sfx ?? 'tap');
    if (fx.lot) {
      this.syncWorld();
      if (!JUICE.reducedMotion) this.world.pulseLot(fx.lot, fx.pulse ?? 'pop');
      const v = this.world.lotVisual(fx.lot);
      if (v) this.burst(v.center.clone().setY(Math.min(v.top, 14)), fx.coins ?? JUICE.coins.buy);
    }
    if (fx.shake) this.shake(fx.shake);
    if (fx.toast) this.toast(fx.toast, 'good');
    if (r.msg) this.toast(r.msg, 'info');
    this.syncWorld();
    this.tick.value++;
    return true;
  }

  hustle(at: { x: number; y: number }): void {
    const s = this.state;
    if (!s) return;
    const earn = hustleTap(s);
    const pitch = Math.min(JUICE.comboPitchMax, 1 + (s.hustle.combo - 1) * JUICE.comboPitchStep);
    this.sfx.play('coin', pitch);
    this.pop(at.x + (Math.random() - 0.5) * 40, at.y - 20, `+${money(earn)}`, 'cash');
    if (s.hustle.combo % 2 === 0) this.burst(this.world.player.pos.clone().setY(2.2), JUICE.coins.hustle);
    this.tick.value++;
  }

  shake(amount: number): void { if (!JUICE.reducedMotion) this.world.rig.shake(amount); }
  burst(at: THREE.Vector3, n: number): void { if (!JUICE.reducedMotion) this.world.coins.emit(at, n); }

  /** A modal (event, welcome-back, payment) is on screen: toasts must not draw over it. */
  modalOpen(): boolean {
    return !!(this.state?.pendingEvent && this.screen.value === 'game') || !!this.welcome.value || !!this.pendingPurchase.value;
  }
  /** Anything big on screen (modal, sheet or lot card): celebrations wait. */
  uiBusy(): boolean { return this.modalOpen() || !!this.sheet.value || !!this.selected.value; }

  /** At most two toasts at a time; while a modal is open they are held and shown after it closes. */
  toast(text: string, kind = 'info'): void {
    const id = this.nextId++;
    if (this.modalOpen()) { this.held = [...this.held.slice(-3), { id, text, kind }]; return; }
    if (this.toasts.value.some((t) => t.text === text)) return; // never the same line twice
    this.toasts.value = [...this.toasts.value.slice(-1), { id, text, kind }];
    setTimeout(() => { this.toasts.value = this.toasts.value.filter((t) => t.id !== id); }, 3400);
  }

  pop(x: number, y: number, text: string, kind: Pop['kind']): void {
    const id = this.nextId++;
    this.pops.value = [...this.pops.value.slice(-14), { id, x, y, text, kind }];
    setTimeout(() => { this.pops.value = this.pops.value.filter((p) => p.id !== id); }, JUICE.popMs);
  }

  // ── Store (sandbox on web; native adapter in M3) ───────────────────────────
  private askConfirm(p: Product): Promise<boolean> {
    return new Promise((resolve) => {
      this.pendingPurchase.value = { product: p, resolve: (ok) => { this.pendingPurchase.value = null; resolve(ok); } };
    });
  }

  async buyProduct(productId: string): Promise<void> {
    const s = this.state;
    if (!s) return;
    const out = await this.store.purchase(productId);
    if (out.status === 'cancelled') return;
    if (out.status === 'failed') { this.toast(out.error, 'bad'); this.sfx.play('error'); return; }
    const r = fulfill(s, out.purchase);
    if (!r.ok) { this.toast(r.reason === 'already-owned' ? 'You already own that.' : 'Purchase could not be applied.', 'bad'); return; }
    this.sfx.play('rankup');
    this.burst(this.world.player.pos.clone().setY(2), 20);
    this.save(); // fulfill() already posted the "Purchase complete" notice → one toast
    this.tick.value++;
  }

  async restorePurchases(): Promise<void> {
    if (!this.state) return;
    const ids = await this.store.restore();
    const got = restoreEntitlements(this.state, ids);
    if (!got.length) this.toast('Nothing to restore.', 'info'); // successes arrive as a notice
    this.tick.value++;
  }

  // ── Persistence & settings ─────────────────────────────────────────────────
  save(): void {
    const s = this.state;
    if (!s) return;
    s.lastSeenWall = Math.floor(Date.now() / 1000);
    localKV.set(SAVE_KEY, serialize(s));
  }

  private applyAway(seconds: number): void {
    const s = this.state;
    if (!s) return;
    const rep = applyOffline(s, seconds);
    if (rep.seconds > 0 && rep.earned > 0) this.welcome.value = rep;
  }

  /** The app went to the background (tab hidden, Android pause): remember when, and save. */
  suspend(): void {
    if (!this.hiddenAt) this.hiddenAt = Date.now();
    this.save();
  }

  /** Back from the background: credit the time away exactly once (the page's visibilitychange
   *  and the native resume event can both fire for the same trip). */
  resume(): void {
    const at = this.hiddenAt;
    this.hiddenAt = 0;
    if (!at || !this.state) return;
    this.applyAway((Date.now() - at) / 1000);
    this.last = performance.now();
    this.acc = 0;
  }

  /**
   * Android back button / Escape: close the top-most overlay. Returns false when nothing was open,
   * so the native shell can minimise the app. An event card needs an explicit choice, so back is
   * swallowed there rather than skipping the decision.
   */
  back(): boolean {
    const pay = this.pendingPurchase.value;
    if (pay) { pay.resolve(false); return true; }
    if (this.welcome.value) { this.welcome.value = null; this.sfx.play('cash'); return true; }
    if (this.state?.pendingEvent && this.screen.value === 'game') return true;
    if (this.sheet.value) { this.openSheet(null); return true; }
    if (this.selected.value) { this.select(null); return true; }
    return false;
  }

  private onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.suspend();
    else this.resume();
  };

  updateSettings(patch: Partial<Settings>): void {
    const next = { ...this.settings.value, ...patch };
    this.settings.value = next;
    localKV.set(SETTINGS_KEY, JSON.stringify(next));
    this.sfx.enabled = next.sound;
    setReducedMotion(next.reducedMotion);
    if (patch.quality) { this.save(); location.reload(); }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.controls.dispose();
    this.world.dispose();
  }
}
