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

/**
 * Eine laufende Partie aus Sicht der Oberfläche: die Welt plus wer Befehle gibt.
 * - play:   du gegen die KI (du links oder – auf Wunsch – rechts)
 * - demo:   KI gegen KI im Hintergrund des Startbildschirms
 * - replay: spielt eine Partie nur aus Seed + Befehlsliste nach
 */
export class Session {
  readonly world: World;
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
          : [new SimpleAi(otherPlayer(human), aiSeed(seed, otherPlayer(human)), level)];
      // Die KI bereitet ihr Gelände sofort vor (im Nebel); du danach in Ruhe.
      this.world.prepare(this.ais.flatMap((ai) => ai.prepare(this.world).map((cmd) => ({ player: ai.player, cmd }))));
      this.prepActive = mode === 'play';
    }
  }

  /** Vorbereitung: eine Gelände-Platzierung sofort ausführen (nur vor dem ersten Tick). */
  prepPlace(cmd: Command): void {
    if (this.prepActive) this.world.prepare([{ player: this.human, cmd }]);
  }

  /** Vorbereitung beenden – die Runde beginnt. */
  finishPrep(): void {
    this.prepActive = false;
  }

  /** Befehl des menschlichen Spielers – wird im nächsten Tick ausgeführt. */
  issue(cmd: Command): void {
    if (this.mode === 'play' && !this.world.result) this.pending.push(cmd);
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
