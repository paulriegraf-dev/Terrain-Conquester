import type { Command, PlayerCommand } from '../sim/commands';
import { hashWorld } from '../sim/hash';
import type { PlayerId } from '../sim/types';
import { otherPlayer } from '../sim/types';
import type { World } from '../sim/world';
import type { NetMsg } from './protocol';

/**
 * Lockstep (Multiplayer, 24.10.): Beide Rechner rechnen dasselbe Spiel. Jeder schickt seine Befehle
 * für einen Tick, der `delay` Ticks in der Zukunft liegt; ein Tick läuft erst, wenn die Eingaben
 * beider Seiten für ihn da sind. Weil die Simulation deterministisch ist, bleiben beide gleich.
 *
 * - **Verzögerung nach dem Langsameren:** Beide messen die Laufzeit und schicken sie mit; die
 *   Verzögerung richtet sich nach der größeren (halbe Laufzeit + 2 Ticks Puffer).
 * - **Lücken:** Wer die Verzögerung erhöht, schickt die Ticks dazwischen als leere Eingaben mit;
 *   wer sie senkt, schickt einfach ein paar Ticks lang nichts Neues.
 * - **Pause (nur der Host):** steht in seiner Eingabe für Tick X – beide halten nach Tick X an.
 *   Fortsetzen nennt denselben Tick, damit ein Rechner, der noch zurückliegt, gar nicht erst anhält.
 * - **Synchron-Prüfung:** alle 2 Sekunden ein Fingerabdruck (hashWorld) – weicht er ab, meldet das Spiel es.
 */
export class Lockstep {
  /** Eigene Eingabeverzögerung in Ticks. */
  delay: number;
  /** Laufzeit hin und zurück (ms), eigene Messung und die des Gegners. */
  rtt = 0;
  remoteRtt = 0;
  /** Gemeinsame Pause (vom Host) – nach diesem Tick angehalten. */
  pausedAt: number | null = null;
  /** Abweichung entdeckt: nach diesem Tick unterschiedliche Fingerabdrücke. */
  desyncAt: number | null = null;

  private sentUpTo: number;
  private remoteUpTo: number;
  private readonly local = new Map<number, Command[]>();
  private readonly remote = new Map<number, Command[]>();
  /** Nach diesen Ticks anhalten (Pause des Hosts). */
  private readonly pauseTicks = new Set<number>();
  /** Schon fortgesetzte Pausen (falls „weiter“ vor dem Anhalten ankommt). */
  private readonly resumed = new Set<number>();
  private pending: Command[] = [];
  private pauseRequested = false;
  private readonly myHashes = new Map<number, string>();
  private readonly theirHashes = new Map<number, string>();

  static readonly HASH_EVERY = 40;

  constructor(
    readonly me: PlayerId,
    readonly isHost: boolean,
    private readonly send: (m: NetMsg) => void,
    startDelay: number,
    private readonly tickMs = 50,
  ) {
    this.delay = Math.max(1, startDelay);
    // Die ersten Ticks (unter der Start-Verzögerung) sind für beide leer.
    this.sentUpTo = this.delay - 1;
    this.remoteUpTo = this.delay - 1;
  }

  get paused(): boolean {
    return this.pausedAt !== null;
  }

  /** Eigener Befehl – geht mit der nächsten Eingabe raus. */
  issue(cmd: Command): void {
    this.pending.push(cmd);
  }

  /** Host: Pause anfordern (greift nach der Eingabeverzögerung bei beiden). */
  requestPause(): void {
    if (this.isHost && !this.paused) this.pauseRequested = true;
  }

  /** Host: Pause aufheben. */
  resume(): void {
    if (!this.isHost || this.pausedAt === null) return;
    const at = this.pausedAt;
    this.pausedAt = null;
    this.send({ k: 'resume', at });
  }

  /** Verzögerung aus der langsameren Laufzeit (halbe Laufzeit in Ticks + 2 Puffer, 2–15). */
  wantedDelay(): number {
    const worst = Math.max(this.rtt, this.remoteRtt);
    return Math.max(2, Math.min(15, Math.ceil(worst / 2 / this.tickMs) + 2));
  }

  /** Eigene Eingaben bis (tick + delay) verschicken. Darf beliebig oft gerufen werden. */
  pump(tick: number): void {
    const want = tick + this.delay;
    if (this.sentUpTo >= want) return;
    const a = this.sentUpTo + 1;
    for (let t = a; t < want; t++) this.local.set(t, []);
    const c = this.pending;
    this.pending = [];
    this.local.set(want, c);
    const msg: NetMsg = { k: 'f', a, b: want, c };
    if (this.pauseRequested) {
      msg.p = 1;
      this.pauseTicks.add(want);
      this.pauseRequested = false;
    }
    this.sentUpTo = want;
    this.send(msg);
  }

  /** Darf Tick `tick` gerechnet werden (Eingaben beider da, keine Pause)? */
  canStep(tick: number): boolean {
    return !this.paused && tick <= this.remoteUpTo && tick <= this.sentUpTo;
  }

  /** Befehle beider Seiten für diesen Tick (und aus dem Speicher nehmen). */
  take(tick: number): PlayerCommand[] {
    const out: PlayerCommand[] = [];
    const mine = this.local.get(tick) ?? [];
    const theirs = this.remote.get(tick) ?? [];
    this.local.delete(tick);
    this.remote.delete(tick);
    // Feste Reihenfolge nach Spieler – world.step mischt danach fair.
    const first: PlayerId = 0;
    const lists: [PlayerId, Command[]][] = this.me === first ? [[this.me, mine], [otherPlayer(this.me), theirs]] : [[otherPlayer(this.me), theirs], [this.me, mine]];
    for (const [player, cmds] of lists) for (const cmd of cmds) out.push({ player, cmd });
    return out;
  }

  /** Nach dem Rechnen von `tick`: Fingerabdruck, Pause. */
  afterStep(tick: number, world: World): void {
    if (tick > 0 && tick % Lockstep.HASH_EVERY === 0) {
      const h = hashWorld(world);
      this.myHashes.set(tick, h);
      this.send({ k: 'hash', t: tick, h });
      this.compare(tick);
    }
    if (this.pauseTicks.has(tick)) {
      this.pauseTicks.delete(tick);
      if (!this.resumed.has(tick)) this.pausedAt = tick;
    }
  }

  onMessage(m: NetMsg, now: number): void {
    switch (m.k) {
      case 'f': {
        for (let t = m.a; t < m.b; t++) this.remote.set(t, []);
        this.remote.set(m.b, m.c);
        if (m.p) this.pauseTicks.add(m.b);
        this.remoteUpTo = Math.max(this.remoteUpTo, m.b);
        break;
      }
      case 'resume':
        this.resumed.add(m.at);
        this.pauseTicks.delete(m.at);
        if (this.pausedAt === m.at) this.pausedAt = null;
        break;
      case 'hash':
        this.theirHashes.set(m.t, m.h);
        this.compare(m.t);
        break;
      case 'ping':
        this.remoteRtt = m.rtt;
        this.send({ k: 'pong', ts: m.ts });
        this.delay = this.wantedDelay();
        break;
      case 'pong': {
        const sample = Math.max(0, now - m.ts);
        this.rtt = this.rtt === 0 ? sample : this.rtt * 0.7 + sample * 0.3;
        this.delay = this.wantedDelay();
        break;
      }
      default:
        break;
    }
  }

  /** Laufzeit messen (etwa jede Sekunde). */
  ping(now: number): void {
    this.send({ k: 'ping', ts: now, rtt: Math.round(this.rtt) });
  }

  private compare(t: number): void {
    const a = this.myHashes.get(t);
    const b = this.theirHashes.get(t);
    if (a === undefined || b === undefined) return;
    this.myHashes.delete(t);
    this.theirHashes.delete(t);
    if (a !== b && this.desyncAt === null) this.desyncAt = t;
  }
}
