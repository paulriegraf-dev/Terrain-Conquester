import { RULES } from '../src/data/rules';
import type { Rules } from '../src/data/rules';
import type { MapDef } from '../src/sim/map';
import type { PlayerCommand } from '../src/sim/commands';
import type { World } from '../src/sim/world';
import type { Entity } from '../src/sim/entity';

/**
 * Kleine Testkarten (linke Hälfte, wird gespiegelt → 20 Kacheln breit).
 *
 * open:  Fels bei x=7 (y 2–4) für Sichtlinien-Tests, sonst offen.
 *        Bauzonen: x 0–5 Basis, x 6–8 Vorfeld, x 9 keine.
 * choke: Felssäule bei x=8 mit nur 3 Kacheln Durchgang → Erdwall-Sperr-Test.
 */
export const openMap: MapDef = {
  id: 'test-open',
  name: 'Test offen',
  description: '',
  waypointsY: { top: 0.5, mid: 4.5, bottom: 8.5 },
  halfRows: [
    '..........',
    '..........',
    '.......#..',
    'HHH....#..',
    'HHH....#..',
    'HHH.......',
    '..........',
    '..........',
    '..........',
  ],
  zoneRows: Array.from({ length: 9 }, () => 'BBBBBBVVV.'),
};

export const chokeMap: MapDef = {
  id: 'test-choke',
  name: 'Test Engpass',
  description: '',
  waypointsY: { top: 0.5, mid: 3.5, bottom: 6.5 },
  halfRows: [
    '........#.',
    '........#.',
    'HHH.......',
    'HHH.......',
    'HHH.......',
    '........#.',
    '........#.',
  ],
  zoneRows: Array.from({ length: 7 }, () => 'BBBBBBBBBB'),
};

/** Kleinere Basis-Gebiete, damit sich die HQs auf den kleinen Testkarten nicht überlappen. */
export const smallBases: Partial<Rules> = { influence: { ...RULES.influence, hqRadius: 8 } };

/** Kein Einkommen – weder Grundeinkommen noch Gebietseinkommen. */
export const noIncome: Partial<Rules> = { energyPerSecond: 0, front: { ...RULES.front, territoryIncome: 0 } };

/** Befehl von Spieler p für den nächsten Tick. */
export function cmd(player: 0 | 1, command: PlayerCommand['cmd']): PlayerCommand {
  return { player, cmd: command };
}

/** Freier Bauplatz in der Basis von Spieler 0 auf openMap (oben links, Zone oben). */
export const SITE = { x: 1, y: 0 } as const;

/** Das zuletzt gebaute Gebäude eines Spielers. */
export function lastBuilding(world: World, owner: 0 | 1 = 0): Entity {
  const b = world.entities.filter((e) => e.alive && e.kind === 'building' && e.owner === owner).at(-1);
  if (!b) throw new Error('kein Gebäude gebaut');
  return b;
}

export function stepTimes(world: World, n: number): void {
  for (let i = 0; i < n; i++) world.step();
}
