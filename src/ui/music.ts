import ingameTrack from '../../assets/music/ingame.mp3';

/**
 * Musik: eine Spur fürs Spiel (eingebettet) und eine fürs Startmenü.
 *
 * Die Startmenü-Musik kann man selbst wählen (Datei vom eigenen Rechner). Sie bleibt nur in
 * diesem Browser (IndexedDB) – sie wird nicht mit dem Spiel veröffentlicht. Ohne eigene Wahl
 * läuft im Startmenü leise die Spiel-Musik.
 *
 * Browser spielen Ton erst nach der ersten Eingabe ab – deshalb startet die Musik beim ersten Klick.
 */
export type Track = 'menu' | 'game';

const DB = 'terrain-conquester';
const STORE = 'music';
const KEY_ENABLED = 'tc-music-enabled';
const KEY_VOLUME = 'tc-music-volume';

export class Music {
  private readonly audio: HTMLAudioElement;
  private current: Track | null = null;
  private menuUrl: string | null = null;
  private menuName: string | null = null;
  private unlocked = false;
  enabled = true;
  /** Lautstärke 0–1 (Regler; gilt nur auf diesem Rechner – im Multiplayer hat jeder seine eigene). */
  volume = 0.7;

  constructor(doc: Document) {
    this.audio = new Audio();
    this.audio.loop = true;
    try {
      this.enabled = localStorage.getItem(KEY_ENABLED) !== '0';
      const v = Number(localStorage.getItem(KEY_VOLUME));
      if (localStorage.getItem(KEY_VOLUME) !== null && Number.isFinite(v)) this.volume = Math.max(0, Math.min(1, v));
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
    void this.loadStoredMenuTrack();
  }

  /** Name der gewählten Startmenü-Musik (oder null). */
  get customMenuName(): string | null {
    return this.menuName;
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

  /** Eigene Startmenü-Musik vom Rechner wählen – bleibt nur in diesem Browser. */
  async setMenuTrack(file: File): Promise<void> {
    if (this.menuUrl) URL.revokeObjectURL(this.menuUrl);
    this.menuUrl = URL.createObjectURL(file);
    this.menuName = file.name;
    if (this.current === 'menu') this.reload();
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put({ name: file.name, blob: file }, 'menu');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      /* Speichern ging nicht – gilt dann nur bis zum Neuladen */
    }
  }

  private async loadStoredMenuTrack(): Promise<void> {
    try {
      const db = await openDb();
      const rec = await new Promise<{ name: string; blob: Blob } | undefined>((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get('menu');
        req.onsuccess = () => resolve(req.result as { name: string; blob: Blob } | undefined);
        req.onerror = () => reject(req.error);
      });
      if (!rec || this.menuUrl) return;
      this.menuUrl = URL.createObjectURL(rec.blob);
      this.menuName = rec.name;
      if (this.current === 'menu') this.reload();
    } catch {
      /* kein IndexedDB (z. B. privates Fenster) */
    }
  }

  private srcFor(track: Track): string {
    return track === 'menu' && this.menuUrl ? this.menuUrl : ingameTrack;
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
    // Ohne eigene Startmusik läuft im Menü die Spiel-Musik leiser.
    const base = this.current === 'menu' && !this.menuUrl ? 0.36 : 0.64;
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

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
