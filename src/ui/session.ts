import { SimpleAi } from '../ai/simpleAi';
import type { AiLevel } from '../ai/simpleAi';
import { getMap } from '../data/maps';
import { ReplayRunner, aiSeed } from '../match';
import type { Command, PlayerCommand, TimedCommand } from '../sim/commands';
import { World } from '../sim/world';
import type { FactionId } from '../data/factions';
import { overtimeRules } from '../data/rules';
import type { OvertimeVariant } from '../data/rules';
import type { Mode } from './view';
import type { PlayerId } from '../sim/types';
import { otherPlayer } from '../sim/types';
import type { Lockstep } from '../net/lockstep';

/**
 * Eine laufende Partie aus Sicht der Oberfläche: die Welt plus wer Befehle gibt.
 * - play:   du gegen die KI (du links oder – auf Wunsch – rechts)
 * - demo:   KI gegen KI im Hintergrund des Startbildschirms
 * - replay: spielt eine Partie nur aus Seed + Befehlsliste nach
 *
 * Multiplayer (24.10.): Modus 'play' mit `lockstep` – kein KI-Gegner, die Befehle des Gegners kommen
 * über die Leitung. Die Vorbereitung läuft verdeckt: Jeder formt in seiner eigenen Welt; sind beide
 * bereit, wird die Welt neu aufgebaut und bekommt die Platzierungen beider (gleiche Reihenfolge).
 */
export class Session {
  world: World;
  readonly ais: SimpleAi[];
  private readonly replay: ReplayRunner | null;
  private pending: Command[] = [];
  /** Vorbereitungsphase: Die Runde steht, bis der Spieler „Bereit“ drückt. */
  prepActive = false;

  constructor(
    readonly mode: Mode,
    readonly mapId: string,
    readonly seed: number,
    readonly level: AiLevel,
    readonly factions: [FactionId, FactionId] = ['technoclan', 'technoclan'],
    log?: readonly TimedCommand[],
    /** Patt-Auflöser zum Ausprobieren (Standard: aus). */
    readonly overtime: OvertimeVariant = 'off',
    /** Deine Seite (0 = links, 1 = rechts) – auf asymmetrischen Karten ein Unterschied. */
    readonly human: PlayerId = 0,
    /** Multiplayer: Lockstep zum Gegner (dann kein KI-Gegner). */
    readonly lockstep: Lockstep | null = null,
  ) {
    const map = getMap(mapId);
    const rules = overtimeRules(overtime);
    if (mode === 'replay') {
      this.replay = new ReplayRunner(map, seed, log ?? [], factions, rules);
      this.world = this.replay.world;
      this.ais = [];
    } else {
      this.replay = null;
      this.world = new World({ map, seed, factions, rules });
      this.ais =
        mode === 'demo'
          ? [new SimpleAi(0, aiSeed(seed, 0)), new SimpleAi(1, aiSeed(seed, 1))]
          : lockstep
            ? []
            : [new SimpleAi(otherPlayer(human), aiSeed(seed, otherPlayer(human)), level)];
      // Die KI bereitet ihr Gelände sofort vor (im Nebel); du danach in Ruhe.
      this.world.prepare(this.ais.flatMap((ai) => ai.prepare(this.world).map((cmd) => ({ player: ai.player, cmd }))));
      this.prepActive = mode === 'play';
    }
  }

  /** Multiplayer: eigene und gegnerische Vorbereitung (null = noch nicht bereit). */
  private readonly myPrep: Command[] = [];
  myPrepDone = false;
  theirPrep: Command[] | null = null;

  /** Vorbereitung: eine Gelände-Platzierung sofort ausführen (nur vor dem ersten Tick). */
  prepPlace(cmd: Command): void {
    if (!this.prepActive || this.myPrepDone) return;
    const before = this.world.players[this.human].prepLeft;
    this.world.prepare([{ player: this.human, cmd }]);
    if (this.world.players[this.human].prepLeft < before) this.myPrep.push(cmd);
  }

  /**
   * Vorbereitung beenden. Gegen die KI beginnt die Runde sofort. Im Multiplayer: Rückgabe = eigene
   * Platzierungen zum Verschicken; die Runde beginnt, wenn auch der Gegner bereit ist (`receivePrep`).
   */
  finishPrep(): Command[] {
    if (!this.lockstep) {
      this.prepActive = false;
      return [];
    }
    this.myPrepDone = true;
    this.maybeBeginOnline();
    return [...this.myPrep];
  }

  /** Multiplayer: Der Gegner ist mit der Vorbereitung fertig. */
  receivePrep(cmds: Command[]): void {
    this.theirPrep = cmds;
    this.maybeBeginOnline();
  }

  /** Beide bereit: Welt neu aufbauen – mit den Platzierungen beider, links zuerst. */
  private maybeBeginOnline(): void {
    if (!this.prepActive || !this.myPrepDone || !this.theirPrep) return;
    const world = new World({ map: getMap(this.mapId), seed: this.seed, factions: this.factions, rules: overtimeRules(this.overtime) });
    const me = this.myPrep.map((cmd) => ({ player: this.human, cmd }));
    const them = this.theirPrep.map((cmd) => ({ player: otherPlayer(this.human), cmd }));
    world.prepare(this.human === 0 ? [...me, ...them] : [...them, ...me]);
    this.world = world;
    this.prepActive = false;
  }

  /** Befehl des menschlichen Spielers – wird im nächsten Tick ausgeführt. */
  issue(cmd: Command): void {
    if (this.mode !== 'play' || this.world.result) return;
    if (this.lockstep) this.lockstep.issue(cmd);
    else this.pending.push(cmd);
  }

  /**
   * Einen Tick rechnen, wenn möglich. Im Multiplayer nur, wenn die Eingaben beider Seiten für
   * diesen Tick da sind (sonst false – die Schleife wartet).
   */
  tryStep(): boolean {
    const ls = this.lockstep;
    if (!ls) {
      this.step();
      return true;
    }
    const tick = this.world.tick;
    ls.pump(tick);
    if (!ls.canStep(tick)) return false;
    this.world.step(ls.take(tick));
    ls.afterStep(tick, this.world);
    return true;
  }

  step(): void {
    if (this.replay) {
      this.replay.step();
      return;
    }
    const commands: PlayerCommand[] = this.pending.map((cmd) => ({ player: this.human, cmd }));
    this.pending = [];
    for (const ai of this.ais) for (const cmd of ai.think(this.world)) commands.push({ player: ai.player, cmd });
    this.world.step(commands);
  }
}
