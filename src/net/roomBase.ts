import type { NetMsg } from './protocol';

/**
 * Raum für zwei Spieler (Multiplayer, 24.10.).
 *
 * - **Online:** PeerJS (WebRTC, Browser zu Browser). Der Host meldet sich beim öffentlichen
 *   PeerJS-Vermittler unter `terrain-conquester-<CODE>` an, der Gast verbindet sich mit diesem Namen.
 *   Danach laufen die Daten direkt (oder über das TURN-Relais von PeerJS, wenn das Netz das verlangt).
 *   Die Bibliothek (feste Version 1.5.4) ist ins Spiel eingebaut.
 * - **Lokal (Test):** BroadcastChannel – zwei Tabs im selben Browser, ganz ohne Netz.
 */
export type RoomRole = 'host' | 'guest';
export type RoomStatus = 'connecting' | 'waiting' | 'connected' | 'closed' | 'error';
/**
 * Halbtote Verbindung (22.11.): Im Spiel kommt mindestens jede Sekunde ein Ping. Kam über die bestehende
 * Verbindung so lange nichts, darf ein neu anklopfender Mitspieler sie ersetzen – statt „Raum voll“, bis
 * WebRTC das alte `close` meldet (bis ~30 s, z. B. nach WLAN → Mobilfunk).
 */
export const STALE_MS = 5000;
export function isStale(lastDataAt: number, now: number): boolean {
  return now - lastDataAt > STALE_MS;
}

/** Raum-Code: 5 Zeichen ohne leicht verwechselbare (0/O, 1/I/L). */
export function newRoomCode(): string {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

export interface RoomEvents {
  status: (s: RoomStatus, detail?: string) => void;
  message: (m: NetMsg) => void;
}

export abstract class Room {
  status: RoomStatus = 'connecting';
  constructor(
    readonly role: RoomRole,
    readonly code: string,
    protected readonly events: RoomEvents,
  ) {}
  abstract send(m: NetMsg): void;
  abstract close(): void;
  protected setStatus(s: RoomStatus, detail?: string): void {
    this.status = s;
    this.events.status(s, detail);
  }
}

/** Lokal zum Testen: zwei Tabs im selben Browser (BroadcastChannel). */
export class LocalRoom extends Room {
  private readonly channel: BroadcastChannel;
  private readonly me = Math.random().toString(36).slice(2);
  private peerId: string | null = null;
  private closed = false;
  private helloTimer = 0;
  private lastDataAt = 0;

  constructor(role: RoomRole, code: string, events: RoomEvents) {
    super(role, code, events);
    this.channel = new BroadcastChannel(`terrain-conquester-${code}`);
    this.channel.onmessage = (ev: MessageEvent) => this.onRaw(ev.data as { from: string; to?: string; kind: string; m?: NetMsg });
    queueMicrotask(() => {
      if (role === 'host') this.setStatus('waiting');
      else this.knock();
    });
  }

  private knock(): void {
    if (this.peerId || this.closed) return;
    this.channel.postMessage({ from: this.me, kind: 'knock' });
    this.helloTimer = window.setTimeout(() => this.knock(), 500);
  }

  private onRaw(d: { from: string; to?: string; kind: string; m?: NetMsg }): void {
    if (this.closed || d.from === this.me || (d.to && d.to !== this.me)) return;
    if (d.kind === 'knock' && this.role === 'host') {
      if (this.peerId && this.peerId !== d.from && !isStale(this.lastDataAt, performance.now())) return; // voll
      const first = !this.peerId || this.peerId !== d.from;
      this.lastDataAt = performance.now();
      this.peerId = d.from;
      this.channel.postMessage({ from: this.me, to: d.from, kind: 'welcome' });
      if (first) this.setStatus('connected');
      return;
    }
    if (d.kind === 'welcome' && this.role === 'guest' && !this.peerId) {
      this.peerId = d.from;
      this.lastDataAt = performance.now();
      clearTimeout(this.helloTimer);
      this.setStatus('connected');
      return;
    }
    if (d.kind === 'bye' && d.from === this.peerId) {
      this.peerId = null;
      this.setStatus('closed', 'Die Verbindung zum anderen Tab ist abgebrochen.');
      if (this.role === 'guest') this.knock(); // auf die Rückkehr des Hosts warten
      return;
    }
    if (d.kind === 'msg' && d.from === this.peerId && d.m) {
      this.lastDataAt = performance.now();
      this.events.message(d.m);
    }
  }

  send(m: NetMsg): void {
    if (this.peerId) this.channel.postMessage({ from: this.me, to: this.peerId, kind: 'msg', m });
  }

  close(): void {
    if (this.closed) return;
    if (this.peerId) this.channel.postMessage({ from: this.me, to: this.peerId, kind: 'bye' });
    this.closed = true;
    clearTimeout(this.helloTimer);
    this.channel.close();
  }
}
