/**
 * Kampfgeräusche (Nutzer 15.11.: „nach eigenem Ermessen, an anderen Spielen des Genres orientieren“). Alles im Browser
 * erzeugt (Web Audio), keine Dateien. Regeln nach StarCraft / Command & Conquer:
 * - Jede Waffenart hat einen eigenen, kurzen Klang; Tonhöhe und Lautstärke schwanken leicht, damit Salven nicht
 *   maschinell klingen.
 * - Höchstens 3 gleiche Klänge gleichzeitig, mindestens 45 ms Abstand; insgesamt höchstens 14 Stimmen.
 * - Lautstärke nach Entfernung zur Bildmitte und Zoom (weit draußen leiser, Karte nur Schweres), Stereo nach Bildposition.
 * - Angriffswarnung („Basis wird angegriffen“) als zweistufiger Signalton mit 15 s Pause, wie die Meldungen im Genre.
 * Lautstärke und An/Aus folgen dem Musik-Schalter.
 */
export type SoundKind =
  | 'rail' | 'bolt' | 'gun' | 'shell' | 'glob' | 'larc' | 'spike' | 'throw' | 'magic' | 'ice' | 'whoosh' | 'beam'
  | 'hit-spark' | 'hit-boom' | 'hit-pboom' | 'hit-dirt' | 'death' | 'alert';

/** Geschoss-Optik (sprites.ts PROJECTILES) → Klang beim Abschuss. */
export function shotSound(projectile: string): SoundKind | null {
  const p = projectile;
  if (/rail|orail/.test(p)) return 'rail';
  if (/beam/.test(p)) return 'beam';
  if (/bolt/.test(p) && !/mbolt/.test(p)) return 'bolt';
  if (/shot|rifle/.test(p)) return 'gun';
  if (/shell|cannon/.test(p)) return 'shell';
  if (/glob|plob|pstream/.test(p)) return 'glob';
  if (/larc/.test(p)) return 'larc';
  if (/spike|mbolt/.test(p)) return 'spike';
  if (/drones|stone|taunter|smash|leap|mud|sling|snow|avalanche/.test(p)) return 'throw';
  if (/orb|spell|grow|taunt|howl|bash/.test(p)) return 'magic';
  if (/ice|frost/.test(p)) return 'ice';
  if (/blade|dart/.test(p)) return 'whoosh';
  return null;
}

/** Einschlag-Effekt (pfx.ts) → Klang beim Einschlag. */
export function hitSound(pfx: string | undefined, heavy: boolean): SoundKind | null {
  if (!pfx) return heavy ? 'hit-boom' : 'hit-spark';
  if (pfx.startsWith('heal')) return null;
  if (pfx === 'boom') return 'hit-boom';
  if (pfx.startsWith('pboom')) return 'hit-pboom';
  if (pfx === 'dirt') return 'hit-dirt';
  return 'hit-spark';
}

const LIMIT = 3;
const GAP = 0.045;
const MAX_VOICES = 14;
const ALERT_PAUSE = 15;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly busy = new Map<SoundKind, number[]>();
  private voices: number[] = [];
  private lastAlert = -1e9;

  constructor(private readonly settings: () => { enabled: boolean; volume: number }) {}

  /** Klang abspielen: `pan` −1 … 1 (Bildposition), `gain` 0 … 1 (Entfernung, Zoom). */
  play(kind: SoundKind, pan = 0, gain = 1): void {
    const s = this.settings();
    if (!s.enabled || s.volume <= 0 || gain <= 0.02) return;
    try {
      const ctx = (this.ctx ??= new AudioContext());
      if (ctx.state === 'suspended') return; // erst nach einer Nutzeraktion (Browser-Regel)
      const t = ctx.currentTime;
      if (kind === 'alert') {
        if (t - this.lastAlert < ALERT_PAUSE) return;
        this.lastAlert = t;
      }
      this.voices = this.voices.filter((e) => e > t);
      if (this.voices.length >= MAX_VOICES && kind !== 'alert') return;
      const list = (this.busy.get(kind) ?? []).filter((e) => e > t);
      if (list.length >= LIMIT || (list.length && t - (list[list.length - 1]! - this.len(kind)) < GAP)) return;
      if (!this.master) {
        this.master = ctx.createGain();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.ratio.value = 4;
        this.master.connect(comp).connect(ctx.destination);
      }
      this.master.gain.value = 0.5 * s.volume;
      const out = ctx.createGain();
      out.gain.value = gain * (0.85 + Math.random() * 0.3);
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan * 0.7));
      out.connect(panner).connect(this.master);
      const pitch = 0.92 + Math.random() * 0.16;
      this.recipe(ctx, out, t, kind, pitch);
      const end = t + this.len(kind);
      list.push(end);
      this.busy.set(kind, list);
      this.voices.push(end);
    } catch {
      /* kein Web-Audio */
    }
  }

  /** Nach der ersten Nutzeraktion freigeben (Browser lassen Audio erst danach zu). */
  unlock(): void {
    try {
      const ctx = (this.ctx ??= new AudioContext());
      if (ctx.state === 'suspended') void ctx.resume();
    } catch {
      /* kein Web-Audio */
    }
  }

  private len(kind: SoundKind): number {
    return ({ shell: 0.45, 'hit-boom': 0.6, 'hit-pboom': 0.4, death: 0.35, alert: 0.7, larc: 0.35, glob: 0.3, rail: 0.25 } as Partial<Record<SoundKind, number>>)[kind] ?? 0.18;
  }

  private noise(ctx: AudioContext, out: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, amp: number, decay: number): void {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * decay));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = amp;
    src.connect(f).connect(g).connect(out);
    src.start(t);
  }

  private tone(ctx: AudioContext, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, amp: number): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private recipe(ctx: AudioContext, out: AudioNode, t: number, kind: SoundKind, p: number): void {
    switch (kind) {
      case 'rail': // Aufladen + scharfer Knall
        this.tone(ctx, out, t, 'sawtooth', 900 * p, 2400 * p, 0.06, 0.12);
        this.noise(ctx, out, t + 0.06, 0.08, 'highpass', 3000, 0.7, 0.5, 0.015);
        this.tone(ctx, out, t + 0.06, 'square', 1800 * p, 220 * p, 0.18, 0.1);
        break;
      case 'beam':
        this.tone(ctx, out, t, 'sawtooth', 700 * p, 1100 * p, 0.22, 0.08);
        this.noise(ctx, out, t, 0.2, 'bandpass', 2600, 3, 0.15, 0.08);
        break;
      case 'bolt': // Laserbolzen
        this.tone(ctx, out, t, 'square', 1400 * p, 520 * p, 0.09, 0.09);
        this.noise(ctx, out, t, 0.04, 'highpass', 4000, 0.7, 0.12, 0.01);
        break;
      case 'gun': // Gewehr / Leuchtspur
        this.noise(ctx, out, t, 0.08, 'bandpass', 1500 * p, 0.8, 0.55, 0.018);
        this.tone(ctx, out, t, 'sine', 180 * p, 70, 0.08, 0.35);
        break;
      case 'shell': // Kanone: dumpfer Knall mit Nachhall
        this.noise(ctx, out, t, 0.45, 'lowpass', 520 * p, 0.7, 0.9, 0.09);
        this.tone(ctx, out, t, 'sine', 110 * p, 38, 0.35, 0.8);
        break;
      case 'glob': // Plasma: zischendes „Fwump“
        this.noise(ctx, out, t, 0.3, 'bandpass', 850 * p, 1.2, 0.6, 0.07);
        this.tone(ctx, out, t, 'triangle', 340 * p, 110 * p, 0.25, 0.3);
        break;
      case 'larc': // Energiekugel der Batterie: ansteigendes Summen
        this.tone(ctx, out, t, 'sawtooth', 380 * p, 1500 * p, 0.16, 0.1);
        this.noise(ctx, out, t + 0.14, 0.2, 'bandpass', 2200, 1.5, 0.3, 0.05);
        break;
      case 'spike': // Myriaden: metallisches Klicken mit Zischen
        this.noise(ctx, out, t, 0.05, 'bandpass', 3200 * p, 2, 0.5, 0.01);
        this.tone(ctx, out, t, 'triangle', 980 * p, 640 * p, 0.07, 0.18);
        break;
      case 'throw': // Wurf: Luftzug, tief
        this.noise(ctx, out, t, 0.18, 'bandpass', 520 * p, 1.4, 0.5, 0.06);
        break;
      case 'magic': // Zauber: heller Schimmer
        this.tone(ctx, out, t, 'sine', 520 * p, 980 * p, 0.18, 0.16);
        this.tone(ctx, out, t + 0.02, 'triangle', 780 * p, 1460 * p, 0.16, 0.08);
        break;
      case 'ice':
        this.noise(ctx, out, t, 0.09, 'highpass', 5200, 0.8, 0.35, 0.02);
        this.tone(ctx, out, t, 'triangle', 2100 * p, 1500 * p, 0.08, 0.1);
        break;
      case 'whoosh':
        this.noise(ctx, out, t, 0.16, 'bandpass', 1100 * p, 0.9, 0.4, 0.05);
        break;
      case 'hit-spark': // Funken auf Panzerung
        this.noise(ctx, out, t, 0.06, 'highpass', 3600 * p, 0.9, 0.35, 0.012);
        this.tone(ctx, out, t, 'square', 2400 * p, 1600 * p, 0.03, 0.04);
        break;
      case 'hit-boom': // Explosion
        this.noise(ctx, out, t, 0.6, 'lowpass', 360 * p, 0.7, 1, 0.14);
        this.tone(ctx, out, t, 'sine', 80 * p, 32, 0.45, 0.9);
        break;
      case 'hit-pboom':
        this.noise(ctx, out, t, 0.4, 'bandpass', 640 * p, 1, 0.7, 0.09);
        this.tone(ctx, out, t, 'sine', 160 * p, 60, 0.3, 0.4);
        break;
      case 'hit-dirt': // Einschlag in Erde
        this.noise(ctx, out, t, 0.22, 'lowpass', 800 * p, 0.8, 0.6, 0.05);
        break;
      case 'death':
        this.noise(ctx, out, t, 0.35, 'lowpass', 600 * p, 0.8, 0.5, 0.08);
        this.tone(ctx, out, t, 'sine', 140 * p, 50, 0.3, 0.3);
        break;
      case 'alert': // Angriffswarnung: zwei tiefe Signaltöne
        for (const [dt, f] of [[0, 392], [0.28, 311]] as const) {
          this.tone(ctx, out, t + dt, 'square', f, f * 0.98, 0.22, 0.07);
          this.tone(ctx, out, t + dt, 'sine', f / 2, f / 2, 0.24, 0.25);
        }
        break;
    }
  }
}
