import { UNITS } from '../../data/units';
import { flankFactor } from './flank';
import { energyCap } from './economy';
import { TERRAIN_INDEX } from '../../data/terrain';
import type { UnitId } from '../../data/units';
import type { Entity } from '../entity';
import { dist } from '../math';
import type { PlayerId } from '../types';
import type { World } from '../world';
import { controllerAt } from './influence';
import { homeAdvantage, siegeMultiplier } from './front';
import { defenseOf, woundsPerShot } from './hitmath';
import { commandBonus } from './hero';
import { aimPoint, rangeTo } from './targeting';
import { frenzyOf } from './lifespan';
import { ambushFactor, dugInFactor, onHit } from './terraform';
import { tryLaunch } from './myr';
import { synergyApBonus, synergyDamageFactor } from './synergy';

interface Hit {
  target: Entity;
  /** So viele Wunden kommen durch – jede trifft ein Modell. */
  wounds: number;
  /** Schaden pro Wunde (Überschuss über ein Modell hinaus verfällt). */
  damage: number;
  attacker: PlayerId;
}

/**
 * Kampf nach Tabletop-Vorbild (siehe hitmath.ts und WeaponDef):
 * Jede Salve feuert lebende Modelle × Schüsse; erwartet durchkommende Wunden werden pro Schütze
 * und Ziel gesammelt, ganze Wunden richten Schaden an – immer am angeschlagenen Modell zuerst,
 * Überschuss verfällt. Wer Modelle verliert, schießt mit weniger.
 *
 * Zwei Schritte: Erst schießen alle, dann wird der Schaden verteilt. So ist es egal, wer in
 * der Liste zuerst steht – kein Spieler hat einen Reihenfolge-Vorteil.
 */
export function updateCombat(world: World): void {
  const hits: Hit[] = [];
  /** Kamikaze-Einheiten, die in diesem Tick eingeschlagen sind. */
  const sacrificed: Entity[] = [];
  /**
   * Als Munition verbrauchte Myr-Modelle (Verband → Anzahl). Sie verschwinden erst nach dem
   * Schießen – sonst hinge es von der Listen-Reihenfolge ab, wessen Schüsse ins Leere gehen.
   */
  const consumed = new Map<Entity, number>();
  shields = shieldMap(world);

  for (const e of world.entities) {
    const w = e.weapon;
    if (!e.alive || !w) continue;
    if (w.ready > 0) w.ready--;
    if (w.ready > 0 || w.targetId === 0) continue;
    if (e.stunnedUntil !== undefined && world.tick < e.stunnedUntil) continue; // betäubt (Notfallverlegung)
    const t = world.get(w.targetId);
    if (!t || !t.alive) {
      w.targetId = 0;
      continue;
    }
    if (rangeTo(e, t) > w.def.range) continue;
    // Bauschutz: Neue Gebäude sind kurz unangreifbar.
    if (t.shieldUntil !== undefined && world.tick < t.shieldUntil) continue;
    // Werfer (Myr-Kanone, -Katapult): statt eines Schusses eigene Myrs werfen, solange eine Ladung da ist.
    const launch = e.kind === 'unit' ? UNITS[e.defId as UnitId].launch : undefined;
    if (launch && rangeTo(e, t) <= launch.range && tryLaunch(world, e, t, consumed)) {
      w.ready = Math.max(1, Math.round(launch.cooldown * world.tps));
      continue;
    }
    let damage = damagePerWound(world, e, t);
    if (damage <= 0) continue;
    if (e.tf) damage *= ambushFactor(world, e) * synergyDamageFactor(world, e); // Hinterhalt, Blühende Wiese
    if (e.weaken && world.tick < e.weaken.until) damage *= e.weaken.damage; // geschwächt (Schlammschleuder)
    damage *= flankFactor(world, e); // Flankenangriff nach dem Überqueren einer gegnerischen Schlucht

    // Myriaden: Masse als Stärke, Munition wörtlich, Kamikaze.
    const def = e.kind === 'unit' ? UNITS[e.defId as UnitId] : undefined;
    let factor = 1;
    let swarmAp = 0;
    if (def?.swarm && def.swarm.perNeighbor > 0) {
      const sb = swarmBonus(world, e, def.swarm.perNeighbor, def.swarm.max, def.swarm.radius);
      factor *= 1 + sb;
      // Test-Schalter: Durchschlag im Schwarm – ab diesem Anteil des Höchstbonus +1 Durchschlag.
      if (world.rules.swarmAp > 0 && sb >= world.rules.swarmAp * def.swarm.max - 1e-9) swarmAp = 1;
    }
    // Munition: Drohnen – oder Felsen, wenn Geröll in der Nähe liegt (Bauwerke zuerst mit Felsen).
    let rock = false;
    if (def?.ammo) {
      const rocks = def.ammo.rocks && nearTerrain(world, e, RUBBLE, def.ammo.rocks.radius) ? def.ammo.rocks : null;
      if (rocks && t.kind !== 'unit') rock = true;
      else if (useAmmo(world, e, def.ammo.unit, def.ammo.radius, def.ammo.shotsPer, consumed)) rock = false;
      else if (rocks) rock = true;
      else factor *= def.ammo.emptyFactor;
      if (rock && rocks && t.kind !== 'unit') damage *= rocks.structureBonus;
    }

    const shots = aliveModels(e) * w.def.shots;
    const bonus = commandBonus(world, e);
    const blast = rock ? undefined : w.def.blast; // Felsen: kein Explosiv-Bonus gegen Masse
    const apBonus = swarmAp + (e.tf ? synergyApBonus(world, e) : 0);
    const wdef = apBonus > 0 ? { ...w.def, ap: w.def.ap + apBonus } : w.def;
    const expected = (shots + blastShots(blast, t)) * woundsPerShot(wdef, defenseOf(world, t, e), bonus) * factor;
    // Schlammmonster: Wer sie aus kurzer oder mittlerer Reichweite beschießt, den stürmen sie an.
    const charge = t.kind === 'unit' && e.kind === 'unit' ? UNITS[t.defId as UnitId].charge : undefined;
    if (charge && w.def.range <= charge.maxRange) t.charge = { target: e.id, until: world.tick + Math.round(charge.seconds * world.tps) };
    if (def?.kamikaze) {
      // Eine einzige Explosion: der erwartete Schaden in einem Schlag.
      const spread = t.kind === 'unit' ? Math.min(world.rules.kamikazeSpread, aliveModels(t)) : 0;
      if (spread > 1) hits.push({ target: t, wounds: spread, damage: (damage * expected) / spread, attacker: e.owner });
      else hits.push({ target: t, wounds: 1, damage: damage * expected, attacker: e.owner });
      sacrificed.push(e);
    } else {
      collect(w.acc, t, expected, damage, e.owner, hits);
    }
    if (w.def.splash) splashHits(world, e, t, shots, factor, bonus, hits, blast);
    // Durchschuss: der nächste Gegner hinter dem Ziel bekommt einen Teil der Schüsse ab.
    if (w.def.pierce && t.kind === 'unit') {
      const behind = nextBehind(world, e, t);
      if (behind) {
        const dmg = damagePerWound(world, e, behind);
        if (dmg > 0) collect(w.acc, behind, shots * w.def.pierce * factor * woundsPerShot(w.def, defenseOf(world, behind, e), bonus), dmg, e.owner, hits);
      }
    }
    trimAccumulator(w.acc, t.id);
    // Todeswut (Lebensuhr): alte Verbände feuern schneller.
    const rage = e.lifespan ? frenzyOf(world, e) : null;
    // Netz-Aufstieg (Technoclan): kurz schnelleres Feuer.
    const rate = (rage ? rage.fireRate : 1) * (e.net && world.tick < e.net.ascendUntil ? world.rules.network.ascendFireRate : 1);
    w.ready = rate !== 1 ? Math.max(1, Math.round(w.cooldownTicks / rate)) : w.cooldownTicks;
    if (e.tf) onHit(world, e, t); // Terra-Former: letzter Schuss, Frost-Treffer
    world.emit({
      type: 'shot',
      owner: e.owner,
      from: { x: e.pos.x, y: e.pos.y },
      to: aimPoint(e, t),
      heavy: e.kind === 'hq' || w.def.damage >= 30,
    });
  }

  for (const [squad, n] of consumed) {
    for (let k = 0; k < n && squad.alive; k++) {
      squad.hp -= currentModelWounds(squad);
      if (squad.hp <= 1e-6) world.destroy(squad, null); // ganz verbraucht – kein Verlust, kein Täter
    }
  }

  for (const h of hits) {
    const t = h.target;
    if (!t.alive) continue;
    for (let k = 0; k < h.wounds && t.alive; k++) {
      const dealt = Math.min(h.damage, currentModelWounds(t));
      t.hp -= dealt;
      if (t.kind === 'hq') world.players[h.attacker].stats.hqDamageDealt += dealt;
      if (t.hp <= 1e-6) {
        t.hp = 0;
        world.destroy(t, h.attacker);
        // Beute: Wer eine gegnerische Fabrik zerstört, bekommt einen Teil ihres Preises.
        if (t.kind === 'building' && h.attacker !== t.owner) {
          const amount = Math.floor((t.paid ?? 0) * world.rules.front.buildingBounty);
          const p = world.players[h.attacker];
          p.energy = Math.min(energyCap(world, p.id), p.energy + amount);
          p.stats.bounty += amount;
          world.emit({ type: 'bounty', owner: h.attacker, amount, name: t.name });
        }
      }
    }
  }
  for (const e of sacrificed) world.destroy(e, e.owner);
}

const RUBBLE = TERRAIN_INDEX.rubble;

/** Der nächste gegnerische Verband hinter dem Ziel (in Schussrichtung, höchstens 2 Kacheln dahinter, nah an der Linie). */
function nextBehind(world: World, shooter: Entity, target: Entity): Entity | null {
  const dx = target.pos.x - shooter.pos.x;
  const dy = target.pos.y - shooter.pos.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return null;
  const ux = dx / len;
  const uy = dy / len;
  let best: Entity | null = null;
  let bestAlong = Infinity;
  for (const o of world.entities) {
    if (o === target || !o.alive || o.kind !== 'unit' || o.owner === shooter.owner) continue;
    const ox = o.pos.x - target.pos.x;
    const oy = o.pos.y - target.pos.y;
    const along = ox * ux + oy * uy;
    if (along <= 0 || along > 2) continue;
    const side = Math.abs(ox * uy - oy * ux);
    if (side > 0.8 + o.radius) continue;
    if (along < bestAlong || (along === bestAlong && best && o.id < best.id)) {
      bestAlong = along;
      best = o;
    }
  }
  return best;
}

/** Liegt eine Kachel dieser Bodenart im Radius um e (Kachelmitten)? */
export function nearTerrain(world: World, e: Entity, terrain: number, radius: number): boolean {
  const grid = world.grid;
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(e.pos.x - radius));
  const x1 = Math.min(grid.width - 1, Math.floor(e.pos.x + radius));
  const y0 = Math.max(0, Math.floor(e.pos.y - radius));
  const y1 = Math.min(grid.height - 1, Math.floor(e.pos.y + radius));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - e.pos.x;
      const dy = y + 0.5 - e.pos.y;
      if (dx * dx + dy * dy <= r2 && grid.terrain[y * grid.width + x] === terrain) return true;
    }
  }
  return false;
}

/** Explosiv: +1 Schuss je `blast` lebende Modelle des Ziels (0 ohne Explosiv-Waffe). */
function blastShots(blast: number | undefined, t: Entity): number {
  return blast ? Math.floor(aliveModels(t) / blast) : 0;
}

/** Lebende Modelle eines Verbands (Einzelmodelle und Gebäude: 1). */
export function aliveModels(e: Entity): number {
  if (e.models <= 1) return 1;
  return Math.max(1, Math.min(e.models, Math.ceil(e.hp / e.modelWounds - 1e-9)));
}

/** Leben des Modells, das gerade Schaden nimmt (das angeschlagene zuerst). */
export function currentModelWounds(e: Entity): number {
  if (e.models <= 1) return e.hp;
  return e.hp - (aliveModels(e) - 1) * e.modelWounds;
}

/** Schaden pro durchgekommener Wunde – mit allen Zu- und Abschlägen (0 = darf dieses Ziel nicht angreifen). */
function damagePerWound(world: World, e: Entity, t: Entity): number {
  const w = e.weapon!;
  let damage = w.def.damage;
  if (t.kind !== 'unit') {
    damage *= w.def.structureDamage ?? 1;
    // Belagerungsdruck: Wer mehr Gebiet hält, trifft HQ und Gebäude härter.
    damage *= siegeMultiplier(world, t.owner);
  }
  if (t.kind === 'hq') damage *= world.hqDamageMult;
  // Schild-Aura (Frostwächter in der Nähe des Ziels)
  const shield = shields.get(t.id);
  if (shield !== undefined) damage *= shield;
  // Gebäude in der eigenen Basis sind befestigt, vorgeschobene nicht.
  if (t.kind === 'building' && t.fortified) damage *= world.rules.baseBuildingDamageTaken;
  // Eingegraben (Felsbastion auf eigenem Geröll)
  if (t.tf) damage *= dugInFactor(t);
  // Heimvorteil: im eigenen Einflussgebiet halten Einheiten mehr aus.
  const home = t.kind === 'unit' ? homeAdvantage(world) : 0;
  const bonus = t.kind === 'unit' && world.tick < world.players[t.owner].emergency.bonusUntil;
  if ((home > 0 || bonus) && controllerAt(world, world.grid.index(Math.floor(t.pos.x), Math.floor(t.pos.y))) === t.owner) {
    damage *= 1 - (1 - world.rules.homeDamageTaken) * home;
    // Nach der Notfallverlegung: kurz noch mehr Schutz im eigenen Gebiet.
    if (bonus) damage *= world.rules.emergency.bonusDamageTaken;
  }
  return damage;
}

/** Schild-Auren dieses Ticks: Entity-ID → Schadensfaktor (der stärkste Schild zählt). */
let shields = new Map<number, number>();

/** Wer steht im Schild eines eigenen Frostwächters (UnitDef.shieldAura)? Einmal je Tick. */
function shieldMap(world: World): Map<number, number> {
  const out = new Map<number, number>();
  for (const s of world.entities) {
    if (!s.alive || s.kind !== 'unit') continue;
    const aura = UNITS[s.defId as UnitId].shieldAura;
    if (!aura) continue;
    const r2 = aura.radius * aura.radius;
    for (const o of world.entities) {
      if (!o.alive || o.kind !== 'unit' || o.owner !== s.owner || o === s) continue;
      const dx = o.pos.x - s.pos.x;
      const dy = o.pos.y - s.pos.y;
      if (dx * dx + dy * dy > r2) continue;
      out.set(o.id, Math.min(out.get(o.id) ?? 1, aura.factor));
    }
  }
  return out;
}

/** So viele Ziele mit angebrochenen Wunden merkt sich ein Schütze höchstens. */
const ACC_LIMIT = 24;

/** Erwartete Wunden sammeln; ganze Wunden werden zu Treffern. */
function collect(acc: Map<number, number>, t: Entity, expected: number, damage: number, attacker: PlayerId, hits: Hit[]): void {
  const sum = (acc.get(t.id) ?? 0) + expected;
  const wounds = Math.floor(sum + 1e-9);
  const rest = sum - wounds;
  // Neu einsortieren: Zuletzt beschossene Ziele stehen hinten (siehe trimAccumulator).
  acc.delete(t.id);
  if (rest > 1e-9) acc.set(t.id, rest);
  if (wounds > 0) hits.push({ target: t, wounds, damage, attacker });
}

/**
 * Zu viele angebrochene Ziele gemerkt (Fläche trifft viele): die am längsten nicht beschossenen
 * vergessen – nie das aktuelle Ziel. Deterministisch, weil die Map ihre Reihenfolge behält.
 */
function trimAccumulator(acc: Map<number, number>, keep: number): void {
  if (acc.size <= ACC_LIMIT) return;
  for (const id of acc.keys()) {
    if (acc.size <= ACC_LIMIT) break;
    if (id !== keep) acc.delete(id);
  }
}

/** Masse-Bonus: Anteil Zusatzwirkung für jede eigene Myr-Einheit in der Nähe (gedeckelt). */
export function swarmBonus(world: World, e: Entity, perNeighbor: number, max: number, radius: number): number {
  const r2 = radius * radius;
  let n = 0;
  for (const o of world.entities) {
    if (o === e || !o.alive || o.kind !== 'unit' || o.owner !== e.owner || !UNITS[o.defId as UnitId].swarm) continue;
    const dx = o.pos.x - e.pos.x;
    const dy = o.pos.y - e.pos.y;
    if (dx * dx + dy * dy <= r2) n++;
  }
  return Math.min(max, n * perNeighbor);
}

/**
 * Munition: Ist die Waffe leer, zieht sie ein Modell aus dem nächsten eigenen Drohnen-Verband
 * im Radius ein und hat danach `shotsPer` Schüsse. Gibt zurück, ob dieser Schuss geladen ist.
 */
function useAmmo(world: World, e: Entity, unit: UnitId, radius: number, shotsPer: number, consumed: Map<Entity, number>): boolean {
  const w = e.weapon!;
  if (w.charges <= 0) {
    let best: Entity | null = null;
    let bestD = radius * radius;
    for (const o of world.entities) {
      if (!o.alive || o.owner !== e.owner || o.defId !== unit) continue;
      if ((consumed.get(o) ?? 0) >= aliveModels(o)) continue; // schon alle Modelle verplant
      const dx = o.pos.x - e.pos.x;
      const dy = o.pos.y - e.pos.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD || (d2 === bestD && best && o.id < best.id)) {
        best = o;
        bestD = d2;
      }
    }
    if (!best) return false;
    consumed.set(best, (consumed.get(best) ?? 0) + 1);
    world.emit({ type: 'ammo', owner: e.owner, from: { x: best.pos.x, y: best.pos.y }, to: { x: e.pos.x, y: e.pos.y } });
    w.charges = shotsPer;
  }
  w.charges--;
  return true;
}

/**
 * Flächenschaden: weitere gegnerische Einheiten rund ums Ziel bekommen halb so viele Schüsse ab.
 * `factor` (Masse, Munition) wirkt wie beim Hauptziel auf alle Schüsse, auch die explosiven.
 */
function splashHits(world: World, shooter: Entity, target: Entity, shots: number, factor: number, bonus: number, hits: Hit[], blast: number | undefined): void {
  const w = shooter.weapon!;
  const center = aimPoint(shooter, target);
  for (const o of world.entities) {
    if (o === target || !o.alive || o.kind !== 'unit' || o.owner === shooter.owner) continue;
    if (dist(o.pos, center) - o.radius > w.def.splash!) continue;
    const damage = damagePerWound(world, shooter, o);
    if (damage <= 0) continue;
    const n = (shots + blastShots(blast, o)) * factor * 0.5;
    collect(w.acc, o, n * woundsPerShot(w.def, defenseOf(world, o, shooter), bonus), damage, shooter.owner, hits);
  }
}
