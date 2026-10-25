import ingameTrack from '../../assets/music/ingame.mp3';
// 25.10. abends: eigenes Orchesterstück fürs Startmenü (d-Moll, Streicher, Horn, Chor, Harfe, Pauken; erzeugt).
import menuTrack from '../../assets/music/leitstelle.mp3';
// Zweites Stück (Wunsch des Nutzers, Orientierung: eisige Fantasy-Menümusik): Wind, tiefer Chor, Tremolo, Glocken.
import frostTrack from '../../assets/music/frostwacht.mp3';

/** Startmusik zur Wahl (Optionen). */
export const MENU_TRACKS = [
  { id: 'leitstelle', name: 'Leitstelle', url: menuTrack },
  { id: 'frostwacht', name: 'Frostwacht', url: frostTrack },
] as const;
const KEY_MENU = 'tc-menu-track';

/**
 * Musik: eine Spur fürs Spiel (eingebettet) und eine fürs Startmenü.
 *
 * Die Startmenü-Musik wählt man in den Optionen aus MENU_TRACKS (eine eigene Datei ist nicht mehr vorgesehen).
 *
 * Browser spielen Ton erst nach der ersten Eingabe ab – deshalb startet die Musik beim ersten Klick.
 */
export type Track = 'menu' | 'game';

const KEY_ENABLED = 'tc-music-enabled';
const KEY_VOLUME = 'tc-music-volume';

export class Music {
  private readonly audio: HTMLAudioElement;
  private current: Track | null = null;
  private unlocked = false;
  enabled = true;
  /** Gewählte Startmusik: eine aus MENU_TRACKS. */
  menuChoice = 'leitstelle';
  private sfx: AudioContext | null = null;
  /** Lautstärke 0–1 (Regler; gilt nur auf diesem Rechner – im Multiplayer hat jeder seine eigene). */
  volume = 0.7;

  constructor(doc: Document) {
    this.audio = new Audio();
    this.audio.loop = true;
    try {
      this.enabled = localStorage.getItem(KEY_ENABLED) !== '0';
      const v = Number(localStorage.getItem(KEY_VOLUME));
      if (localStorage.getItem(KEY_VOLUME) !== null && Number.isFinite(v)) this.volume = Math.max(0, Math.min(1, v));
      const saved = localStorage.getItem(KEY_MENU);
      // Früher gab es eine eigene Datei ('custom') – die fällt jetzt auf Leitstelle zurück.
      if (saved && MENU_TRACKS.some((t) => t.id === saved)) this.menuChoice = saved;
    } catch {
      /* ohne Speicher: Musik an */
    }
    const unlock = (): void => {
      if (this.unlocked) return;
      this.unlocked = true;
      this.apply();
    };
    doc.addEventListener('pointerdown', unlock, { once: false });
    doc.addEventListener('keydown', unlock, { once: false });
  }

  play(track: Track): void {
    if (this.current === track) return;
    this.current = track;
    this.apply();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem(KEY_ENABLED, on ? '1' : '0');
    } catch {
      /* egal */
    }
    this.apply();
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem(KEY_VOLUME, String(this.volume));
    } catch {
      /* egal */
    }
    this.apply();
  }

  /** Name der laufenden Startmusik. */
  get menuTrackName(): string {
    return (MENU_TRACKS.find((t) => t.id === this.menuChoice) ?? MENU_TRACKS[0]).name;
  }

  /** Nächste Startmusik. */
  cycleMenuTrack(): void {
    const ids: string[] = MENU_TRACKS.map((t) => t.id);
    const i = ids.indexOf(this.menuChoice);
    this.menuChoice = ids[(i + 1) % ids.length]!;
    try {
      localStorage.setItem(KEY_MENU, this.menuChoice);
    } catch {
      /* egal */
    }
    if (this.current === 'menu') this.reload();
  }

  /**
   * Klick (Menü-Knöpfe): kurzer, schwerer „Klonk“ – Anschlag aus gefiltertem Rauschen, tiefer Schlag und ein
   * metallischer Nachklang. Im Browser erzeugt, keine Datei. Folgt Musik an/aus und Lautstärke.
   */
  click(): void {
    if (!this.enabled || this.volume <= 0) return;
    try {
      const ctx = (this.sfx ??= new AudioContext());
      if (ctx.state === 'suspended') void ctx.resume();
      const t = ctx.currentTime;
      const out = ctx.createGain();
      out.gain.value = 0.55 * this.volume;
      out.connect(ctx.destination);
      // Anschlag
      const len = Math.floor(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.004));
      const noise = ctx.createBufferSource();
      noise.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 2400;
      bp.Q.value = 0.9;
      noise.connect(bp).connect(out);
      noise.start(t);
      // tiefer Schlag
      const thud = ctx.createOscillator();
      const tg = ctx.createGain();
      thud.type = 'sine';
      thud.frequency.setValueAtTime(150, t);
      thud.frequency.exponentialRampToValueAtTime(62, t + 0.07);
      tg.gain.setValueAtTime(0.9, t);
      tg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      thud.connect(tg).connect(out);
      thud.start(t);
      thud.stop(t + 0.13);
      // metallischer Nachklang
      for (const [f, a, dec] of [[640, 0.16, 0.16], [1170, 0.1, 0.12], [1830, 0.06, 0.09]] as const) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = f;
        g.gain.setValueAtTime(a, t + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0005, t + dec);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + dec + 0.02);
      }
    } catch {
      /* kein Web-Audio */
    }
  }

  private srcFor(track: Track): string {
    if (track === 'menu') {
      return (MENU_TRACKS.find((t) => t.id === this.menuChoice) ?? MENU_TRACKS[0]).url;
    }
    return ingameTrack;
  }

  private reload(): void {
    this.audio.dataset.src = '';
    this.apply();
  }

  private apply(): void {
    if (!this.enabled || !this.current) {
      this.audio.pause();
      return;
    }
    const src = this.srcFor(this.current);
    const base = 0.64;
    this.audio.volume = Math.max(0, Math.min(1, base * this.volume));
    if (this.audio.dataset.src !== src) {
      this.audio.dataset.src = src;
      this.audio.src = src;
    }
    if (!this.unlocked) return;
    void this.audio.play().catch(() => {
      /* Autoplay blockiert – beim nächsten Klick */
      this.unlocked = false;
    });
  }
}
