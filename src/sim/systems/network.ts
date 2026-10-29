import type { ProtocolId, WeaponDef } from '../../data/units';
import type { Entity } from '../entity';
import type { World } from '../world';
import { becomeElite, refreshTech } from './verbund';

/**
 * Technoclan-Netzwerk („Information geht nicht verloren“ – Gegenstück zu „Materie geht nicht verloren“
 * der Myriaden), automatisch, ohne Befehl:
 *
 * - Verbände auf derselben Route verbinden sich, wenn sie nah beieinander sind (rules.network.joinRadius), zu einem
 *   Netz aus bis zu `maxMembers` Mitgliedern – mit dem Commander als Knoten bis `maxWithNode`. Seit 25.10. auch
 *   gleiche Arten, höchstens `maxTypes` verschiedene Arten je Netz. Ein Mitglied verlässt das Netz, wenn kein
 *   anderes mehr in `breakRadius` ist. Netze sind als leuchtende Linien sichtbar – auch für den Gegner.
 * - Jede Art bringt ein Protokoll (Baustein) mit (UnitDef.protocol). Stirbt ein Mitglied, droppt es NUR den
 *   Baustein seines Typs (25.10.), und das nächste lebende Mitglied fängt ihn auf – auch eine gleiche Art; gleiche
 *   Bausteine stapeln mit abnehmender Wirkung (withProtocols). Ohne Netz geht der Baustein verloren.
 * - Ab `eliteAt` Bausteinen wird ein Verband Elite (siehe verbund.ts) und nimmt keine Bausteine mehr auf.
 */
export function updateNetworks(world: World): void {
  if (world.tick % world.tps !== 0) return;
  const rules = world.rules.network;
  // 1. Wer kein anderes Mitglied mehr in der Nähe hat, verlässt sein Netz.
  for (const [id, members] of world.networks) {
    const alive = members.map((m) => world.get(m)).filter((e): e is Entity => !!e && e.alive);
    const keep = alive.filter((e) => alive.some((o) => o !== e && within(e, o, rules.breakRadius)));
    for (const e of alive) if (!keep.includes(e)) e.net!.id = 0;
    if (keep.length < 2) {
      for (const e of keep) e.net!.id = 0;
      world.networks.delete(id);
    } else {
      world.networks.set(id, keep.map((e) => e.id));
    }
  }
  // 2. Freie Verbände treten einem Netz in der Nähe bei oder bilden ein neues.
  const free = world.entities.filter((e) => e.alive && e.net && e.net.id === 0 && e.mover);
  for (const u of free) {
    if (u.net!.id !== 0) continue;
    if (joinExisting(world, u)) continue;
    const mates = free
      .filter((o) => o !== u && o.net!.id === 0 && o.owner === u.owner && o.mover!.route === u.mover!.route && within(u, o, rules.joinRadius))
      .sort((a, b) => dist2(u, a) - dist2(u, b) || a.id - b.id);
    if (mates.length === 0) continue;
    const members: Entity[] = [u];
    for (const o of mates) {
      if (!typesOk([...members, o], rules)) continue;
      if (members.length >= capacity(members, rules)) break;
      members.push(o);
    }
    if (members.length < 2) continue;
    const id = world.nextNetId++;
    for (const m of members) m.net!.id = id;
    world.networks.set(id, members.map((m) => m.id));
    for (let k = 1; k < members.length; k++) emitLink(world, members[k]!, members.slice(0, k));
  }
  // 3. Geerbte Selbstreparatur
  // Gestapelt (25.10.): 1. Kopie 3 Leben/s, 2. +1,5, 3. +0,75 – die eigene erste Kopie ist die Heilung des Nano-Heilers.
  const heal = rules.repairPerSecond;
  for (const e of world.entities) {
    if (!e.alive || !e.net || e.hp >= e.maxHp) continue;
    const n = e.net.protocols.filter((p) => p === 'repair').length - (e.net.protocols[0] === 'repair' ? 1 : 0);
    if (n > 0) e.hp = Math.min(e.maxHp, e.hp + heal * [0, 1, 1.5, 1.75][Math.min(3, n)]!);
  }
}

/** Einem bestehenden Netz in der Nähe beitreten (gleiche Route, Platz frei, Art noch nicht vertreten). */
function joinExisting(world: World, u: Entity): boolean {
  const rules = world.rules.network;
  for (const [id, ids] of world.networks) {
    const members = ids.map((m) => world.get(m)!).filter((e) => e && e.alive);
    if (members.length === 0 || members[0]!.owner !== u.owner) continue;
    if (!typesOk([...members, u], rules) || members[0]!.mover?.route !== u.mover!.route) continue;
    if (members.length >= capacity([...members, u], rules)) continue;
    if (!members.some((m) => within(m, u, rules.joinRadius))) continue;
    u.net!.id = id;
    ids.push(u.id);
    emitLink(world, u, members);
    return true;
  }
  return false;
}

/** Nur für die Darstellung: kurze Lichtlinie vom Neuen zum nächsten Mitglied. */
function emitLink(world: World, u: Entity, members: readonly Entity[]): void {
  let near = members[0]!;
  for (const m of members) if (dist2(u, m) < dist2(u, near)) near = m;
  world.emit({ type: 'link', owner: u.owner, from: { x: u.pos.x, y: u.pos.y }, to: { x: near.pos.x, y: near.pos.y } });
}

/** Höchstens `maxTypes` verschiedene Einheitenarten in einem Netz. */
function typesOk(members: readonly Entity[], rules: World['rules']['network']): boolean {
  return new Set(members.map((m) => m.defId)).size <= rules.maxTypes;
}

function capacity(members: readonly Entity[], rules: World['rules']['network']): number {
  return members.some((m) => m.net?.protocols[0] === 'node') ? rules.maxWithNode : rules.maxMembers;
}

function within(a: Entity, b: Entity, r: number): boolean {
  return dist2(a, b) <= r * r;
}

function dist2(a: Entity, b: Entity): number {
  const dx = a.pos.x - b.pos.x;
  const dy = a.pos.y - b.pos.y;
  return dx * dx + dy * dy;
}

/**
 * Ein Netz-Mitglied fällt: Seine Protokolle gehen an überlebende Mitglieder (jeweils an das mit den
 * wenigsten Protokollen, das es noch nicht hat). Den Knoten (Commander) erbt niemand.
 */
export function onNetworkDeath(world: World, e: Entity): void {
  const net = e.net;
  if (!net || net.id === 0) return;
  const id = net.id;
  net.id = 0;
  const ids = world.networks.get(id);
  if (!ids) return;
  const survivors = ids.filter((m) => m !== e.id).map((m) => world.get(m)).filter((o): o is Entity => !!o && o.alive);
  // 25.10.: Nur der Baustein des eigenen Typs fällt, und ihn fängt das nächste lebende Mitglied auf (keine Elite).
  const p = net.protocols[0];
  if (p && p !== 'node') {
    let heir: Entity | null = null;
    let best = Infinity;
    for (const o of survivors) {
      if (o.elite) continue;
      const d = dist2(o, e);
      if (d < best || (d === best && heir && o.id < heir.id)) {
        heir = o;
        best = d;
      }
    }
    if (heir) inherit(world, heir, p, e);
  }
  if (survivors.length < 2) {
    for (const o of survivors) o.net!.id = 0;
    world.networks.delete(id);
  } else {
    world.networks.set(id, survivors.map((o) => o.id));
  }
}

/** Protokoll übernehmen: Waffe neu berechnen, ab genug Protokollen aufsteigen. */
function inherit(world: World, e: Entity, p: ProtocolId, from: Entity): void {
  const net = e.net!;
  net.protocols.push(p);
  world.players[e.owner].stats.blocks++;
  const elite = net.protocols.length >= world.rules.network.eliteAt;
  const rising = elite && !e.elite;
  if (elite) becomeElite(world, e);
  refreshTech(world, e);
  if (rising) e.hp = e.maxHp; // Aufstieg (29.10.): Maximalleben wächst und die Einheit wird voll geheilt (auch gefallene Modelle kehren zurück)
  world.emit({ type: 'protocol', owner: e.owner, protocol: p, from: { x: from.pos.x, y: from.pos.y }, to: { x: e.pos.x, y: e.pos.y }, ascend: elite });
}

/**
 * Waffe mit allen Bausteinen (25.10.: gestapelt). `protocols` = alle, das eigene zuerst; dessen erste Kopie steckt
 * schon in den Werten der Einheit. Jede weitere Kopie wirkt schwächer (siehe data/verbund.ts BLOCKS).
 */
export function withProtocols(base: WeaponDef, protocols: readonly ProtocolId[]): WeaponDef {
  let w: WeaponDef = base;
  const own = protocols[0];
  const seen: Partial<Record<ProtocolId, number>> = {};
  for (let k = 0; k < protocols.length; k++) {
    const p = protocols[k]!;
    const copy = (seen[p] = (seen[p] ?? 0) + 1);
    if (k === 0) continue; // die eigene erste Kopie ist schon eingerechnet
    void own;
    if (p === 'antiHeavy') w = copy === 1 ? { ...w, anti: { ...w.anti, heavy: Math.min(w.anti?.heavy ?? 6, 2) } } : { ...w, vs: { ...w.vs, heavy: (w.vs?.heavy ?? 1) * (copy === 2 ? 1.1 : 1.05) } };
    else if (p === 'area') w = copy === 1 ? { ...w, splash: Math.max(w.splash ?? 0, 1) } : { ...w, splash: (w.splash ?? 0) + (copy === 2 ? 0.3 : 0.2) };
    else if (p === 'mark') w = copy === 1 ? { ...w, skill: Math.max(2, w.skill - 1) } : { ...w, damage: w.damage * (copy === 2 ? 1.1 : 1.05) };
    else if (p === 'range') w = { ...w, range: w.range + (copy === 1 ? 1.5 : copy === 2 ? 0.5 : 0.25) };
    else if (p === 'pierce') w = { ...w, ap: w.ap + (copy === 1 ? 2 : copy === 2 ? 1 : 0) };
  }
  return w;
}

/** Steigt der Verband gerade auf (schnelleres Feuer)? */
export function ascending(world: World, e: Entity): boolean {
  return !!e.net && world.tick < e.net.ascendUntil;
}
