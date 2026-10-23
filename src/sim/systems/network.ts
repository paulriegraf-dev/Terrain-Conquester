import type { ProtocolId, WeaponDef } from '../../data/units';
import type { Entity } from '../entity';
import type { World } from '../world';

/**
 * Technoclan-Netzwerk („Information geht nicht verloren“ – Gegenstück zu „Materie geht nicht verloren“
 * der Myriaden), automatisch, ohne Befehl:
 *
 * - Verbände VERSCHIEDENER Art auf derselben Route verbinden sich, wenn sie nah beieinander sind
 *   (rules.network.joinRadius), zu einem Netz aus bis zu `maxMembers` Mitgliedern – mit dem Commander
 *   als Knoten bis `maxWithNode`. Ein Mitglied verlässt das Netz, wenn kein anderes mehr in
 *   `breakRadius` ist. Netze sind als leuchtende Linien sichtbar – auch für den Gegner.
 * - Jede Art bringt ein Protokoll mit (UnitDef.protocol). Stirbt ein Mitglied, erbt ein überlebendes
 *   Mitglied seine Protokolle (wer am wenigsten hat). Geerbte Protokolle wirken auf die eigene Waffe
 *   (z. B. Zielmarkierung: Treffen +1); die eigene Panzerklasse bleibt.
 * - Ab `ascendAt` Protokollen steigt ein Verband auf: `ascendSeconds` lang feuert er schneller.
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
      .filter((o) => o !== u && o.net!.id === 0 && o.owner === u.owner && o.mover!.route === u.mover!.route && o.defId !== u.defId && within(u, o, rules.joinRadius))
      .sort((a, b) => dist2(u, a) - dist2(u, b) || a.id - b.id);
    if (mates.length === 0) continue;
    const members: Entity[] = [u];
    for (const o of mates) {
      if (members.some((m) => m.defId === o.defId)) continue;
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
  const heal = rules.repairPerSecond;
  for (const e of world.entities) {
    if (!e.alive || !e.net || e.hp >= e.maxHp) continue;
    if (e.net.protocols.indexOf('repair') > 0) e.hp = Math.min(e.maxHp, e.hp + heal);
  }
}

/** Einem bestehenden Netz in der Nähe beitreten (gleiche Route, Platz frei, Art noch nicht vertreten). */
function joinExisting(world: World, u: Entity): boolean {
  const rules = world.rules.network;
  for (const [id, ids] of world.networks) {
    const members = ids.map((m) => world.get(m)!).filter((e) => e && e.alive);
    if (members.length === 0 || members[0]!.owner !== u.owner) continue;
    if (members.some((m) => m.defId === u.defId) || members[0]!.mover?.route !== u.mover!.route) continue;
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
  for (const p of net.protocols) {
    if (p === 'node') continue;
    let heir: Entity | null = null;
    for (const o of survivors) {
      const have = o.net!.protocols;
      if (have.includes(p)) continue;
      if (!heir || have.length < heir.net!.protocols.length || (have.length === heir.net!.protocols.length && o.id < heir.id)) heir = o;
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
  if (p === 'plating') e.toughness += 1;
  if (e.weapon) e.weapon.def = withProtocols(e.weapon.baseDef, net.protocols.slice(1));
  const rules = world.rules.network;
  const ascend = net.protocols.length >= rules.ascendAt && net.ascendUntil === 0;
  if (ascend) net.ascendUntil = world.tick + Math.round(rules.ascendSeconds * world.tps);
  world.emit({ type: 'protocol', owner: e.owner, protocol: p, from: { x: from.pos.x, y: from.pos.y }, to: { x: e.pos.x, y: e.pos.y }, ascend });
}

/** Waffe mit geerbten Protokollen (das eigene ist schon in der Waffe enthalten). */
export function withProtocols(base: WeaponDef, inherited: readonly ProtocolId[]): WeaponDef {
  let w: WeaponDef = base;
  for (const p of inherited) {
    if (p === 'antiHeavy') w = { ...w, anti: { ...w.anti, heavy: Math.min(w.anti?.heavy ?? 6, 2) } };
    else if (p === 'area') w = { ...w, splash: Math.max(w.splash ?? 0, 1) };
    else if (p === 'mark') w = { ...w, skill: Math.max(2, w.skill - 1) };
    else if (p === 'range') w = { ...w, range: w.range + 1.5 };
    else if (p === 'pierce') w = { ...w, ap: w.ap + 2 };
  }
  return w;
}

/** Steigt der Verband gerade auf (schnelleres Feuer)? */
export function ascending(world: World, e: Entity): boolean {
  return !!e.net && world.tick < e.net.ascendUntil;
}
