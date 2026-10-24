import type { NetMsg } from './protocol';

/**
 * Raum für zwei Spieler (Multiplayer, 24.10.).
 *
 * - **Online:** PeerJS (WebRTC, Browser zu Browser). Der Host meldet sich beim öffentlichen
 *   PeerJS-Vermittler unter `terrain-conquester-<CODE>` an, der Gast verbindet sich mit diesem Namen.
 *   Danach laufen die Daten direkt (oder über das TURN-Relais von PeerJS, wenn das Netz das verlangt).
 *   Die Bibliothek wird erst beim Öffnen eines Raums aus dem CDN geladen (feste Version).
 * - **Lokal (Test):** BroadcastChannel – zwei Tabs im selben Browser, ganz ohne Netz.
 */
export type RoomRole = 'host' | 'guest';
export type RoomStatus = 'connecting' | 'waiting' | 'connected' | 'closed' | 'error';

const PEER_PREFIX = 'terrain-conquester-';
const PEERJS_URLS = [
  'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
  'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
];

/** Nur die Teile von PeerJS, die wir brauchen. */
interface PeerConn {
  open: boolean;
  send(data: unknown): void;
  close(): void;
  on(ev: 'open' | 'close', cb: () => void): void;
  on(ev: 'data', cb: (data: unknown) => void): void;
  on(ev: 'error', cb: (err: { type?: string; message?: string }) => void): void;
}
interface PeerLike {
  on(ev: 'open', cb: (id: string) => void): void;
  on(ev: 'connection', cb: (conn: PeerConn) => void): void;
  on(ev: 'error', cb: (err: { type?: string; message?: string }) => void): void;
  on(ev: 'disconnected' | 'close', cb: () => void): void;
  connect(id: string, opts: { reliable: boolean; serialization: string }): PeerConn;
  reconnect(): void;
  destroy(): void;
  disconnected: boolean;
}
type PeerCtor = new (id?: string, opts?: Record<string, unknown>) => PeerLike;

let peerLoading: Promise<PeerCtor> | null = null;

function loadPeerJs(): Promise<PeerCtor> {
  const w = window as unknown as { Peer?: PeerCtor; peerjs?: { Peer?: PeerCtor; default?: PeerCtor } };
  const found = (): PeerCtor | undefined => w.Peer ?? w.peerjs?.Peer ?? w.peerjs?.default;
  if (found()) return Promise.resolve(found()!);
  peerLoading ??= new Promise<PeerCtor>((resolve, reject) => {
    const tryUrl = (i: number): void => {
      if (i >= PEERJS_URLS.length) {
        peerLoading = null;
        reject(new Error('Die Verbindungs-Bibliothek (PeerJS) ließ sich nicht laden – blockiert ein Werbeblocker oder fehlt das Internet?'));
        return;
      }
      const s = document.createElement('script');
      s.src = PEERJS_URLS[i]!;
      s.async = true;
      s.onload = () => (found() ? resolve(found()!) : tryUrl(i + 1));
      s.onerror = () => tryUrl(i + 1);
      document.head.appendChild(s);
    };
    tryUrl(0);
  });
  return peerLoading;
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

/** Online über PeerJS. */
export class PeerRoom extends Room {
  private peer: PeerLike | null = null;
  private conn: PeerConn | null = null;
  private closed = false;

  constructor(role: RoomRole, code: string, events: RoomEvents) {
    super(role, code, events);
    void this.open();
  }

  private async open(): Promise<void> {
    let Peer: PeerCtor;
    try {
      Peer = await loadPeerJs();
    } catch (e) {
      this.setStatus('error', (e as Error).message);
      return;
    }
    if (this.closed) return;
    const peer = this.role === 'host' ? new Peer(PEER_PREFIX + this.code, { debug: 0 }) : new Peer(undefined, { debug: 0 });
    this.peer = peer;
    peer.on('error', (err) => {
      if (this.closed) return;
      const type = err?.type ?? '';
      const text =
        type === 'unavailable-id' ? 'Diesen Raum-Code gibt es schon – bitte einen neuen Raum erstellen.' :
        type === 'peer-unavailable' ? 'Kein Raum mit diesem Code gefunden (oder der Host ist nicht mehr da).' :
        type === 'network' || type === 'server-error' || type === 'socket-error' ? 'Der Vermittlungsdienst ist nicht erreichbar – Internet prüfen und erneut versuchen.' :
        type === 'browser-incompatible' ? 'Dieser Browser kann keine direkte Verbindung (WebRTC).' :
        `Verbindungsfehler: ${err?.message ?? type}`;
      if (this.conn?.open && (type === 'network' || type === 'server-error' || type === 'socket-error')) return; // Vermittler weg, Verbindung steht noch
      this.setStatus('error', text);
    });
    peer.on('disconnected', () => {
      // Nur der Draht zum Vermittler – die Spiel-Verbindung läuft direkt weiter. Für neue Gäste neu anmelden.
      if (!this.closed && this.role === 'host' && !this.conn?.open) peer.reconnect();
    });
    peer.on('open', () => {
      if (this.role === 'host') {
        this.setStatus('waiting');
        return;
      }
      this.attach(peer.connect(PEER_PREFIX + this.code, { reliable: true, serialization: 'json' }));
    });
    if (this.role === 'host') {
      peer.on('connection', (conn) => {
        if (this.conn?.open) {
          // Raum ist voll.
          conn.on('open', () => conn.close());
          return;
        }
        this.attach(conn);
      });
    }
  }

  private attach(conn: PeerConn): void {
    this.conn = conn;
    conn.on('open', () => this.setStatus('connected'));
    conn.on('data', (data) => {
      if (data && typeof data === 'object' && 'k' in (data as object)) this.events.message(data as NetMsg);
    });
    conn.on('close', () => {
      if (this.conn !== conn || this.closed) return;
      this.conn = null;
      this.setStatus('closed', 'Die Verbindung zum Mitspieler ist abgebrochen.');
    });
    conn.on('error', (err) => {
      if (!this.closed) this.setStatus('error', `Verbindungsfehler: ${err?.message ?? err?.type ?? ''}`);
    });
  }

  send(m: NetMsg): void {
    if (this.conn?.open) this.conn.send(m);
  }

  close(): void {
    this.closed = true;
    try {
      this.conn?.close();
      this.peer?.destroy();
    } catch {
      /* egal */
    }
  }
}

/** Lokal zum Testen: zwei Tabs im selben Browser (BroadcastChannel). */
export class LocalRoom extends Room {
  private readonly channel: BroadcastChannel;
  private readonly me = Math.random().toString(36).slice(2);
  private peerId: string | null = null;
  private closed = false;
  private helloTimer = 0;

  constructor(role: RoomRole, code: string, events: RoomEvents) {
    super(role, code, events);
    this.channel = new BroadcastChannel(`terrain-conquester-${code}`);
    this.channel.onmessage = (ev: MessageEvent) => this.onRaw(ev.data as { from: string; to?: string; kind: string; m?: NetMsg });
    queueMicrotask(() => {
      if (role === 'host') this.setStatus('waiting');
      else {
        const knock = (): void => {
          if (this.peerId || this.closed) return;
          this.channel.postMessage({ from: this.me, kind: 'knock' });
          this.helloTimer = window.setTimeout(knock, 500);
        };
        knock();
      }
    });
  }

  private onRaw(d: { from: string; to?: string; kind: string; m?: NetMsg }): void {
    if (this.closed || d.from === this.me || (d.to && d.to !== this.me)) return;
    if (d.kind === 'knock' && this.role === 'host') {
      if (this.peerId && this.peerId !== d.from) return; // voll
      const first = !this.peerId;
      this.peerId = d.from;
      this.channel.postMessage({ from: this.me, to: d.from, kind: 'welcome' });
      if (first) this.setStatus('connected');
      return;
    }
    if (d.kind === 'welcome' && this.role === 'guest' && !this.peerId) {
      this.peerId = d.from;
      clearTimeout(this.helloTimer);
      this.setStatus('connected');
      return;
    }
    if (d.kind === 'bye' && d.from === this.peerId) {
      this.peerId = null;
      this.setStatus('closed', 'Der andere Tab hat den Raum verlassen.');
      return;
    }
    if (d.kind === 'msg' && d.from === this.peerId && d.m) this.events.message(d.m);
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
