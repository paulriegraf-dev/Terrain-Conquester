/**
 * Kampfgeräusche (Nutzer 15.11.: „nach eigenem Ermessen, an anderen Spielen des Genres orientieren“; Rückmeldung:
 * „zu dumpf, Technoclan mehr Sci-Fi, je Einheit eigene Klänge“). Alles im Browser erzeugt (Web Audio), keine Dateien.
 *
 * Klangfarbe je Fraktion (wie Terraner/Protoss/Zerg in StarCraft – man hört, wer schießt):
 * - Technoclan: Sci-Fi – Laser-„Pew“, Aufladen, elektrisches Knistern, FM-Wabern, heller metallischer Nachklang.
 * - Myriaden: Messing-Uhrwerk – Klicken, Ratschen, Summen, Gong- und Glockenklang (unharmonische Teiltöne).
 * - Terra-Former: Natur – Wind, Holz, Stein, Schlamm, Eis, dumpfes Erdgrollen.
 * Jede Einheit hat ihren eigenen Abschuss-Klang; Einschlag und Tod klingen nach der Fraktion.
 *
 * Mischregeln: höchstens 3 gleiche Klänge gleichzeitig, mindestens 45 ms Abstand, insgesamt höchstens 14 Stimmen;
 * Tonhöhe und Lautstärke schwanken leicht. Lautstärke nach Entfernung zur Bildmitte und Zoom, Stereo nach Bildposition.
 * Angriffswarnung als zweistufiger Signalton mit 15 s Pause. Lautstärke und An/Aus folgen dem Musik-Schalter.
 */
export type SoundKind =
  // Technoclan
  | 'tc-pistol' | 'tc-rail' | 'tc-plasma' | 'tc-heal' | 'tc-blaster' | 'tc-arc' | 'tc-grenade' | 'tc-heavy'
  // Myriaden
  | 'myr-buzz' | 'myr-clank' | 'myr-bite' | 'myr-cannon' | 'myr-launch' | 'myr-beam' | 'myr-swarm' | 'myr-gong' | 'myr-smash'
  // Terra-Former
  | 'tf-earth' | 'tf-wind' | 'tf-twang' | 'tf-wood' | 'tf-root' | 'tf-mud' | 'tf-mudheavy' | 'tf-ice' | 'tf-avalanche'
  | 'tf-stone' | 'tf-rockheavy' | 'tf-quake'
  // Einschlag, Tod, Meldung
  | 'hit-zap' | 'hit-clank' | 'hit-thud' | 'hit-boom' | 'hit-pboom'
  | 'death-tc' | 'death-myr' | 'death-tf' | 'alert';

type Faction = 'technoclan' | 'myriaden' | 'terraformer';

/** Abschuss-Klang je Einheit. */
const UNIT_SOUND: Record<string, SoundKind> = {
  commander: 'tc-pistol', sniper: 'tc-rail', plasma: 'tc-plasma', nanomedic: 'tc-heal', hoverscout: 'tc-blaster',
  battery: 'tc-arc', gunner: 'tc-grenade', colossus: 'tc-heavy',
  drone: 'myr-buzz', bomber: 'myr-clank', hound: 'myr-bite', myrcannon: 'myr-cannon', catapult: 'myr-launch',
  sphere: 'myr-beam', swarmmind: 'myr-swarm', taunter: 'myr-gong', breaker: 'myr-smash',
  terraformer: 'tf-earth', landformer: 'tf-quake',
  wardMeadow: 'tf-wind', specialMeadow: 'tf-twang', wardForest: 'tf-wood', specialForest: 'tf-root',
  wardMud: 'tf-mud', specialMud: 'tf-mudheavy', mudling: 'tf-mud',
  wardSnow: 'tf-ice', specialSnow: 'tf-avalanche', wardRubble: 'tf-stone', specialRubble: 'tf-rockheavy',
};

/** Einheit → Klang beim Abschuss. */
export function shotSound(unit: string): SoundKind | null {
  return UNIT_SOUND[unit] ?? null;
}

/** Einschlag: schwere Explosionen gemeinsam, sonst nach Fraktion des Schützen. */
export function hitSound(pfx: string | undefined, heavy: boolean, faction: Faction): SoundKind | null {
  if (pfx?.startsWith('heal')) return null;
  if (pfx === 'boom' || (heavy && !pfx)) return 'hit-boom';
  if (pfx?.startsWith('pboom')) return 'hit-pboom';
  return faction === 'technoclan' ? 'hit-zap' : faction === 'myriaden' ? 'hit-clank' : 'hit-thud';
}

export function deathSound(faction: Faction): SoundKind {
  return faction === 'technoclan' ? 'death-tc' : faction === 'myriaden' ? 'death-myr' : 'death-tf';
}

const LIMIT = 3;
const GAP = 0.045;
const MAX_VOICES = 14;
const ALERT_PAUSE = 15;

const LEN: Partial<Record<SoundKind, number>> = {
  'tc-rail': 0.45, 'tc-plasma': 0.3, 'tc-arc': 0.3, 'tc-heavy': 0.5, 'tc-grenade': 0.25, 'tc-heal': 0.3,
  'myr-cannon': 0.6, 'myr-gong': 0.8, 'myr-launch': 0.35, 'myr-beam': 0.35, 'myr-swarm': 0.3, 'myr-smash': 0.4,
  'tf-earth': 0.35, 'tf-quake': 0.5, 'tf-avalanche': 0.55, 'tf-mudheavy': 0.35, 'tf-rockheavy': 0.4, 'tf-root': 0.3,
  'hit-boom': 0.6, 'hit-pboom': 0.4, 'death-tc': 0.4, 'death-myr': 0.45, 'death-tf': 0.4, alert: 0.7,
};

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private send: GainNode | null = null;
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
      this.ensureBus(ctx);
      this.master!.gain.value = 0.55 * s.volume;
      const out = ctx.createGain();
      out.gain.value = gain * (0.85 + Math.random() * 0.3);
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan * 0.7));
      out.connect(panner);
      panner.connect(this.master!);
      // Technoclan und Myriaden bekommen etwas Raum (kurzes Echo), Terra-Former bleiben trocken und erdig.
      if (!kind.startsWith('tf-') && kind !== 'death-tf' && kind !== 'hit-thud') panner.connect(this.send!);
      const pitch = 0.93 + Math.random() * 0.14;
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

  /** Summe: Höhen leicht angehoben (gegen „dumpf“), sanfter Kompressor; dazu ein kurzes Stereo-Echo als Raum. */
  private ensureBus(ctx: AudioContext): void {
    if (this.master) return;
    this.master = ctx.createGain();
    const shelf = ctx.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 2500;
    shelf.gain.value = 5;
    const low = ctx.createBiquadFilter();
    low.type = 'highpass';
    low.frequency.value = 45;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.attack.value = 0.004;
    comp.release.value = 0.12;
    this.master.connect(low).connect(shelf).connect(comp).connect(ctx.destination);
    this.send = ctx.createGain();
    this.send.gain.value = 0.16;
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.085;
    const fb = ctx.createGain();
    fb.gain.value = 0.28;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 4500;
    this.send.connect(delay).connect(damp).connect(fb).connect(delay);
    damp.connect(this.master);
  }

  private len(kind: SoundKind): number {
    return LEN[kind] ?? 0.2;
  }

  /** Gefiltertes Rauschen; `f1` lässt den Filter über die Dauer wandern (Wind, Zischen). */
  private noise(ctx: AudioContext, out: AudioNode, t: number, dur: number, type: BiquadFilterType, freq: number, q: number, amp: number, decay: number, f1?: number): void {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * decay));
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = amp;
    src.connect(f).connect(g).connect(out);
    src.start(t);
  }

  private tone(ctx: AudioContext, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, amp: number, attack = 0): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (attack > 0) {
      g.gain.setValueAtTime(0.0005, t);
      g.gain.exponentialRampToValueAtTime(amp, t + attack);
    } else g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** FM-Ton: Träger, dessen Frequenz mit `modF` um `depth` wabert (Plasma, Summen, Strahl). */
  private fm(ctx: AudioContext, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, modF: number, depth: number, dur: number, amp: number): void {
    const o = ctx.createOscillator();
    const m = ctx.createOscillator();
    const md = ctx.createGain();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    m.frequency.value = modF;
    md.gain.value = depth;
    m.connect(md).connect(o.frequency);
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    m.start(t);
    o.stop(t + dur + 0.02);
    m.stop(t + dur + 0.02);
  }

  /** Glocken-/Metallklang aus unharmonischen Teiltönen. */
  private bell(ctx: AudioContext, out: AudioNode, t: number, base: number, ratios: number[], dur: number, amp: number): void {
    ratios.forEach((r, i) => this.tone(ctx, out, t, 'sine', base * r, base * r * 0.995, dur * (1 - i * 0.12), amp / (1 + i * 0.6)));
  }

  /** Kurze Knackser in Folge (Knistern, Ratschen, Krabbeln). */
  private clicks(ctx: AudioContext, out: AudioNode, t: number, n: number, span: number, freq: number, amp: number): void {
    for (let i = 0; i < n; i++) this.noise(ctx, out, t + (span * i) / n + Math.random() * 0.008, 0.02, 'bandpass', freq * (0.8 + Math.random() * 0.4), 3, amp, 0.004);
  }

  private recipe(ctx: AudioContext, out: AudioNode, t: number, kind: SoundKind, p: number): void {
    switch (kind) {
      // ---------------------------------------------------------------- Technoclan: Sci-Fi
      case 'tc-pistol': // Commander: kurzer, heller Laserschuss
        this.tone(ctx, out, t, 'square', 2200 * p, 700 * p, 0.08, 0.07);
        this.tone(ctx, out, t, 'sine', 4400 * p, 1400 * p, 0.06, 0.05);
        this.noise(ctx, out, t, 0.03, 'highpass', 6000, 0.7, 0.18, 0.008);
        break;
      case 'tc-rail': // Scharfschütze: Aufladen, scharfer Knall, singender Nachklang
        this.tone(ctx, out, t, 'sine', 700 * p, 3600 * p, 0.09, 0.05, 0.06);
        this.noise(ctx, out, t + 0.09, 0.07, 'highpass', 2800, 0.7, 0.55, 0.012);
        this.tone(ctx, out, t + 0.09, 'sawtooth', 2600 * p, 260 * p, 0.16, 0.07);
        this.bell(ctx, out, t + 0.09, 3100 * p, [1, 1.37], 0.34, 0.05);
        break;
      case 'tc-plasma': // Plasmawerfer: zischendes, waberndes Plasma
        this.fm(ctx, out, t, 'triangle', 320 * p, 760 * p, 38, 180, 0.28, 0.22);
        this.noise(ctx, out, t, 0.26, 'bandpass', 3200, 2, 0.22, 0.09, 1400);
        this.tone(ctx, out, t, 'sine', 1600 * p, 500 * p, 0.12, 0.04);
        break;
      case 'tc-heal': // Nano-Heiler: heller Zweiklang
        this.tone(ctx, out, t, 'sine', 990 * p, 1480 * p, 0.2, 0.11, 0.02);
        this.tone(ctx, out, t + 0.06, 'sine', 1480 * p, 1980 * p, 0.22, 0.08, 0.02);
        break;
      case 'tc-blaster': // Hover-Späher: schnelles „Pew“
        this.tone(ctx, out, t, 'sawtooth', 2800 * p, 420 * p, 0.11, 0.11);
        this.tone(ctx, out, t, 'sine', 1400 * p, 220 * p, 0.11, 0.16);
        break;
      case 'tc-arc': // Railgun-Batterie: elektrisches Knistern und steigender Zap
        this.clicks(ctx, out, t, 9, 0.2, 4200, 0.45);
        this.tone(ctx, out, t, 'sawtooth', 240 * p, 2600 * p, 0.18, 0.06);
        this.fm(ctx, out, t + 0.12, 'square', 1800 * p, 900 * p, 70, 400, 0.16, 0.04);
        break;
      case 'tc-grenade': // Gunner: Druckluft-„Tock“ mit Energie-Sweep
        this.tone(ctx, out, t, 'sine', 260 * p, 70, 0.16, 0.5);
        this.tone(ctx, out, t, 'sawtooth', 1500 * p, 320 * p, 0.13, 0.06);
        this.noise(ctx, out, t, 0.07, 'bandpass', 2400, 1, 0.3, 0.015);
        break;
      case 'tc-heavy': // Koloss: Impulskanone, tiefer Wumms mit metallischem Klingen
        this.tone(ctx, out, t, 'sine', 95 * p, 34, 0.42, 0.85);
        this.tone(ctx, out, t, 'square', 700 * p, 95 * p, 0.28, 0.07);
        this.noise(ctx, out, t, 0.35, 'lowpass', 2200 * p, 0.7, 0.55, 0.06);
        this.bell(ctx, out, t, 2300 * p, [1, 1.51], 0.3, 0.035);
        break;
      // ---------------------------------------------------------------- Myriaden: Messing-Uhrwerk
      case 'myr-buzz': // Drohne: kurzes Summen mit Klick
        this.fm(ctx, out, t, 'sawtooth', 210 * p, 160 * p, 95, 70, 0.13, 0.08);
        this.noise(ctx, out, t, 0.025, 'bandpass', 4200, 3, 0.4, 0.005);
        break;
      case 'myr-clank': // Sprengetopp: Blechscheppern
        this.noise(ctx, out, t, 0.08, 'bandpass', 2600 * p, 3, 0.5, 0.02);
        this.bell(ctx, out, t, 900 * p, [1, 1.46, 2.13], 0.18, 0.06);
        break;
      case 'myr-bite': // Hund: schnappende Kiefer, Ratsche
        this.clicks(ctx, out, t, 3, 0.06, 3200, 0.7);
        this.tone(ctx, out, t + 0.05, 'triangle', 1100 * p, 700 * p, 0.06, 0.12);
        break;
      case 'myr-cannon': // Myr-Kanone: Messing-Donner mit Glockennachklang
        this.noise(ctx, out, t, 0.45, 'lowpass', 1600 * p, 0.7, 0.75, 0.08);
        this.tone(ctx, out, t, 'sine', 125 * p, 40, 0.38, 0.75);
        this.bell(ctx, out, t, 620 * p, [1, 1.5, 2.21], 0.55, 0.05);
        break;
      case 'myr-launch': // Katapult: Knarren des Arms, dann Luftzug
        this.fm(ctx, out, t, 'sawtooth', 95 * p, 75 * p, 23, 18, 0.12, 0.05);
        this.clicks(ctx, out, t, 4, 0.1, 1400, 0.25);
        this.noise(ctx, out, t + 0.08, 0.25, 'bandpass', 600, 1.2, 0.7, 0.08, 1300);
        break;
      case 'myr-beam': // Battlesphäre: schwingender Strahl aus zwei verstimmten Tönen
        this.tone(ctx, out, t, 'sawtooth', 330 * p, 350 * p, 0.32, 0.05, 0.03);
        this.tone(ctx, out, t, 'sawtooth', 334 * p, 352 * p, 0.32, 0.05, 0.03);
        this.fm(ctx, out, t, 'sine', 990 * p, 1050 * p, 12, 40, 0.3, 0.06);
        break;
      case 'myr-swarm': // Schwarmgeist: krabbelndes Klicken und Summen
        this.clicks(ctx, out, t, 10, 0.24, 3600, 0.22);
        this.fm(ctx, out, t, 'triangle', 480 * p, 620 * p, 140, 120, 0.26, 0.06);
        break;
      case 'myr-gong': // Verspotter: Gong
        this.bell(ctx, out, t, 210 * p, [1, 1.48, 2.32, 3.16], 0.8, 0.16);
        this.noise(ctx, out, t, 0.04, 'bandpass', 1800, 2, 0.3, 0.008);
        break;
      case 'myr-smash': // Brechstange: schwerer Metallschlag
        this.noise(ctx, out, t, 0.3, 'lowpass', 1800 * p, 0.7, 0.7, 0.05);
        this.tone(ctx, out, t, 'sine', 150 * p, 50, 0.25, 0.6);
        this.bell(ctx, out, t, 480 * p, [1, 1.63, 2.4], 0.35, 0.07);
        break;
      // ---------------------------------------------------------------- Terra-Former: Natur
      case 'tf-earth': // Terraformer: Erdgrollen mit grünem Summen
        this.tone(ctx, out, t, 'sine', 120 * p, 55, 0.3, 0.45);
        this.tone(ctx, out, t, 'triangle', 420 * p, 840 * p, 0.22, 0.06, 0.04);
        this.noise(ctx, out, t, 0.25, 'lowpass', 1100, 0.7, 0.35, 0.07);
        break;
      case 'tf-quake': // Landformer: kräftiges Beben
        this.tone(ctx, out, t, 'sine', 85 * p, 32, 0.45, 0.8);
        this.noise(ctx, out, t, 0.45, 'lowpass', 900, 0.7, 0.6, 0.1);
        this.clicks(ctx, out, t + 0.05, 6, 0.3, 1600, 0.2);
        break;
      case 'tf-wind': // Halmläufer: Windklinge, aufsteigend
        this.noise(ctx, out, t, 0.2, 'bandpass', 500 * p, 2.5, 1.3, 0.08, 2600 * p);
        this.tone(ctx, out, t, 'sine', 700 * p, 1500 * p, 0.14, 0.04);
        break;
      case 'tf-twang': // Steppenjäger: Sehne
        this.tone(ctx, out, t, 'triangle', 330 * p, 300 * p, 0.16, 0.3);
        this.tone(ctx, out, t, 'sawtooth', 660 * p, 600 * p, 0.08, 0.05);
        this.noise(ctx, out, t + 0.02, 0.12, 'bandpass', 1400, 1.4, 0.25, 0.04, 2400);
        break;
      case 'tf-wood': // Borkenschütze: hölzernes „Tock“
        this.tone(ctx, out, t, 'triangle', 540 * p, 380 * p, 0.07, 0.35);
        this.noise(ctx, out, t, 0.05, 'bandpass', 1900 * p, 2.5, 0.4, 0.012);
        break;
      case 'tf-root': // Hainhüter: Wurzeln brechen aus dem Boden
        this.clicks(ctx, out, t, 6, 0.18, 900, 0.35);
        this.tone(ctx, out, t, 'sine', 110 * p, 60, 0.26, 0.4);
        break;
      case 'tf-mud': // Schlamm: nasser Klatscher
        this.noise(ctx, out, t, 0.18, 'lowpass', 1600 * p, 1.5, 0.6, 0.04, 300);
        this.tone(ctx, out, t, 'sine', 210 * p, 90, 0.1, 0.25);
        break;
      case 'tf-mudheavy': // Schlammschleuder: großer Schlammbrocken
        this.noise(ctx, out, t, 0.3, 'lowpass', 1300 * p, 1.5, 0.75, 0.07, 220);
        this.tone(ctx, out, t, 'sine', 150 * p, 55, 0.22, 0.5);
        break;
      case 'tf-ice': // Frostwächter: klirrende Eissplitter
        this.noise(ctx, out, t, 0.08, 'highpass', 5200, 0.8, 0.3, 0.02);
        this.bell(ctx, out, t, 2600 * p, [1, 1.5, 2.04], 0.18, 0.06);
        break;
      case 'tf-avalanche': // Lawinenrufer: Grollen mit Eisrieseln
        this.noise(ctx, out, t, 0.5, 'lowpass', 900, 0.7, 0.7, 0.12);
        this.noise(ctx, out, t + 0.05, 0.4, 'highpass', 4800, 0.7, 0.2, 0.1);
        this.tone(ctx, out, t, 'sine', 90 * p, 40, 0.45, 0.5);
        break;
      case 'tf-stone': // Steinwächter: Steindorn, kurzer Knacks
        this.noise(ctx, out, t, 0.06, 'bandpass', 1300 * p, 1.2, 0.65, 0.015);
        this.tone(ctx, out, t, 'sine', 160 * p, 75, 0.12, 0.4);
        break;
      case 'tf-rockheavy': // Frontbrecher: Felsbrocken
        this.noise(ctx, out, t, 0.3, 'lowpass', 1500 * p, 0.8, 0.75, 0.06);
        this.clicks(ctx, out, t + 0.04, 5, 0.2, 1100, 0.3);
        this.tone(ctx, out, t, 'sine', 120 * p, 42, 0.32, 0.6);
        break;
      // ---------------------------------------------------------------- Einschlag
      case 'hit-zap': // Technoclan: Energie zischt auf Panzerung
        this.noise(ctx, out, t, 0.06, 'highpass', 3200 * p, 0.8, 0.3, 0.014);
        this.tone(ctx, out, t, 'square', 3200 * p, 1400 * p, 0.05, 0.035);
        this.fm(ctx, out, t, 'sine', 1900 * p, 900 * p, 60, 300, 0.07, 0.03);
        break;
      case 'hit-clank': // Myriaden: metallischer Treffer
        this.noise(ctx, out, t, 0.05, 'bandpass', 2600 * p, 3, 0.55, 0.012);
        this.bell(ctx, out, t, 1250 * p, [1, 1.42], 0.1, 0.06);
        break;
      case 'hit-thud': // Terra-Former: Erde, Holz, Stein
        this.noise(ctx, out, t, 0.12, 'lowpass', 1500 * p, 0.8, 0.45, 0.03);
        this.tone(ctx, out, t, 'sine', 200 * p, 90, 0.08, 0.2);
        break;
      case 'hit-boom': // Explosion: Wumms plus Knistern, damit es nicht nur dumpf grollt
        this.noise(ctx, out, t, 0.6, 'lowpass', 1200 * p, 0.7, 0.9, 0.12);
        this.noise(ctx, out, t, 0.25, 'highpass', 3000, 0.7, 0.18, 0.05);
        this.tone(ctx, out, t, 'sine', 85 * p, 32, 0.45, 0.85);
        break;
      case 'hit-pboom': // Plasma-Explosion
        this.noise(ctx, out, t, 0.4, 'bandpass', 1100 * p, 1, 0.6, 0.08);
        this.fm(ctx, out, t, 'triangle', 700 * p, 200 * p, 40, 160, 0.3, 0.07);
        this.tone(ctx, out, t, 'sine', 160 * p, 60, 0.3, 0.35);
        break;
      // ---------------------------------------------------------------- Tod
      case 'death-tc': // Rüstung fällt, Elektronik verlischt
        this.tone(ctx, out, t, 'sawtooth', 900 * p, 80, 0.32, 0.05);
        this.clicks(ctx, out, t, 5, 0.15, 3800, 0.2);
        this.noise(ctx, out, t, 0.25, 'lowpass', 1500, 0.8, 0.35, 0.06);
        break;
      case 'death-myr': // Uhrwerk bricht auseinander
        this.clicks(ctx, out, t, 7, 0.25, 2400, 0.3);
        this.bell(ctx, out, t + 0.05, 700 * p, [1, 1.53, 2.27], 0.35, 0.045);
        this.noise(ctx, out, t, 0.3, 'lowpass', 1400, 0.8, 0.3, 0.07);
        break;
      case 'death-tf': // zerfällt zu Erde und Holz
        this.noise(ctx, out, t, 0.35, 'lowpass', 1300 * p, 0.8, 0.5, 0.08, 400);
        this.clicks(ctx, out, t + 0.03, 4, 0.2, 900, 0.25);
        this.tone(ctx, out, t, 'sine', 150 * p, 55, 0.3, 0.3);
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
