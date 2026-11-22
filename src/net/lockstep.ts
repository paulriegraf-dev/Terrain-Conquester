import type { Command, PlayerCommand } from '../sim/commands';
import { HASH_PARTS, combineParts, hashParts } from '../sim/hash';
import type { HashPart } from '../sim/hash';
import type { PlayerId } from '../sim/types';
import { otherPlayer } from '../sim/types';
import type { World } from '../sim/world';
import type { LockstepSnapshot, NetMsg } from './protocol';

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
  /** Laufzeit hin und zurück (ms): eigene geglättete Messung und der Spitzenwert, den der Gegner meldet. */
  rtt = 0;
  remoteRtt = 0;
  /** Letzte eigene Einzelmessungen (für den Spitzenwert). */
  private readonly samples: number[] = [];
  /** So viele Messungen in Folge wollten eine kleinere Verzögerung (Hysterese). */
  private lowerVotes = 0;
  static readonly PEAK_SAMPLES = 8;
  static readonly LOWER_AFTER = 5;
  /** Gemeinsame Pause (vom Host) – nach diesem Tick angehalten. */
  pausedAt: number | null = null;
  /** Abweichung entdeckt: nach diesem Tick unterschiedliche Fingerabdrücke. */
  desyncAt: number | null = null;
  /** Diagnose dazu (22.11.): Teil-Fingerabdrücke beider Seiten und welche Bereiche abweichen. */
  desync: DesyncInfo | null = null;

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
  /** Alle eigenen nicht leeren Eingaben, Pausen und Fortsetzungen – für das Nachsenden nach einem Abbruch. */
  private readonly sentLog = new Map<number, Command[]>();
  private readonly sentPauses = new Set<number>();
  private readonly resumeLog = new Set<number>();
  /** Zuletzt gerechneter Tick. */
  private lastTaken = -1;
  private readonly myHashes = new Map<number, string[]>();
  private readonly theirHashes = new Map<number, { h: string; p?: string[] }>();

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
    this.resumeLog.add(at);
    this.send({ k: 'resume', at });
  }

  /** Spitzenwert der eigenen letzten Messungen – Ausreißer zählen, damit die Verzögerung sie abfängt. */
  get peakRtt(): number {
    return this.samples.length ? Math.max(...this.samples) : this.rtt;
  }

  /** Verzögerung aus der langsameren Laufzeit (halbe Spitzen-Laufzeit in Ticks + 2 Puffer, 2–15). */
  wantedDelay(): number {
    const worst = Math.max(this.peakRtt, this.remoteRtt);
    return Math.max(2, Math.min(15, Math.ceil(worst / 2 / this.tickMs) + 2));
  }

  /**
   * Verzögerung nachführen (22.11.: mit Hysterese): Steigt der Bedarf, sofort hoch – sonst stockt das Spiel.
   * Runter erst, wenn LOWER_AFTER Messungen in Folge weniger wollen; so springt sie bei wackligem WLAN nicht.
   */
  private updateDelay(): void {
    const want = this.wantedDelay();
    if (want > this.delay) {
      this.delay = want;
      this.lowerVotes = 0;
    } else if (want < this.delay) {
      this.lowerVotes++;
      if (this.lowerVotes >= Lockstep.LOWER_AFTER) {
        this.delay = want;
        this.lowerVotes = 0;
      }
    } else {
      this.lowerVotes = 0;
    }
  }

  /** Eigene Eingaben bis (tick + delay) verschicken. Darf beliebig oft gerufen werden. */
  pump(tick: number): void {
    const want = tick + this.delay;
    if (this.sentUpTo >= want) return;
    const a = this.sentUpTo + 1;
    for (let t = a; t < want; t++) this.local.set(t, []);
    // 22.11.: einmal durch JSON wie die Befehle des Gegners – sonst führte dieser Rechner z. B. -0,
    // undefined-Felder oder NaN anders aus als der andere (dort kommen sie als 0, fehlend, null an).
    const c = this.pending.length ? (JSON.parse(JSON.stringify(this.pending)) as Command[]) : [];
    this.pending = [];
    this.local.set(want, c);
    if (c.length) this.sentLog.set(want, c);
    const msg: NetMsg = { k: 'f', a, b: want, c };
    if (this.pauseRequested) {
      msg.p = 1;
      this.pauseTicks.add(want);
      this.sentPauses.add(want);
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
    this.lastTaken = tick;
    // Feste Reihenfolge nach Spieler – world.step mischt danach fair.
    const first: PlayerId = 0;
    const lists: [PlayerId, Command[]][] = this.me === first ? [[this.me, mine], [otherPlayer(this.me), theirs]] : [[otherPlayer(this.me), theirs], [this.me, mine]];
    for (const [player, cmds] of lists) for (const cmd of cmds) out.push({ player, cmd });
    return out;
  }

  /** Nach dem Rechnen von `tick`: Fingerabdruck, Pause. */
  afterStep(tick: number, world: World): void {
    if (tick > 0 && tick % Lockstep.HASH_EVERY === 0) {
      const parts = hashParts(world);
      const p = HASH_PARTS.map((k) => parts[k]);
      this.myHashes.set(tick, p);
      this.send({ k: 'hash', t: tick, h: combineParts(p), p });
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
      case 'fs': {
        const frames = new Map(m.frames);
        for (let t = Math.max(m.a, this.lastTaken + 1); t <= m.b; t++) this.remote.set(t, frames.get(t) ?? []);
        for (const t of m.pauses) if (t > this.lastTaken) this.pauseTicks.add(t);
        for (const at of m.resumes) {
          this.resumed.add(at);
          this.pauseTicks.delete(at);
          if (this.pausedAt === at) this.pausedAt = null;
        }
        this.remoteUpTo = Math.max(this.remoteUpTo, m.b);
        break;
      }
      case 'resume':
        this.resumed.add(m.at);
        this.pauseTicks.delete(m.at);
        if (this.pausedAt === m.at) this.pausedAt = null;
        break;
      case 'hash':
        this.theirHashes.set(m.t, { h: m.h, p: m.p });
        this.compare(m.t);
        break;
      case 'ping':
        this.remoteRtt = m.rtt;
        this.send({ k: 'pong', ts: m.ts });
        this.updateDelay();
        break;
      case 'pong': {
        const sample = Math.max(0, now - m.ts);
        this.rtt = this.rtt === 0 ? sample : this.rtt * 0.7 + sample * 0.3;
        this.samples.push(sample);
        if (this.samples.length > Lockstep.PEAK_SAMPLES) this.samples.shift();
        this.updateDelay();
        break;
      }
      default:
        break;
    }
  }

  /** Bis hierher habe ich die Eingaben des Gegners (für „resync“ nach einem Abbruch). */
  get have(): number {
    return this.remoteUpTo;
  }

  /** Nach einem Abbruch: eigene Eingaben ab `have + 1` noch einmal (was unterwegs verloren ging). */
  resendFrom(have: number): NetMsg {
    const frames: [number, Command[]][] = [];
    for (const [t, c] of this.sentLog) if (t > have && t <= this.sentUpTo) frames.push([t, c]);
    return { k: 'fs', a: have + 1, b: this.sentUpTo, frames, pauses: [...this.sentPauses].filter((t) => t > have), resumes: [...this.resumeLog] };
  }

  /** Stand für den Wiedereinstieg des anderen (aus Sicht dieses Rechners). */
  snapshot(): LockstepSnapshot {
    return {
      sentUpTo: this.sentUpTo,
      remoteUpTo: this.remoteUpTo,
      local: [...this.local],
      remote: [...this.remote],
      pauseTicks: [...this.pauseTicks],
      resumed: [...this.resumed],
      pausedAt: this.pausedAt,
      delay: this.delay,
    };
  }

  /** Lockstep des Neuen aus dem Stand des anderen (Seiten getauscht) – weiter ab Tick `tick`. */
  static mirror(snap: LockstepSnapshot, me: PlayerId, isHost: boolean, send: (m: NetMsg) => void, tick: number): Lockstep {
    const ls = new Lockstep(me, isHost, send, snap.delay);
    ls.sentUpTo = snap.remoteUpTo;
    ls.remoteUpTo = snap.sentUpTo;
    for (const [t, c] of snap.remote) {
      ls.local.set(t, c);
      if (c.length) ls.sentLog.set(t, c);
    }
    for (const [t, c] of snap.local) ls.remote.set(t, c);
    for (const t of snap.pauseTicks) ls.pauseTicks.add(t);
    for (const t of snap.resumed) {
      ls.resumed.add(t);
      if (isHost) ls.resumeLog.add(t);
    }
    ls.pausedAt = snap.pausedAt;
    ls.lastTaken = tick - 1;
    return ls;
  }

  /** Laufzeit messen (etwa jede Sekunde). */
  ping(now: number): void {
    this.send({ k: 'ping', ts: now, rtt: Math.round(this.peakRtt) });
  }

  private compare(t: number): void {
    const a = this.myHashes.get(t);
    const b = this.theirHashes.get(t);
    if (a === undefined || b === undefined) return;
    this.myHashes.delete(t);
    this.theirHashes.delete(t);
    if (combineParts(a) === b.h || this.desyncAt !== null) return;
    this.desyncAt = t;
    const differ = b.p ? HASH_PARTS.filter((_, i) => a[i] !== b.p![i]) : [...HASH_PARTS];
    this.desync = { tick: t, mine: a, theirs: b.p ?? null, differ };
  }
}

/** Was bei einer Abweichung festgehalten wird (für die Diagnose-Datei). */
export interface DesyncInfo {
  /** Erster Prüf-Tick mit unterschiedlichem Fingerabdruck. */
  tick: number;
  /** Teil-Fingerabdrücke (Reihenfolge HASH_PARTS) – eigene und die des Gegners. */
  mine: string[];
  theirs: string[] | null;
  /** Bereiche, die abweichen. */
  differ: HashPart[];
}
