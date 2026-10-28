/**
 * Schlusssteine (26.10.): Regeln der Terra-Former- und Myriaden-Einheiten nach der letzten Forschung.
 * Die Zahlen stehen in rules.keystone, die Texte in data/keystones.ts. Hier: Zustand und Ablauf; die Wirkungen im
 * Kampf, in der Zielwahl und in der Bewegung lesen `hasKeystone` an ihrer Stelle.
 */
import { keystoneId } from '../../data/keystones';
import { TERRAIN_INDEX } from '../../data/terrain';
import { UNITS, lineUnit } from '../../data/units';
import type { UnitId } from '../../data/units';
import type { Entity } from '../entity';
import type { PlayerId } from '../types';
import type { World } from '../world';
import { controllerAt } from './influence';
import { applyHits } from './combat';
import type { Hit } from './combat';
import { defenseOf, woundsPerShot } from './hitmath';
import { researchableUnits } from './factory';
import { breakerDeath } from './breaker';

/** Hat Spieler p den Schlussstein dieser Einheitenart? */
export function hasKeystone(world: World, p: PlayerId, unit: string): boolean {
  const r = world.players[p].research;
  // Terra-Former (26.10. spät): ein Schlussstein je Linie – er gilt für Wächter UND Gerufenen.
  return r.includes(keystoneId(unit as UnitId)) || r.includes(keystoneId(lineUnit(unit as UnitId)));
}

/** Auslösung zählen (Statistik nach der Runde). */
export function fireKeystone(world: World, p: PlayerId, unit: string): void {
  const f = world.players[p].stats.keystoneFires;
  f[unit] = (f[unit] ?? 0) + 1;
}

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);
const forward = (world: World, p: PlayerId): number => (world.map.hq[p].x < world.map.width / 2 ? 1 : -1);

/** Darf hier im Kampf Boden entstehen (Schlammbett, Weißer Tod)? Fester freier Boden, kein Ödland, nicht im gegnerischen Gebiet. */
export function combatGroundOk(world: World, i: number, p: PlayerId): boolean {
  const g = world.grid;
  if (g.structure[i] !== 0 || world.locked[i] || g.terrain[i] === TERRAIN_INDEX.waste || g.terrain[i] === TERRAIN_INDEX.wall) return false;
  if (g.terrain[i] === TERRAIN_INDEX.gorge || g.terrain[i] === TERRAIN_INDEX.mountain) return false;
  if (controllerAt(world, i) === other(p)) return false;
  return !world.swaps.some((s) => s.index === i);
}

/** Im Kampf geformte Kachel setzen (zählt erst nach laneDelay für Lanes, nie für Rufe). */
export function setCombatGround(world: World, i: number, p: PlayerId, terrain: number): void {
  world.grid.setTerrain(i, terrain);
  world.formed[i] = p + 1;
  world.combatGround.set(i, world.tick);
  world.players[p].vision.learn(i);
  world.players[p].stats.combatTiles++;
}

/** Je Tick (aus updateTerraform): Heimkehr, Deckung hinter Steinwächtern, Gerölltreppen ablaufen lassen. */
export function updateKeystones(world: World): void {
  world.coverIds = new Set();
  if (world.tick % world.tps === 0) {
    for (const [i, s] of world.stairs) if (world.tick >= s.until) world.stairs.delete(i);
    const keep = Math.round(world.rules.keystone.laneDelay * world.tps) * 4;
    for (const [i, t] of world.combatGround) if (world.tick - t > keep && world.formed[i] !== 0) world.combatGround.delete(i);
  }
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit') continue;
    if (e.defId === 'specialMeadow' && hasKeystone(world, e.owner, 'specialMeadow')) homecoming(world, e);
    else if (e.defId === 'wardRubble' && hasKeystone(world, e.owner, 'wardRubble') && onOwn(world, e, TERRAIN_INDEX.rubble)) cover(world, e);
  }
}

/** Steht e auf eigenem geformtem Boden dieser Art? */
export function onOwn(world: World, e: Entity, terrain: number): boolean {
  const i = world.grid.index(Math.floor(e.pos.x), Math.floor(e.pos.y));
  return world.formed[i] === e.owner + 1 && world.grid.terrain[i] === terrain;
}

/** Heimkehr (Steppenjäger): unter der Schwelle zurück auf eigene Wiese hinter der Front, dort voll heilen. */
function homecoming(world: World, e: Entity): void {
  const r = world.rules.keystone;
  const ks = (e.ks ??= {});
  const m = e.mover!;
  if (ks.retreat) {
    e.mark = { owner: other(e.owner), until: world.tick + 2 };
    if (e.weapon) e.weapon.targetId = 0;
    const end = (): void => {
      ks.retreat = null;
      ks.healStart = undefined;
      m.goal = null;
    };
    if (ks.healStart !== undefined) {
      m.goal = { x: e.pos.x, y: e.pos.y };
      const k = Math.min(1, (world.tick - ks.healStart) / (r.homeHeal * world.tps));
      e.hp = Math.max(e.hp, ks.healFrom! + (e.maxHp - ks.healFrom!) * k);
      if (k >= 1) end();
      return;
    }
    if (world.tick > (ks.retreatUntil ?? 0)) return end();
    m.goal = ks.retreat;
    const d2 = (e.pos.x - ks.retreat.x) ** 2 + (e.pos.y - ks.retreat.y) ** 2;
    if (d2 <= 0.6 * 0.6 && onOwn(world, e, TERRAIN_INDEX.meadow)) {
      ks.healStart = world.tick;
      ks.healFrom = e.hp;
    }
    return;
  }
  if (ks.homeUsed || e.hp >= r.homeThreshold * e.maxHp) return;
  const spot = homeSpot(world, e, r.homeRadius);
  if (!spot) return;
  ks.homeUsed = true;
  ks.retreat = spot;
  ks.retreatUntil = world.tick + 25 * world.tps;
  fireKeystone(world, e.owner, 'specialMeadow');
}

/** Nächste eigene Wiese im eigenen Gebiet, nicht vor dem Steppenjäger. */
function homeSpot(world: World, e: Entity, radius: number): { x: number; y: number } | null {
  const g = world.grid;
  const dir = forward(world, e.owner);
  const meadow = TERRAIN_INDEX.meadow;
  let best: { x: number; y: number } | null = null;
  let bestD = radius * radius;
  const cx = Math.floor(e.pos.x);
  const cy = Math.floor(e.pos.y);
  const R = Math.ceil(radius);
  for (let y = cy - R; y <= cy + R; y++) {
    for (let x = cx - R; x <= cx + R; x++) {
      if (!g.inBounds(x, y)) continue;
      const i = g.index(x, y);
      if (world.formed[i] !== e.owner + 1 || g.terrain[i] !== meadow || g.structure[i] !== 0) continue;
      if (controllerAt(world, i) !== e.owner) continue;
      if ((x + 0.5 - e.pos.x) * dir > 0.5) continue; // nicht nach vorn
      const d = (x + 0.5 - e.pos.x) ** 2 + (y + 0.5 - e.pos.y) ** 2;
      if (d < bestD - 1e-9) {
        bestD = d;
        best = { x: x + 0.5, y: y + 0.5 };
      }
    }
  }
  return best;
}

/** Fels in der Brandung: eigene Verbände auf der Kachel direkt hinter dem Steinwächter bekommen Deckung. */
function cover(world: World, e: Entity): void {
  const bx = Math.floor(e.pos.x) - forward(world, e.owner);
  const by = Math.floor(e.pos.y);
  for (const o of world.entities) {
    if (!o.alive || o.kind !== 'unit' || o.owner !== e.owner || o === e) continue;
    if (Math.floor(o.pos.x) === bx && Math.floor(o.pos.y) === by) world.coverIds.add(o.id);
  }
}

/** Unverdrängbar (Fels in der Brandung)? */
export function immovable(world: World, e: Entity): boolean {
  return e.defId === 'wardRubble' && hasKeystone(world, e.owner, 'wardRubble') && onOwn(world, e, TERRAIN_INDEX.rubble);
}

/** Wurzelgriff: nach einem Sprung den nächsten Gegner festhalten. */
export function rootGrip(world: World, e: Entity): void {
  if (e.defId !== 'specialForest' || !hasKeystone(world, e.owner, 'specialForest')) return;
  const ks = (e.ks ??= {});
  if (world.tick < (ks.nextGrip ?? 0)) return;
  let best: Entity | null = null;
  let bestD = 16;
  for (const o of world.entities) {
    if (!o.alive || o.kind !== 'unit' || o.owner === e.owner) continue;
    const d = (o.pos.x - e.pos.x) ** 2 + (o.pos.y - e.pos.y) ** 2;
    if (d < bestD || (d === bestD && best && o.id < best.id)) {
      bestD = d;
      best = o;
    }
  }
  if (!best) return;
  const r = world.rules.keystone;
  best.stunnedUntil = Math.max(best.stunnedUntil ?? 0, world.tick + Math.round(r.gripSeconds * world.tps));
  ks.nextGrip = world.tick + Math.round(r.gripCooldown * world.tps);
  fireKeystone(world, e.owner, 'specialForest');
}

// ------------------------------------------------------------------ Myriaden

/** Beim Tod einer Einheit (mit Täter): Bluff (Verspotter des Katapults), Nachzünder (Sprengetopp). */
export function keystoneDeath(world: World, e: Entity, killer: PlayerId): void {
  if (e.breaker) breakerDeath(world, e, killer); // Myr-Brechstange fällt vor dem Sprung
  if (killer === e.owner) return; // Selbstopfer (Kamikaze) zählt nicht
  const r = world.rules.keystone;
  // Bluff: Stirbt ein geworfener Verspotter vor Ablauf seiner Zeit, wirft das Katapult sofort gratis nach.
  if (e.defId === 'taunter' && e.thrownBy !== undefined && hasKeystone(world, e.owner, 'catapult')) {
    const c = world.get(e.thrownBy);
    const def = UNITS.catapult.launch!;
    if (c && c.alive && (c.pos.x - e.pos.x) ** 2 + (c.pos.y - e.pos.y) ** 2 <= def.range * def.range) {
      const ks = (c.ks ??= {});
      if (world.tick >= (ks.nextBluff ?? 0)) {
        ks.nextBluff = world.tick + Math.round(r.bluffCooldown * world.tps);
        throwTaunter(world, c, e.pos.x, e.pos.y);
        fireKeystone(world, e.owner, 'catapult');
      }
    }
  }
  // Nachzünder: Stirbt der Sprengetopp nahe seinem Ziel, explodiert er mit halber Wirkung an Ort und Stelle.
  if (e.defId === 'bomber' && hasKeystone(world, e.owner, 'bomber') && e.weapon) {
    const t = e.weapon.targetId ? world.get(e.weapon.targetId) : undefined;
    if (t && t.alive && (t.pos.x - e.pos.x) ** 2 + (t.pos.y - e.pos.y) ** 2 <= r.afterRadius * r.afterRadius) {
      const def = UNITS.bomber;
      const w = e.weapon.baseDef;
      const factor = (def.charges ? def.charges.kamikazeFactor : 1) * r.afterShare;
      const hits: Hit[] = [];
      for (const o of world.entities) {
        if (!o.alive || o.kind !== 'unit' || o.owner === e.owner) continue;
        if ((o.pos.x - e.pos.x) ** 2 + (o.pos.y - e.pos.y) ** 2 > 1.5 * 1.5 && o !== t) continue;
        if (o === t && (t.pos.x - e.pos.x) ** 2 + (t.pos.y - e.pos.y) ** 2 > 1.5 * 1.5) continue;
        const expected = woundsPerShot(w, defenseOf(world, o));
        if (expected > 0) hits.push({ target: o, wounds: 1, damage: w.damage * factor * expected, attacker: e.owner, src: 'bomber' });
      }
      if (hits.length > 0) {
        applyHits(world, hits);
        fireKeystone(world, e.owner, 'bomber');
      }
    }
  }
}

/** Verspotter werfen (Doppelwurf, Bluff) – wie ein normaler Wurf des Katapults. */
export function throwTaunter(world: World, c: Entity, x: number, y: number): void {
  const def = UNITS.catapult.launch!;
  world.flights.push({
    owner: c.owner,
    unit: def.unit,
    models: UNITS[def.unit].models,
    from: { x: c.pos.x, y: c.pos.y },
    to: { x, y },
    start: world.tick,
    land: world.tick + Math.max(1, Math.round(def.flight * world.tps)),
    route: c.mover?.route ?? 'mid',
    impact: def.impact,
    thrower: c.id,
  });
  world.emit({ type: 'launch', owner: c.owner, unit: def.unit, from: { x: c.pos.x, y: c.pos.y }, to: { x, y }, land: world.tick + Math.round(def.flight * world.tps) });
}

/** Doppelwurf: nach einem Wurf auf t ein zweites Ziel mindestens dwMinDist von t entfernt (nur mit zweiter Ladung). */
export function secondThrow(world: World, c: Entity, t: Entity): void {
  if (c.defId !== 'catapult' || !c.launcher || c.launcher.load <= 0 || !hasKeystone(world, c.owner, 'catapult')) return;
  const def = UNITS.catapult.launch!;
  const min = world.rules.keystone.dwMinDist;
  let best: Entity | null = null;
  let bestD = Infinity;
  for (const o of world.entities) {
    if (!o.alive || o.kind !== 'unit' || o.owner === c.owner || o === t) continue;
    if ((o.pos.x - t.pos.x) ** 2 + (o.pos.y - t.pos.y) ** 2 < min * min) continue;
    const d = (o.pos.x - c.pos.x) ** 2 + (o.pos.y - c.pos.y) ** 2;
    if (d > def.range * def.range || !world.isVisibleTo(c.owner, o)) continue;
    if (d < bestD || (d === bestD && best && o.id < best.id)) {
      bestD = d;
      best = o;
    }
  }
  if (!best) return; // nur ein Ziel: der zweite bleibt geladen
  c.launcher.load--;
  throwTaunter(world, c, best.pos.x, best.pos.y);
  fireKeystone(world, c.owner, 'catapult');
}

/** Rudel: je Sekunde – drei Hunde mit Schlussstein auf einer Lane heulen (hält packLinger s nach). */
export function updatePack(world: World): void {
  if (world.tick % world.tps !== 0) return;
  for (const p of [0, 1] as PlayerId[]) {
    if (!hasKeystone(world, p, 'hound')) continue;
    const n: Record<string, number> = { top: 0, mid: 0, bottom: 0 };
    for (const e of world.entities) if (e.alive && e.owner === p && e.defId === 'hound' && e.mover) n[e.mover.route]!++;
    for (const r of ['top', 'mid', 'bottom'] as const) {
      if (n[r]! < 3) continue;
      if (world.pack[p][r] <= world.tick) fireKeystone(world, p, 'hound');
      world.pack[p][r] = world.tick + Math.round(world.rules.keystone.packLinger * world.tps);
    }
  }
}

/** Rudel: Tempo-Faktor für Myriaden auf einer heulenden Lane. */
export function packSpeed(world: World, e: Entity): number {
  if (!e.mover || world.pack[e.owner][e.mover.route] <= world.tick) return 1;
  return 1 + world.rules.keystone.packSpeed;
}

/** Teilung: die Battlesphäre zerfällt bei splitAt in zwei Halbsphären. */
export function trySplit(world: World, t: Entity): void {
  if (t.defId !== 'sphere' || !t.alive || t.ks?.split || t.ks?.half || !hasKeystone(world, t.owner, 'sphere')) return;
  const r = world.rules.keystone;
  if (t.hp > r.splitAt * t.maxHp) return;
  const hp = r.splitHp * t.maxHp;
  const ks = (t.ks ??= {});
  ks.split = true;
  ks.half = true;
  t.maxHp = hp;
  t.modelWounds = hp;
  t.hp = hp;
  const twin = world.addUnit(t.owner, UNITS.sphere, { x: t.pos.x, y: t.pos.y + 0.6 }, t.mover!.route);
  twin.maxHp = hp;
  twin.modelWounds = hp;
  twin.hp = hp;
  twin.ks = { split: true, half: true };
  twin.mover!.committed = t.mover!.committed;
  twin.mover!.passedWaypoint = t.mover!.passedWaypoint;
  fireKeystone(world, t.owner, 'sphere');
}

/** Hochdruck: zwei Drohnen-Trupps in 3 Kacheln einziehen, dann pressureSeconds lang ohne Pause (alle pressureCooldown s). */
export function tryPressure(world: World, e: Entity, consumed: Map<Entity, number>): void {
  if (e.defId !== 'myrcannon' || !hasKeystone(world, e.owner, 'myrcannon')) return;
  const ks = (e.ks ??= {});
  if (world.tick < (ks.pressureUntil ?? 0) || world.tick < (ks.nextPressure ?? 0)) return;
  const take = UNITS.myrcannon.launch!.take!;
  const squads = world.entities
    .filter((o) => o.alive && o.owner === e.owner && o.defId === 'drone' && o.fuse === undefined && (o.pos.x - e.pos.x) ** 2 + (o.pos.y - e.pos.y) ** 2 <= 9)
    .filter((o) => Math.ceil(o.hp / o.modelWounds - 1e-9) - (consumed.get(o) ?? 0) >= 1)
    .sort((a, b) => a.id - b.id)
    .slice(0, 2);
  if (squads.length < 2) return;
  for (const s of squads) consumed.set(s, (consumed.get(s) ?? 0) + Math.min(take.models, Math.ceil(s.hp / s.modelWounds - 1e-9) - (consumed.get(s) ?? 0)));
  const r = world.rules.keystone;
  ks.pressureUntil = world.tick + Math.round(r.pressureSeconds * world.tps);
  ks.nextPressure = ks.pressureUntil + Math.round(r.pressureCooldown * world.tps);
  fireKeystone(world, e.owner, 'myrcannon');
}

/** Hochdruck aktiv? */
export function underPressure(world: World, e: Entity): boolean {
  return (e.ks?.pressureUntil ?? 0) > world.tick;
}

// ------------------------------------------------------------------ Schlussstein-Fenster (28.10. abends)

/** Kartenmitte (Kartendatum, sonst der mittlere Wegpunkt). */
export function mapCenter(world: World): { x: number; y: number } {
  return world.map.def.center ?? world.map.waypoints.mid;
}

/** Kantenlänge des Mittelfelds (Kartendatum, sonst Regel). */
export function centerSize(world: World): number {
  return world.map.def.centerSize ?? world.rules.keystoneGate.centerSize;
}

/** Wer ist gerade im Mittelfeld? [Spieler 0, Spieler 1] */
export function centerPresence(world: World): [boolean, boolean] {
  const c = mapCenter(world);
  const h = centerSize(world) / 2;
  const inside: [boolean, boolean] = [false, false];
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit') continue;
    if (Math.abs(e.pos.x - c.x) <= h && Math.abs(e.pos.y - c.y) <= h) inside[e.owner] = true;
  }
  return inside;
}

/** Wer hält gerade die Kartenmitte (mindestens ein eigener Verband darin, kein gegnerischer)? null = niemand. */
export function centerHolder(world: World): PlayerId | null {
  const inside = centerPresence(world);
  if (inside[0] && !inside[1]) return 0;
  if (inside[1] && !inside[0]) return 1;
  return null;
}

/** Ein Fenster gutschreiben: Guthaben bis maxCredits, darüber wartet es (pending). */
function grantWindow(world: World, p: PlayerId, early: boolean): void {
  const gate = world.players[p].gate;
  gate.opened++;
  if (early) gate.early++;
  if (gate.credits < world.rules.keystoneGate.maxCredits) gate.credits++;
  else gate.pending++;
  if (gate.openSince < 0 && gate.credits > 0) gate.openSince = world.tick;
  world.emit({ type: 'gate', owner: p, early });
}

/**
 * Fenster öffnen (im 2,5-Minuten-Takt ab 10:00 und vorzeitig über die gehaltene Mitte), einmal je Sekunde. Alle Zeiten
 * aus Ticks (Lockstep). Der Mitte-Fortschritt steigt je gehaltener Sekunde um 1 und fällt ohne Kontrolle so, dass ein
 * voller Ring in centerDecay s leer ist.
 */
export function updateGates(world: World): void {
  if (world.tick % world.tps !== 0) return;
  const g = world.rules.keystoneGate;
  const holder = g.center ? centerHolder(world) : null;
  for (const p of [0, 1] as PlayerId[]) {
    const gate = world.players[p].gate;
    if (world.tick >= gate.next) {
      grantWindow(world, p, false);
      gate.next += Math.round(g.every * world.tps);
    }
    if (holder === p) {
      if (gate.holdSince < 0) gate.holdSince = world.tick;
      const before = gate.hold;
      gate.hold = Math.min(g.centerHold, gate.hold + 1);
      if (before < 20 && gate.hold >= 20) world.emit({ type: 'center', owner: p, held: 20 });
      if (gate.hold >= g.centerHold) {
        // Vorzeitig: das nächste Fenster öffnet jetzt, der Takt läuft ab hier weiter; die Mitte muss neu gehalten werden.
        grantWindow(world, p, true);
        gate.next = world.tick + Math.round(g.every * world.tps);
        gate.hold = 0;
        gate.holdSince = world.tick;
      }
    } else {
      gate.holdSince = -1;
      gate.hold = Math.max(0, gate.hold - g.centerHold / Math.max(1, g.centerDecay));
    }
  }
}

/** Alle Schlussstein-Upgrades der Fraktion, nach Karte gruppiert (Türen des Technoclans auf einer Karte). */
export function keystoneCardsOf(world: World, p: PlayerId): { unit: UnitId; upgrades: string[] }[] {
  const cards = new Map<UnitId, string[]>();
  for (const u of world.players[p].faction.upgrades) {
    if (!u.keystone) continue;
    const list = cards.get(u.unit) ?? [];
    list.push(u.id);
    cards.set(u.unit, list);
  }
  return [...cards].map(([unit, upgrades]) => ({ unit, upgrades }));
}

/** Ist dieser Schlussstein (oder seine andere Tür) schon gewählt? */
export function keystoneTaken(world: World, p: PlayerId, upgrades: readonly string[]): boolean {
  const r = world.players[p].research;
  return upgrades.some((id) => r.includes(id));
}

/**
 * Wählbare Karten in Anzeige-Reihenfolge: zuerst Einheiten auf dem Feld (meiste lebende Verbände zuerst; Terra-Former:
 * Wächter + Gerufene ihrer Linie), dann mit vorhandener Fabrik, dann der Rest; Gleichstand nach Datenreihenfolge.
 */
export function keystoneChoices(world: World, p: PlayerId): { unit: UnitId; upgrades: string[]; alive: number; factory: boolean }[] {
  const alive = new Map<string, number>();
  for (const e of world.entities) {
    if (!e.alive || e.owner !== p || e.kind !== 'unit') continue;
    const id = e.defId as UnitId;
    const key = lineUnit(id);
    alive.set(key, (alive.get(key) ?? 0) + 1);
    if (key !== id) alive.set(id, (alive.get(id) ?? 0) + 1);
  }
  const buildable = new Set<string>(researchableUnits(world, p).map((u) => lineUnit(u)));
  return keystoneCardsOf(world, p)
    .filter((c) => !keystoneTaken(world, p, c.upgrades))
    .map((c, order) => ({ ...c, alive: alive.get(c.unit) ?? 0, factory: buildable.has(c.unit), order }))
    .sort((a, b) => (b.alive > 0 ? 1 : 0) - (a.alive > 0 ? 1 : 0) || b.alive - a.alive || Number(b.factory) - Number(a.factory) || a.order - b.order)
    .map(({ order: _o, ...c }) => c);
}

/** Darf Spieler p diesen Schlussstein jetzt wählen? */
export function checkKeystone(world: World, p: PlayerId, upgradeId: string): { ok: true; cost: number } | { ok: false; reason: string } {
  const pl = world.players[p];
  const u = pl.faction.upgrades.find((x) => x.id === upgradeId);
  if (!u || !u.keystone) return { ok: false, reason: 'Kein Schlussstein' };
  if (pl.research.includes(u.id)) return { ok: false, reason: 'Schon gewählt' };
  if (u.fork && pl.faction.upgrades.some((x) => x.fork === u.fork && x.id !== u.id && pl.research.includes(x.id))) return { ok: false, reason: 'Die andere Tür ist schon gewählt' };
  if (pl.gate.credits <= 0) {
    const next = Math.max(0, Math.ceil((pl.gate.next - world.tick) / world.tps));
    return { ok: false, reason: `Kein Schlussstein-Fenster offen – das nächste in ${Math.floor(next / 60)}:${String(next % 60).padStart(2, '0')}` };
  }
  const cost = world.rules.keystoneGate.cost;
  if (pl.energy < cost) return { ok: false, reason: `Zu wenig Energie (${cost} nötig)` };
  return { ok: true, cost };
}

/** Schlussstein wählen: sofort wirksam, verbraucht ein Guthaben; ein wartendes Fenster rückt nach. */
export function chooseKeystone(world: World, p: PlayerId, upgradeId: string): { ok: true } | { ok: false; reason: string } {
  const c = checkKeystone(world, p, upgradeId);
  if (!c.ok) return c;
  const pl = world.players[p];
  const gate = pl.gate;
  pl.energy -= c.cost;
  gate.credits--;
  gate.bought++;
  gate.byKeystone[upgradeId] = gate.bought;
  gate.chosen.push({ upgrade: upgradeId, tick: world.tick });
  if (gate.pending > 0) {
    gate.pending--;
    gate.credits++;
  }
  gate.openSince = gate.credits > 0 ? world.tick : -1;
  pl.research.push(upgradeId);
  pl.stats.research++;
  pl.stats.decisions++;
  pl.stats.keystoneAt.push(world.tick / world.tps / 60);
  world.emit({ type: 'keystone', owner: p, upgrade: upgradeId });
  return { ok: true };
}

/** Welcher Schlussstein gilt für diese Einheitenart (eigene Wahl, Tür oder Linie)? null = keiner. */
export function keystoneUpgradeOf(world: World, p: PlayerId, unit: UnitId): string | null {
  const r = world.players[p].research;
  const own = keystoneId(unit);
  const line = keystoneId(lineUnit(unit));
  return r.find((id) => id === own || id === line || id.startsWith(`${own}-`)) ?? null;
}

/**
 * Kennt `viewer` den Schlussstein von `owner`? Eigene immer; gegnerische nach revealDelay s oder, wenn ein Spähbericht
 * nach der Wahl angekommen ist, sofort.
 */
export function keystoneKnown(world: World, viewer: PlayerId, owner: PlayerId, upgradeId: string): boolean {
  if (viewer === owner) return true;
  const c = world.players[owner].gate.chosen.find((x) => x.upgrade === upgradeId);
  if (!c) return world.players[owner].research.includes(upgradeId); // ältere Partien / Tests ohne Wahl-Eintrag
  if (world.tick - c.tick >= world.rules.keystoneGate.revealDelay * world.tps) return true;
  const rep = world.players[viewer].scout.last;
  return !!rep && rep.tick >= c.tick;
}
