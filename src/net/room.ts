import { Peer } from 'peerjs';
import { Room, isStale } from './roomBase';
import type { RoomEvents, RoomRole } from './roomBase';
import type { NetMsg } from './protocol';

export * from './roomBase';

/** Nach einem Abbruch versucht der Gast es so oft wieder (alle 2,5 s, gut 3 Minuten). */
const RETRY_MS = 2500;
const RETRY_MAX = 80;

const PEER_PREFIX = 'terrain-conquester-';

/** Gast: so lange (ms) ohne Daten → Verbindung gilt als tot, neu verbinden (der Host ersetzt dann die alte). */
const GUEST_DEAD_MS = 8000;

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

/** PeerJS ist fest eingebaut (18.11.) – kein Nachladen aus dem CDN, das Werbeblocker oder Ausfälle verhindern könnten. */
function loadPeerJs(): Promise<PeerCtor> {
  return Promise.resolve(Peer as unknown as PeerCtor);
}

/** Online über PeerJS. */
export class PeerRoom extends Room {
  private peer: PeerLike | null = null;
  private conn: PeerConn | null = null;
  private closed = false;
  /** Gast: nach einem Abbruch immer wieder verbinden. */
  private retries = 0;
  private retryTimer = 0;
  /** Host: Anmeldeversuche mit demselben Code (nach Neuladen ist der alte Name kurz noch belegt). */
  private hostTries = 0;
  /** Zuletzt Daten über die aktuelle Verbindung bekommen (performance.now). */
  private lastDataAt = 0;
  private watchdog = 0;

  constructor(role: RoomRole, code: string, events: RoomEvents) {
    super(role, code, events);
    void this.open();
  }

  /** Gast: neuer Verbindungsversuch zum Host (nach einem Abbruch). */
  private retry(): void {
    if (this.closed || this.role !== 'guest' || this.conn?.open) return;
    if (this.retries++ >= RETRY_MAX) {
      this.setStatus('error', 'Der Mitspieler kommt nicht zurück.');
      return;
    }
    const peer = this.peer;
    if (!peer) return;
    if (peer.disconnected) peer.reconnect();
    this.attach(peer.connect(PEER_PREFIX + this.code, { reliable: true, serialization: 'json' }));
    clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.retry(), RETRY_MS);
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
      // Host lädt neu: Der alte Name ist kurz noch belegt – noch einmal versuchen.
      if (type === 'unavailable-id' && this.role === 'host' && this.hostTries++ < 10) {
        peer.destroy();
        window.setTimeout(() => void this.open(), 2000);
        return;
      }
      // Gast wartet auf die Rückkehr des Hosts: „nicht gefunden“ ist dann normal.
      if (type === 'peer-unavailable' && this.retries > 0) return;
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
        if (this.conn?.open && !isStale(this.lastDataAt, performance.now())) {
          // Raum ist voll.
          conn.on('open', () => conn.close());
          return;
        }
        // Alte, still gestorbene Verbindung ersetzen (ihr spätes `close` wird ignoriert: this.conn !== alte).
        const old = this.conn;
        this.attach(conn);
        try {
          old?.close();
        } catch {
          /* egal */
        }
      });
    }
  }

  private attach(conn: PeerConn): void {
    this.conn = conn;
    this.lastDataAt = performance.now();
    conn.on('open', () => {
      if (this.conn !== conn) return;
      this.lastDataAt = performance.now();
      this.retries = 0;
      clearTimeout(this.retryTimer);
      this.setStatus('connected');
      if (this.role === 'guest') {
        clearInterval(this.watchdog);
        this.watchdog = window.setInterval(() => this.checkAlive(conn), 2000);
      }
    });
    conn.on('data', (data) => {
      if (this.conn !== conn) return; // ersetzte Verbindung
      this.lastDataAt = performance.now();
      if (data && typeof data === 'object' && 'k' in (data as object)) this.events.message(data as NetMsg);
    });
    conn.on('close', () => {
      if (this.conn !== conn || this.closed) return;
      const wasOpen = this.status === 'connected';
      this.conn = null;
      if (wasOpen) this.setStatus('closed', 'Die Verbindung zum Mitspieler ist abgebrochen.');
      if (this.role === 'guest') {
        clearTimeout(this.retryTimer);
        this.retryTimer = window.setTimeout(() => this.retry(), wasOpen ? 500 : RETRY_MS);
      }
    });
    conn.on('error', (err) => {
      if (this.closed || this.conn !== conn) return;
      if (this.role === 'guest' && this.retries > 0) return; // Wiederholung läuft
      this.setStatus('error', `Verbindungsfehler: ${err?.message ?? err?.type ?? ''}`);
    });
  }

  /** Gast (22.11.): Kommt über eine offene Verbindung lange nichts, ist sie still gestorben – neu verbinden. */
  private checkAlive(conn: PeerConn): void {
    if (this.closed || this.conn !== conn) {
      if (this.conn !== conn) clearInterval(this.watchdog);
      return;
    }
    if (performance.now() - this.lastDataAt <= GUEST_DEAD_MS) return;
    clearInterval(this.watchdog);
    this.conn = null;
    try {
      conn.close();
    } catch {
      /* egal */
    }
    this.setStatus('closed', 'Die Verbindung zum Mitspieler ist abgebrochen.');
    clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => this.retry(), 300);
  }

  send(m: NetMsg): void {
    if (this.conn?.open) this.conn.send(m);
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.retryTimer);
    clearInterval(this.watchdog);
    try {
      this.conn?.close();
      this.peer?.destroy();
    } catch {
      /* egal */
    }
  }
}
