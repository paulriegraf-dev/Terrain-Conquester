import type { BuildingId } from '../../data/buildings';
import { seesThroughDisguise, structureVisionBonus } from './hq';
import { UNITS } from '../../data/units';
import type { UnitId } from '../../data/units';
import type { Entity } from '../entity';
import type { CellRect, PlayerId, Route } from '../types';
import { PLAYERS } from '../types';
import type { World } from '../world';
import { controllerAt } from './influence';
import { factorySpeed, productionSpeed } from './production';

/** Berechnet den Nebel neu: Jede eigene Entity deckt ihren Sichtradius auf, dazu das eigene Gebiet. */
export function updateVision(world: World): void {
  for (const p of world.players) p.vision.clear();
  for (const e of world.entities) {
    if (!e.alive || e.kind === 'wall') continue;
    const bonus = e.kind === 'unit' ? 0 : structureVisionBonus(world, e.owner); // Feldstecher (HQ-Zweig Aufklärung)
    world.players[e.owner].vision.reveal(Math.floor(e.pos.x), Math.floor(e.pos.y), e.vision + bonus);
  }
  // Sensorstation (wirksam): Sicht über den Lane-Abschnitt in der Mitte (Kreise entlang der Lane).
  const band = world.rules.sites.sensorBand;
  world.map.sites.forEach((s, i) => {
    const st = world.siteStates[i]!;
    if (s.kind !== 'sensor' || st.owner === null || !st.active) return;
    const v = world.players[st.owner].vision;
    for (let dx = -band.halfW + band.halfH; dx <= band.halfW - band.halfH + 1e-9; dx += band.halfH) {
      v.reveal(Math.floor(s.pos.x + dx), Math.floor(s.pos.y), band.halfH);
    }
  });
  // Das eigene Gebiet ist immer aufgedeckt – bis zur Grenze, auch hinter Wald und Fels.
  for (let i = 0; i < world.influence.length; i++) {
    const c = controllerAt(world, i);
    if (c === null) continue;
    const v = world.players[c].vision;
    v.visible[i] = 1;
    v.explored[i] = 1;
  }
  for (const p of PLAYERS) updateIntel(world, p);
  for (const p of world.players) p.vision.refreshKnown();
}

/**
 * Was sieht Spieler `viewer` an diesem Gebäude? Bei aktiver Täuschung das Falsche:
 * ein anderer Gebäudetyp (der scheinbar seine Start-Einheit baut) und eine andere Route.
 * Dazu, wann der nächste Verband herauskommt – bei Täuschung passend zur vorgetäuschten Einheit
 * (gleicher Fortschritt, deren Takt).
 */
export function apparentBuilding(
  world: World,
  e: Entity,
  viewer: PlayerId,
): { defId: BuildingId; route: Route; unit: UnitId; level: number; nextTick: number; everyTicks: number } {
  const pr = e.producer!;
  const d = e.disguise;
  // Gegenspionage (HQ-Zweig Aufklärung): Täuschungen fliegen auf.
  const fake = d && viewer !== e.owner && world.tick < d.until && !seesThroughDisguise(world, viewer);
  const unit = fake ? world.players[e.owner].faction.buildings[d.as]!.tiers[0]! : pr.unit;
  const speed = fake ? productionSpeed(world, e.owner, UNITS[unit].part) : factorySpeed(world, e);
  const every = Math.round((fake ? world.spawnTicks(unit, e.padId !== undefined, e.owner) : pr.intervalTicks) / speed);
  const share = Math.min(1, pr.progress / Math.max(1, pr.intervalTicks));
  const idle = pr.paused || pr.job !== null;
  const nextTick = world.tick + Math.round((1 - share) * every);
  const everyTicks = idle ? 0 : every;
  if (fake) return { defId: d.as, route: d.route, unit, level: 1, nextTick, everyTicks };
  return { defId: e.defId as BuildingId, route: pr.route, unit, level: pr.level, nextTick, everyTicks };
}

/**
 * Sekunden bis zum nächsten Verband laut Lagebild – über die Sichtung hinaus fortgeschrieben
 * (gleicher Takt angenommen). null = keine Produktion gesehen.
 */
export function intelNextSeconds(world: World, rec: { nextTick: number; everyTicks: number }): number | null {
  if (rec.everyTicks <= 0) return null;
  let left = rec.nextTick - world.tick;
  if (left < 0) left = ((left % rec.everyTicks) + rec.everyTicks) % rec.everyTicks;
  return left / world.tps;
}

/**
 * Lagebild aktualisieren: Sichtbare gegnerische Gebäude eintragen (mit dem, was man sieht –
 * auch Täuschung). Ein Eintrag verschwindet erst, wenn man die Stelle sieht und dort nichts mehr steht.
 */
function updateIntel(world: World, p: PlayerId): void {
  const intel = world.intel[p];
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'building' || e.owner === p || !e.rect) continue;
    if (rectVisible(world, p, e.rect)) intel.set(e.id, { rect: { ...e.rect }, ...apparentBuilding(world, e, p), seenTick: world.tick });
  }
  for (const [id, rec] of intel) {
    if (world.get(id)?.alive) continue;
    if (rectVisible(world, p, rec.rect)) intel.delete(id);
  }
}

function rectVisible(world: World, p: PlayerId, r: CellRect): boolean {
  const v = world.players[p].vision;
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (v.isVisible(x, y)) return true;
  return false;
}
