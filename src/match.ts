import type { FactionId } from './data/factions';
import { SimpleAi } from './ai/simpleAi';
import type { AiLevel, AiStrategyId } from './ai/simpleAi';
import type { PlayerCommand, TimedCommand } from './sim/commands';
import type { MapDef } from './sim/map';
import type { PlayerId } from './sim/types';
import type { Rules } from './data/rules';
import { World } from './sim/world';

/**
 * Hilfsfunktionen, um ganze Partien ohne Bildschirm laufen zu lassen
 * (Tests, Balance-Skript, Replays).
 */

export interface AiMatchOptions {
  map: MapDef;
  seed: number;
  level?: AiLevel;
  strategies?: [AiStrategyId?, AiStrategyId?];
  maxTicks?: number;
  /** Regeln überschreiben (z. B. um Balance-Varianten zu vergleichen). */
  rules?: Partial<Rules>;
  factions?: [FactionId, FactionId];
}

/** Zwei KIs gegeneinander, bis die Runde endet. */
export function runAiMatch(options: AiMatchOptions): { world: World; ais: [SimpleAi, SimpleAi] } {
  const world = new World({ map: options.map, seed: options.seed, rules: options.rules, factions: options.factions });
  const level = options.level ?? 'normal';
  const ais: [SimpleAi, SimpleAi] = [
    new SimpleAi(0, aiSeed(options.seed, 0), level, options.strategies?.[0]),
    new SimpleAi(1, aiSeed(options.seed, 1), level, options.strategies?.[1]),
  ];
  // Vorbereitungsphase: beide KIs formen ihr Gelände vor dem ersten Tick.
  world.prepare(ais.flatMap((ai) => ai.prepare(world).map((cmd) => ({ player: ai.player, cmd }))));
  // Kein Spiel-Zeitlimit – nur ein Sicherheitsnetz für automatische Läufe (45 Minuten).
  const maxTicks = options.maxTicks ?? 30 * 60 * world.tps;
  while (!world.result && world.tick < maxTicks) {
    const commands: PlayerCommand[] = [];
    for (const ai of ais) for (const cmd of ai.think(world)) commands.push({ player: ai.player, cmd });
    world.step(commands);
  }
  return { world, ais };
}

/** Eigener Seed pro KI, abgeleitet vom Partie-Seed. */
export function aiSeed(matchSeed: number, player: PlayerId): number {
  return (Math.imul(matchSeed ^ 0x5bd1e995, player === 0 ? 0x27d4eb2f : 0x165667b1) >>> 0) || 1;
}

/** Spielt eine Partie nur aus Seed + Befehlsliste nach. */
export class ReplayRunner {
  readonly world: World;
  private readonly log: readonly TimedCommand[];
  private cursor = 0;

  constructor(
    map: MapDef,
    seed: number,
    log: readonly TimedCommand[],
    factions?: [FactionId, FactionId],
    rules?: Partial<Rules>,
  ) {
    this.world = new World({ map, seed, factions, rules });
    // Wie in der Partie (Session): Vorbereitungs-Flächen vor dem ersten Tick in Log-Reihenfolge anwenden – im ersten
    // Schritt würden sie nach Spielern sortiert, und überlappende Flächen gingen anders aus (Replay lief auseinander).
    const prep = log.filter((c) => c.tick === 0 && c.cmd.type === 'prepTerrain');
    this.world.prepare(prep.map((c) => ({ player: c.player, cmd: c.cmd })));
    this.log = log.filter((c) => !(c.tick === 0 && c.cmd.type === 'prepTerrain'));
  }

  step(): void {
    const commands: PlayerCommand[] = [];
    while (this.cursor < this.log.length && this.log[this.cursor]!.tick === this.world.tick) {
      const c = this.log[this.cursor++]!;
      commands.push({ player: c.player, cmd: c.cmd });
    }
    this.world.step(commands);
  }
}
