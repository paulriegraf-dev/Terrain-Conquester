/**
 * Verschlammung (26.10. spät): Zustand, keine neue Schadensart.
 * - Jeder Treffer eines Schlammwerfer-Modells legt eine Stufe auf das Ziel (erwartete Treffer, höchstens `max`).
 * - Die Schlammschleuder legt je Einschlag `slingStacks` Stufen auf alle Getroffenen (Ziel + Splash-Radius).
 * - Jede Stufe tickt `dps` Schaden je Sekunde: Rüstung (Rüstungswurf) zählt nicht, Widerstand gilt normal
 *   (Verwunden mit der Stärke des Werfers gegen den Widerstand des Ziels, Schalter `toughness`).
 * - Ab `decayAfter` s nach dem letzten Treffer baut sich je Sekunde `decay` Stufe ab.
 * - Verschlammte tragen das Bremsfeld-Tempo (`slowFactor`) auch außerhalb des Felds. Bauwerke: nie.
 */
import { UNITS } from '../../data/units';
import type { UnitId } from '../../data/units';
import type { Entity } from '../entity';
import type { World } from '../world';
import { aliveModels, currentModelWounds } from './combat';
import { defenseOf, hitChance, woundRoll } from './hitmath';
import { slowDown } from './terraform';

function chanceOf(need: number): number {
  return Math.max(0, Math.min(1, (7 - need) / 6));
}

/** Stufen auf ein Ziel legen. */
export function addMud(world: World, shooter: Entity, target: Entity, stacks: number, strength: number): void {
  if (target.kind !== 'unit' || !target.alive || target.owner === shooter.owner || stacks <= 0) return;
  const r = world.rules.mudStacks;
  const m = target.mud ?? { n: 0, last: 0, owner: shooter.owner, strength };
  m.n = Math.min(r.max, m.n + stacks);
  m.last = world.tick;
  m.owner = shooter.owner;
  m.strength = Math.max(m.strength, strength);
  target.mud = m;
}

/** Treffer-Hook (aus onHit): Schlammwerfer je Modell-Treffer, Schleuder je Einschlag auf alle Getroffenen. */
export function mudOnHit(world: World, shooter: Entity, target: Entity): void {
  const r = world.rules.mudStacks;
  if (!r.enabled || target.kind !== 'unit') return;
  const w = shooter.weapon;
  if (!w) return;
  if (shooter.defId === 'wardMud') {
    const hits = aliveModels(shooter) * w.def.shots * hitChance(w.def, defenseOf(world, target, shooter));
    addMud(world, shooter, target, hits * r.perHit, w.def.strength);
  } else if (shooter.defId === 'specialMud') {
    const rad = w.def.splash ?? 0;
    const r2 = rad * rad;
    addMud(world, shooter, target, r.slingStacks, w.def.strength);
    if (rad <= 0) return;
    for (const o of world.entities) {
      if (o === target || !o.alive || o.kind !== 'unit' || o.owner === shooter.owner) continue;
      const dx = o.pos.x - target.pos.x;
      const dy = o.pos.y - target.pos.y;
      if (dx * dx + dy * dy <= r2) addMud(world, shooter, o, r.slingStacks, w.def.strength);
    }
  }
}

/** Sekundentakt: Schaden, Abbau; jeden Tick: Bremse. */
export function updateMud(world: World): void {
  const r = world.rules.mudStacks;
  const second = world.tick % world.tps === 0;
  for (const e of world.entities) {
    const m = e.mud;
    if (!m || !e.alive) continue;
    if (m.n <= 1e-6) {
      e.mud = undefined;
      continue;
    }
    slowDown(world, e, world.tick + 2, r.slowFactor);
    if (!second) continue;
    const wound = r.toughness ? chanceOf(woundRoll(m.strength, e.toughness)) : 1;
    const dmg = m.n * r.dps * wound;
    if (dmg > 0) {
      e.hp -= Math.min(dmg, currentModelWounds(e));
      if (e.hp <= 1e-6) {
        e.hp = 0;
        world.destroy(e, m.owner);
        continue;
      }
    }
    if (world.tick - m.last >= r.decayAfter * world.tps) m.n = Math.max(0, m.n - r.decay);
  }
}

/** Ganze Stufen für Anzeige und Messung. */
export function mudLevel(e: Entity): number {
  return e.mud ? Math.round(e.mud.n) : 0;
}

export function isMudUnit(id: string): boolean {
  return id === 'wardMud' || id === 'specialMud' || !!UNITS[id as UnitId]?.hitWeaken;
}
