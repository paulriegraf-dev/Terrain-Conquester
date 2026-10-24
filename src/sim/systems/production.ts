import { MOVE_PROFILES } from '../../data/movement';
import type { MoveProfile } from '../../data/movement';
import { UNITS } from '../../data/units';
import type { Entity } from '../entity';
import type { PlayerId, Route, Vec2 } from '../types';
import { PLAYERS } from '../types';
import type { World } from '../world';
import { productionFactor } from './market';
import { clutchSize, layEgg } from './myr';
import { synergyProduction } from './synergy';
import type { BuildingId } from '../../data/buildings';
import type { PartId } from '../../data/market';

/**
 * Automatische Produktion: Jedes Gebäude zählt seinen Takt hoch – langsamer, wenn sein
 * Bauteil auf dem Markt teuer ist. Ist eine Einheit fertig, erscheint sie kostenlos.
 * Das harte Einheitenlimit ist nur ein hohes Sicherheitsnetz.
 * Energie bezahlt nur Entscheidungen (Bauen, Erdwall …), nicht den laufenden Nachschub.
 * Wartende Gebäude kommen in der Reihenfolge dran, in der sie fertig wurden.
 * Pausierte Gebäude halten ihren Fortschritt (und lassen Platz im Limit für andere).
 */
export function updateProduction(world: World): void {
  for (const p of PLAYERS) producePlayer(world, p);
}

/**
 * Fortschritt einer Fabrik pro Tick (1 = Grundtakt): Der Marktpreis bremst (bei Preis 2 halb so
 * schnell – aber sie läuft), nach der Notfallverlegung laufen die Fabriken kurz schneller, und die
 * Phase kann sie beschleunigen (PhaseDef.productionMult). Gilt auch für Countdowns und Eilauftrag.
 */
export function productionSpeed(world: World, owner: PlayerId, part: PartId): number {
  const boost = world.tick < world.players[owner].emergency.bonusUntil ? world.rules.emergency.bonusProduction : 1;
  return (boost * (world.phase.productionMult ?? 1) * synergyProduction(world, owner)) / productionFactor(world, owner, part);
}

function producePlayer(world: World, owner: PlayerId): void {
  const ready: Entity[] = [];
  for (const e of world.entities) {
    const pr = e.producer;
    if (!e.alive || e.owner !== owner || !pr) continue;
    if (pr.pendingRoute && world.tick >= pr.routeChangeTick) {
      pr.route = pr.pendingRoute;
      pr.pendingRoute = null;
    }
    if (pr.paused || pr.job || (world.rules.researchPause && researchBusy(world, e))) {
      // Pausiert oder im Umbau (Umrüsten, Stufe, Forschung): keine Produktion.
      pr.blockedBy = 'none';
      continue;
    }
    if (pr.progress < pr.intervalTicks) pr.progress += productionSpeed(world, owner, UNITS[pr.unit].part);
    if (pr.progress >= pr.intervalTicks) {
      if (pr.readySince < 0) pr.readySince = world.tick;
      ready.push(e);
    } else {
      pr.blockedBy = 'none';
    }
  }
  if (ready.length === 0) return;

  ready.sort((a, b) => a.producer!.readySince - b.producer!.readySince || a.id - b.id);
  let units = world.unitCount(owner);
  let blocked: 'none' | 'cap' = 'none';
  for (const building of ready) {
    const pr = building.producer!;
    if (blocked !== 'none') {
      pr.blockedBy = blocked;
      continue;
    }
    // Terra-Former: jeder fünfte Verband (ab Stufe II jeder vierte) ist ein Terraformer.
    const former = world.players[owner].faction.buildings[building.defId as BuildingId]?.former;
    const every = former ? (pr.level >= 2 ? world.rules.terraform.everyLevel2 : world.rules.terraform.every) : 0;
    const def = every > 0 && pr.produced % every === every - 1 ? UNITS[former!] : UNITS[pr.unit];
    if (units >= world.rules.unitCap) {
      blocked = pr.blockedBy = 'cap';
      continue;
    }
    if (clutchSize(world, building) !== null) {
      // Gelege (Myriaden-Brut): ins Gelege statt aufs Feld – es schlüpft gemeinsam.
      layEgg(world, building, def.id);
    } else {
      const pos = spawnPoint(world, building, pr.route, MOVE_PROFILES[def.move]);
      if (!pos) continue; // alles zugestellt – nächsten Tick erneut versuchen
      const spawned = world.addUnit(owner, def, pos, pr.route);
      if (spawned.tf) spawned.tf.level = pr.level;
    }
    pr.progress -= pr.intervalTicks;
    pr.produced++;
    pr.readySince = -1;
    pr.blockedBy = 'none';
    units++;
  }
}

/** Freie Kachel neben dem Gebäude, möglichst auf der Seite Richtung Routen-Wegpunkt. */
export function spawnPoint(world: World, building: Entity, route: Route, profile: MoveProfile): Vec2 | null {
  const r = building.rect!;
  const wp = world.map.waypoints[route];
  let best: Vec2 | null = null;
  let bestScore = Infinity;
  for (let y = r.y - 1; y <= r.y + r.h; y++) {
    for (let x = r.x - 1; x <= r.x + r.w; x++) {
      const inside = x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
      if (inside || !world.grid.isPassable(x, y, profile)) continue;
      const dx = x + 0.5 - wp.x;
      const dy = y + 0.5 - wp.y;
      const score = dx * dx + dy * dy;
      if (score < bestScore) {
        bestScore = score;
        best = { x: x + 0.5, y: y + 0.5 };
      }
    }
  }
  if (best) {
    // Kleiner Versatz, damit Einheiten nicht exakt aufeinander erscheinen – gespiegelt für
    // beide Seiten (kein Zufall), damit keine Seite einen Vorteil hat.
    const k = building.producer?.produced ?? 0;
    const ox = (((k * 0.618034) % 1) - 0.5) * 0.3;
    const oy = (((k * 0.414214) % 1) - 0.5) * 0.3;
    best.x += building.owner === 0 ? ox : -ox;
    best.y += oy;
  }
  return best;
}

/** Test-Schalter researchPause: Forscht der Spieler an der Einheit dieser Fabrik, steht die erste solche Fabrik still. */
function researchBusy(world: World, building: Entity): boolean {
  const p = world.players[building.owner];
  if (p.labs.length === 0) return false;
  const unit = building.producer!.unit;
  if (!p.labs.some((l) => p.faction.upgrades.find((u) => u.id === l.upgrade)?.unit === unit)) return false;
  for (const e of world.entities) {
    if (e.alive && e.owner === building.owner && e.producer && e.producer.unit === unit) return e === building;
  }
  return false;
}
