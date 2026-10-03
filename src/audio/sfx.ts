// WebAudio-synthesised sound effects: no audio files, tiny bundle, ±8 % pitch variation per play
// (ART_BIBLE juice rule). The context is created lazily on the first user gesture.
import { JUICE } from '../ui/juice';

export type SfxName = 'tap' | 'coin' | 'cash' | 'buy' | 'upgrade' | 'error' | 'event' | 'rankup' | 'open' | 'close' | 'whoosh' | 'bad' | 'select';

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;
  private last: Partial<Record<SfxName, number>> = {};

  /** Call from a user gesture (pointerdown) — browsers block audio until then. */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
  }

  private vary(f: number): number { return f * (1 + (Math.random() * 2 - 1) * JUICE.pitchVariation); }

  private tone(freq: number, at: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    const c = this.ctx!, o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.master!);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private noise(at: number, dur: number, vol: number, hp = 2000): void {
    const c = this.ctx!;
    const buf = c.createBuffer(1, Math.max(1, Math.floor(c.sampleRate * dur)), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master!);
    src.start(at);
  }

  /** pitch: extra multiplier (e.g. rising with hustle combo). */
  play(name: SfxName, pitch = 1): void {
    if (!this.enabled || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const minGap = name === 'coin' || name === 'tap' ? 0.03 : 0.06;
    if ((this.last[name] ?? -1) > now - minGap) return;
    this.last[name] = now;
    const v = (f: number) => this.vary(f * pitch);
    switch (name) {
      case 'tap': this.tone(v(520), now, 0.07, 'triangle', 0.25, v(380)); break;
      case 'select': this.tone(v(660), now, 0.06, 'sine', 0.2); this.tone(v(990), now + 0.04, 0.08, 'sine', 0.15); break;
      case 'coin': this.tone(v(1318), now, 0.08, 'square', 0.08); this.tone(v(1975), now + 0.05, 0.16, 'square', 0.07); break;
      case 'cash':
        this.noise(now, 0.05, 0.25, 3000);
        this.tone(v(1567), now + 0.03, 0.1, 'triangle', 0.25);
        this.tone(v(2093), now + 0.1, 0.25, 'triangle', 0.22);
        break;
      case 'buy': [523, 659, 784, 1046].forEach((f, i) => this.tone(v(f), now + i * 0.06, 0.18, 'triangle', 0.22)); break;
      case 'upgrade': this.tone(v(392), now, 0.22, 'sawtooth', 0.09, v(1175)); this.tone(v(1568), now + 0.16, 0.18, 'triangle', 0.2); break;
      case 'error': this.tone(v(180), now, 0.16, 'square', 0.12, v(140)); break;
      case 'bad': this.tone(v(330), now, 0.25, 'sawtooth', 0.12, v(196)); this.tone(v(233), now + 0.18, 0.35, 'sawtooth', 0.1, v(150)); break;
      case 'event': this.tone(v(880), now, 0.12, 'sine', 0.25); this.tone(v(660), now + 0.13, 0.22, 'sine', 0.25); break;
      case 'rankup':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone(v(f), now + i * 0.09, 0.4, 'triangle', 0.22));
        this.noise(now + 0.45, 0.4, 0.08, 6000);
        break;
      case 'open': this.tone(v(300), now, 0.12, 'sine', 0.18, v(520)); break;
      case 'close': this.tone(v(520), now, 0.1, 'sine', 0.14, v(300)); break;
      case 'whoosh': this.noise(now, 0.35, 0.18, 800); break;
    }
  }
}
