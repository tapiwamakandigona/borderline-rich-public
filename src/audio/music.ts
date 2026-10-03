// Procedural ambient music: one generative WebAudio loop per region. No audio files (keeps the
// boot budget), a few oscillators per beat. It shares the Sfx AudioContext, so it starts only after
// the first user gesture and follows the Sound setting.
import type { RegionId } from '../core/types';

export interface Mood {
  /** MIDI note of the tonic. */ root: number;
  /** Scale degrees in semitones. */ scale: number[];
  /** Chord roots as scale-degree indexes, one per bar. */ prog: number[];
  bpm: number;
  pad: OscillatorType;
  lead: OscillatorType;
  /** Chance that an 8th-note step plays an arpeggio note. */ density: number;
  /** Low-pass cutoff of the pad (Hz): lower is darker. */ tone: number;
}

const MAJ = [0, 2, 4, 5, 7, 9, 11];
const MIN = [0, 2, 3, 5, 7, 8, 10];
const DOR = [0, 2, 3, 5, 7, 9, 10];
const MIX = [0, 2, 4, 5, 7, 9, 10];

/** Region moods: Solenne is a sunny free port, Red Mesa a desert, Neon Vale a synth city at night,
 *  Amberfield farmland, Verano a beach resort, Ironhold industrial. */
export const MOODS: Record<RegionId, Mood> = {
  solenne: { root: 62, scale: MAJ, prog: [0, 4, 5, 3], bpm: 92, pad: 'triangle', lead: 'sine', density: 0.45, tone: 1400 },
  redmesa: { root: 57, scale: MIX, prog: [0, 6, 3, 0], bpm: 78, pad: 'triangle', lead: 'triangle', density: 0.3, tone: 1000 },
  neonvale: { root: 57, scale: MIN, prog: [0, 5, 2, 6], bpm: 104, pad: 'sawtooth', lead: 'square', density: 0.6, tone: 900 },
  amberfield: { root: 60, scale: MAJ, prog: [0, 3, 0, 4], bpm: 72, pad: 'sine', lead: 'triangle', density: 0.3, tone: 1600 },
  verano: { root: 65, scale: MAJ, prog: [0, 5, 1, 4], bpm: 98, pad: 'triangle', lead: 'sine', density: 0.5, tone: 1800 },
  ironhold: { root: 55, scale: DOR, prog: [0, 6, 5, 3], bpm: 84, pad: 'sawtooth', lead: 'triangle', density: 0.35, tone: 700 },
};

const hz = (midi: number): number => 440 * 2 ** ((midi - 69) / 12);

/** The MIDI notes of the triad built on scale degree `deg` (for tests and the scheduler). */
export function triad(m: Mood, deg: number): number[] {
  const n = m.scale.length;
  return [0, 2, 4].map((k) => {
    const i = deg + k;
    return m.root + m.scale[i % n] + 12 * Math.floor(i / n);
  });
}

export class Music {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private mood: Mood | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextAt = 0;
  private step = 0;
  private on = false;
  volume = 0.11;

  /** Attach to the shared context/output once audio is unlocked. Safe to call repeatedly. */
  attach(ctx: AudioContext | null, out: AudioNode | null): void {
    if (!ctx || !out || this.ctx) return;
    this.ctx = ctx;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.0001;
    this.filter.connect(this.bus).connect(out);
    this.sync();
  }

  /** Region change: crossfade to the new mood on the next bar. */
  setRegion(id: RegionId): void {
    const m = MOODS[id];
    if (m === this.mood) return;
    this.mood = m;
    this.step = 0;
    this.sync();
  }

  setEnabled(on: boolean): void { this.on = on; this.sync(); }

  private sync(): void {
    const c = this.ctx, play = this.on && !!this.mood && !!c;
    if (!c || !this.bus || !this.filter) return;
    const t = c.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(play ? this.volume : 0.0001, t, play ? 1.2 : 0.25);
    if (this.mood) this.filter.frequency.setTargetAtTime(this.mood.tone, t, 0.5);
    if (play && !this.timer) {
      this.nextAt = t + 0.1;
      this.timer = setInterval(() => this.schedule(), 200);
    } else if (!play && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    const c = this.ctx, m = this.mood;
    if (!c || !m || c.state !== 'running') return;
    const eighth = 30 / m.bpm;
    if (this.nextAt < c.currentTime) this.nextAt = c.currentTime + 0.05; // after a stall, don't burst
    while (this.nextAt < c.currentTime + 0.6) {
      this.beat(m, this.step, this.nextAt, eighth);
      this.step = (this.step + 1) % (8 * m.prog.length);
      this.nextAt += eighth;
    }
  }

  private beat(m: Mood, step: number, at: number, eighth: number): void {
    const bar = Math.floor(step / 8), pos = step % 8;
    const chord = triad(m, m.prog[bar % m.prog.length]);
    if (pos === 0) {
      const bar4 = eighth * 8;
      chord.forEach((n) => this.voice(hz(n - 12), at, bar4 * 1.1, m.pad, 0.16, 0.6, 3));
      this.voice(hz(chord[0] - 24), at, bar4 * 0.9, 'sine', 0.3, 0.02, 0);
    } else if (pos === 4) {
      this.voice(hz(chord[0] - 24), at, eighth * 3.5, 'sine', 0.2, 0.02, 0);
    }
    // A deterministic-feeling but varied arpeggio: notes from the chord, an octave up now and then.
    if (Math.random() < m.density) {
      const n = chord[(step * 2 + (Math.random() < 0.3 ? 1 : 0)) % 3] + (Math.random() < 0.25 ? 12 : 0);
      this.voice(hz(n), at, eighth * 1.6, m.lead, 0.09, 0.005, 0);
    }
  }

  private voice(f: number, at: number, dur: number, type: OscillatorType, vol: number, attack: number, detune: number): void {
    const c = this.ctx!, g = c.createGain(), o = c.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune ? (Math.random() * 2 - 1) * detune : 0;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.filter!);
    o.start(at);
    o.stop(at + dur + 0.05);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.bus?.disconnect();
  }
}
