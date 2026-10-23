import { UNITS } from '../../data/units';
import type { UnitId } from '../../data/units';
import { TERRAIN_INDEX, TERRAIN_LIST } from '../../data/terrain';
import type { CommandResult } from '../commands';
import type { Entity } from '../entity';
import { BUILD_ZONE } from '../map';
import type { SectionDef } from '../map';
import { rectCenter } from '../math';
import type { CellRect, PlayerId } from '../types';
import { PLAYERS, otherPlayer } from '../types';
import type { World } from '../world';
import { controllerAt } from './influence';

/**
 * Notfallverlegung (Entwurf des Nutzers, 22.10.):
 *
 * - **Voraussetzung:** Gegner stehen im eigenen (oder umkämpften) Gebiet nah am eigenen HQ
 *   (Tiefenbereich) und sind dort deutlich stärker als die eigenen Truppen – und das hält an
 *   (rules.emergency.seconds). Dann wird der Knopf am HQ aktiv.
 * - **Aktivierung:** Der Rückraum hinter dem HQ öffnet sich (die Karte wird breiter). Der bedrängte
 *   Bauabschnitt zieht automatisch auf feste Plätze dort um – Fabriken behalten Stufe, Forschung,
 *   Einheit und Marschbefehl und bekommen kurz Bauschutz. Der alte Abschnitt ist dauerhaft verloren
 *   (wird Geröll, keine Bauzone mehr). Gegner dort sind ein paar Sekunden betäubt, damit die eigenen
 *   Truppen nachkommen. Kurz danach: schnellere Fabriken, mehr Schutz im eigenen Gebiet.
 * - **Danach:** Fabriken bleiben zerstörbar; jeder Bauabschnitt nur einmal (rules.emergency.maxUses).
 */
export function updateEmergency(world: World): void {
  if (world.map.reserve === 0 || world.tick % world.tps !== 0) return;
  const rules = world.rules.emergency;
  for (const p of PLAYERS) {
    const st = world.players[p].emergency;
    if (st.used.length >= rules.maxUses) {
      st.pressure = 0;
      st.section = -1;
      continue;
    }
    if (world.seconds < rules.minSeconds) continue; // im Aufbau noch nicht
    const a = assess(world, p);
    st.section = a.section;
    st.pressure = a.pressed ? Math.min(rules.seconds, st.pressure + 1) : Math.max(0, st.pressure - 2);
  }
}

/** Stärke eines Verbands im Sinne des Einheitenlimits (Drohnen halb). */
function strength(e: Entity): number {
  return UNITS[e.defId as UnitId].supply ?? 1;
}

/**
 * Lage um das eigene HQ: Ist man im Tiefenbereich deutlich unterlegen – und welcher eigene
 * Bauabschnitt (mit mindestens einem eigenen Gebäude, noch nicht verlegt) liegt dem Gegner am nächsten?
 */
export function assess(world: World, p: PlayerId): { pressed: boolean; section: number; enemy: number; own: number } {
  const hq = world.hq(p);
  if (!hq) return { pressed: false, section: -1, enemy: 0, own: 0 };
  const rules = world.rules.emergency;
  const c = rectCenter(world.map.hq[p]);
  const r = rules.depth * world.rules.influence.hqRadius;
  let enemy = 0;
  let own = 0;
  let ex = 0;
  let ey = 0;
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit') continue;
    const dx = e.pos.x - c.x;
    const dy = e.pos.y - c.y;
    if (dx * dx + dy * dy > r * r) continue;
    const s = strength(e);
    if (e.owner === p) {
      own += s;
      continue;
    }
    const cell = world.grid.index(Math.floor(e.pos.x), Math.floor(e.pos.y));
    if (world.contested[cell] !== 1 && controllerAt(world, cell) !== p) continue;
    enemy += s;
    ex += e.pos.x * s;
    ey += e.pos.y * s;
  }
  if (enemy <= 0) return { pressed: false, section: -1, enemy, own };
  ex /= enemy;
  ey /= enemy;
  // Nächster eigener Bauabschnitt mit Gebäuden, der noch nicht verlegt wurde.
  const st = world.players[p].emergency;
  let best = -1;
  let bestD = Infinity;
  for (const s of world.map.sections[p]) {
    if (st.used.includes(s.id) || buildingsIn(world, p, s).length === 0) continue;
    const d = (s.center.x - ex) * (s.center.x - ex) + (s.center.y - ey) * (s.center.y - ey);
    if (d < bestD) {
      bestD = d;
      best = s.id;
    }
  }
  const pressed = best >= 0 && enemy >= rules.minEnemy && enemy >= rules.ratio * own;
  return { pressed, section: best, enemy, own };
}

/** Eigene Gebäude (keine Außenposten), deren Mitte im Bauabschnitt liegt – nach ID. */
function buildingsIn(world: World, p: PlayerId, s: SectionDef): Entity[] {
  const cells = sectionSet(s);
  return world.entities.filter(
    (e) => e.alive && e.owner === p && e.kind === 'building' && e.padId === undefined && cells.has(world.grid.index(Math.floor(e.pos.x - 0.5), Math.floor(e.pos.y - 0.5))),
  );
}

const sets = new WeakMap<SectionDef, Set<number>>();
function sectionSet(s: SectionDef): Set<number> {
  let set = sets.get(s);
  if (!set) {
    set = new Set(s.cells);
    sets.set(s, set);
  }
  return set;
}

/** Kann Spieler p jetzt verlegen – und wenn nicht, warum nicht? */
export function checkEmergency(world: World, p: PlayerId): { ok: true; section: SectionDef } | { ok: false; reason: string } {
  if (world.map.reserve === 0) return { ok: false, reason: 'Auf dieser Karte gibt es keinen Rückraum' };
  const rules = world.rules.emergency;
  const st = world.players[p].emergency;
  if (st.used.length >= rules.maxUses) return { ok: false, reason: 'Notfallverlegung schon ausgeschöpft' };
  if (st.pressure < rules.seconds) {
    return { ok: false, reason: `Erst bei starker Bedrängnis am HQ (${st.pressure}/${rules.seconds} s)` };
  }
  const section = world.map.sections[p].find((s) => s.id === st.section);
  if (!section) return { ok: false, reason: 'Kein bedrängter Bauabschnitt mit Gebäuden' };
  return { ok: true, section };
}

/** Notfallverlegung auslösen (Befehl `emergency`). */
export function triggerEmergency(world: World, p: PlayerId): CommandResult {
  const check = checkEmergency(world, p);
  if (!check.ok) return check;
  const rules = world.rules.emergency;
  const player = world.players[p];
  const st = player.emergency;
  const section = check.section;
  const tps = world.tps;

  if (!st.open) openReserve(world, p);
  // Gebäude des Abschnitts auf die freien festen Plätze im Rückraum
  let moved = 0;
  for (const b of buildingsIn(world, p, section)) {
    const site = world.map.reserveSites[p].find((r) => free(world, r));
    if (!site) break;
    world.grid.setStructure(b.rect!, false);
    b.rect = { ...site };
    b.pos = rectCenter(site);
    b.prev = { x: b.pos.x, y: b.pos.y };
    world.grid.setStructure(site, true);
    b.fortified = !player.faction.buildings[b.defId as keyof typeof player.faction.buildings]!.neverFortified;
    b.shieldUntil = world.tick + Math.round(rules.shieldSeconds * tps);
    moved++;
  }
  // Der alte Abschnitt ist verloren: keine Bauzone mehr, der Boden wird Geröll.
  for (const i of section.cells) {
    world.map.buildZone[i] = BUILD_ZONE.none;
    if (world.grid.structure[i] === 0 && TERRAIN_LIST[world.grid.terrain[i]!]!.solid && world.grid.terrain[i] !== TERRAIN_INDEX.rubble) {
      world.grid.setTerrain(i, TERRAIN_INDEX.rubble);
      world.formed[i] = 0; // verlassener Abschnitt: niemandes Boden
    }
  }
  // Gegner im Abschnitt (und knapp drumherum) sind kurz betäubt.
  const near = nearSection(world, section, rules.stunMargin);
  let stunned = 0;
  const until = world.tick + Math.round(rules.stunSeconds * tps);
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit' || e.owner !== otherPlayer(p)) continue;
    if (!near.has(world.grid.index(Math.floor(e.pos.x), Math.floor(e.pos.y)))) continue;
    e.stunnedUntil = until;
    stunned++;
  }
  st.bonusUntil = world.tick + Math.round(rules.bonusSeconds * tps);
  st.used.push(section.id);
  st.pressure = 0;
  st.section = -1;
  world.emit({ type: 'emergency', owner: p, moved, stunned, pos: { x: section.center.x, y: section.center.y } });
  return { ok: true };
}

/** Den Rückraum von p öffnen: wird Wiese, gehört p, feste Plätze werden Basis-Bauzone. */
function openReserve(world: World, p: PlayerId): void {
  const st = world.players[p].emergency;
  const meadow = TERRAIN_INDEX.meadow;
  const own = p === 0 ? 1 : -1;
  for (const i of world.map.reserveCells[p]) {
    world.locked[i] = 0;
    world.grid.setTerrain(i, meadow);
    world.influence[i] = own;
    world.players[p].vision.learn(i);
  }
  for (const r of world.map.reserveSites[p]) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) world.map.buildZone[world.grid.index(x, y)] = BUILD_ZONE.base;
  }
  st.open = true;
}

function free(world: World, r: CellRect): boolean {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (world.grid.structure[world.grid.index(x, y)] !== 0) return false;
  return true;
}

/** Kacheln des Abschnitts und alle im Abstand `margin` (Schachbrett-Abstand). */
function nearSection(world: World, s: SectionDef, margin: number): Set<number> {
  const out = new Set<number>();
  const w = world.map.width;
  const h = world.map.height;
  for (const i of s.cells) {
    const x = i % w;
    const y = (i - x) / w;
    for (let dy = -margin; dy <= margin; dy++) {
      for (let dx = -margin; dx <= margin; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) out.add(ny * w + nx);
      }
    }
  }
  return out;
}

/** Ist e gerade betäubt? */
export function isStunned(world: World, e: Entity): boolean {
  return e.stunnedUntil !== undefined && world.tick < e.stunnedUntil;
}

/** Bonus nach der Verlegung: läuft er für p gerade? */
export function emergencyBonus(world: World, p: PlayerId): boolean {
  return world.tick < world.players[p].emergency.bonusUntil;
}
