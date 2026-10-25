import { VERBUND, VERBUND_UNITS, verbundKey } from '../../data/verbund';
import type { TechMods, VerbundUnit } from '../../data/verbund';
import type { ProtocolId, UnitId } from '../../data/units';
import type { Entity } from '../entity';
import { ROUTES } from '../types';
import type { PlayerId, Route } from '../types';
import type { World } from '../world';
import { applyHits } from './combat';
import type { Hit } from './combat';
import { withProtocols } from './network';

/**
 * Technoclan-Verbund, Bausteine und Eliten (25.10., mit dem Nutzer besprochen; Daten in data/verbund.ts):
 *
 * - **Verbund:** Je Lane bilden die zwei Fabriken mit der höchsten Stufe (Gleichstand: die ältere) einen Verbund aus den
 *   Einheiten, die sie gerade bauen. Ein neuer oder geänderter Verbund gilt erst nach der Einspielzeit; fällt eine der
 *   beiden Fabriken weg, wechselt sie Lane oder Einheit, endet er sofort. Es profitieren alle Einheiten dieser beiden
 *   Fabriken auf der Lane.
 * - **Elite:** ab `eliteAt` Bausteinen. +25 % Leben, jeder Baustein in seiner Elite-Fassung (doppelt +50 %, dreifach
 *   +75 %), und die Verbund-Wirkung, die sie beim Aufstieg hatte, behält sie (Prägung).
 *
 * Alles läuft einmal je Sekunde; die Wirkung im Kampf lesen combat.ts und hitmath.ts aus `e.tech`.
 */
export function updateVerbund(world: World): void {
  if (world.tick % world.tps !== 0) return;
  for (const p of [0, 1] as PlayerId[]) {
    if (!world.players[p].faction.network) continue;
    for (const r of ROUTES) updateLane(world, p, r);
  }
  burnFields(world);
  const detectors: [{ x: number; y: number; r: number }[], { x: number; y: number; r: number }[]] = [[], []];
  const heals: { e: Entity; amount: number }[] = [];
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit' || !e.net) continue;
    refreshTech(world, e);
    const fx = e.tech?.eliteFx;
    if (fx?.detect) detectors[e.owner].push({ x: e.pos.x, y: e.pos.y, r: e.vision });
    if (fx && fx.heal > 0) heals.push({ e, amount: fx.heal });
  }
  world.detectors = detectors;
  // Elite-Selbstreparatur: heilt eigene Nachbarn im Radius 2 (erst sammeln, dann anwenden – reihenfolgefrei).
  for (const { e, amount } of heals) {
    for (const o of world.entities) {
      if (!o.alive || o.kind !== 'unit' || o.owner !== e.owner || o === e || o.hp >= o.maxHp) continue;
      if ((o.pos.x - e.pos.x) ** 2 + (o.pos.y - e.pos.y) ** 2 > 4) continue;
      o.hp = Math.min(o.maxHp, o.hp + amount);
    }
  }
}

/** Verbund einer Lane bestimmen (Einspielzeit, sofortiges Ende). */
function updateLane(world: World, p: PlayerId, r: Route): void {
  const st = world.verbund[p][r];
  const factories = world.entities
    .filter((b) => b.alive && b.owner === p && b.kind === 'building' && b.producer && b.producer.route === r && (VERBUND_UNITS as readonly string[]).includes(b.producer.unit))
    .sort((a, b) => b.producer!.level - a.producer!.level || a.id - b.id);
  const unitOf = (b: Entity): VerbundUnit => b.producer!.unit as VerbundUnit;
  const cand = factories.length >= 2 ? { key: verbundKey(unitOf(factories[0]!), unitOf(factories[1]!)), factories: [factories[0]!.id, factories[1]!.id] as [number, number] } : null;
  // Der aktive Verbund endet sofort, wenn eine seiner Fabriken nicht mehr dazu passt.
  if (st.active) {
    const ok = st.active.factories.every((id) => {
      const b = world.get(id);
      return !!b && b.alive && b.producer?.route === r && !!cand && cand.factories.includes(id);
    }) && cand?.key === st.active.key;
    if (!ok) st.active = null;
  }
  if (!cand) {
    st.pending = null;
    return;
  }
  if (st.active && st.active.key === cand.key) {
    st.pending = null;
  } else if (st.pending && st.pending.key === cand.key && st.pending.factories.join() === cand.factories.join()) {
    if (world.tick >= st.pending.at) {
      st.active = { key: cand.key, factories: cand.factories };
      st.pending = null;
      world.emit({ type: 'verbund', owner: p, route: r, key: cand.key });
    }
  } else {
    st.pending = { ...cand, at: world.tick + Math.round(world.rules.verbund.switchSeconds * world.tps) };
  }
  if (st.active) {
    const s = world.players[p].stats.verbundSeconds;
    s[st.active.key] = (s[st.active.key] ?? 0) + 1;
  }
}

/** Welcher Verbund gilt gerade für diese Einheit (Fabrik im aktiven Verbund ihrer Lane)? */
export function verbundOf(world: World, e: Entity): string | null {
  if (e.fromBuilding === undefined || !e.mover) return null;
  const st = world.verbund[e.owner][e.mover.route];
  if (!st.active || !st.active.factories.includes(e.fromBuilding)) return null;
  return VERBUND[st.active.key]?.mods[e.defId as VerbundUnit] ? st.active.key : null;
}

/** Aufstieg zur Elite: +25 % Leben (über refreshTech), Prägung = Geburts-Verbund, sonst der gerade aktive. */
export function becomeElite(world: World, e: Entity): void {
  if (e.elite) return;
  e.elite = { print: e.verbundPrint ?? verbundOf(world, e), since: world.tick };
  world.players[e.owner].stats.elites++;
  world.emit({ type: 'elite', owner: e.owner, unit: e.defId as UnitId, pos: { x: e.pos.x, y: e.pos.y } });
}

const DUP = [0, 1, 1.5, 1.75] as const;

function count(protocols: readonly ProtocolId[], p: ProtocolId): number {
  let n = 0;
  for (const q of protocols) if (q === p) n++;
  return n;
}

function merge(into: TechMods, m: TechMods | undefined): void {
  if (!m) return;
  if (m.range) into.range = (into.range ?? 0) + m.range;
  if (m.hit) into.hit = (into.hit ?? 0) + m.hit;
  if (m.ap) into.ap = (into.ap ?? 0) + m.ap;
  if (m.splash) into.splash = (into.splash ?? 0) + m.splash;
  if (m.toughness) into.toughness = (into.toughness ?? 0) + m.toughness;
  if (m.vision) into.vision = (into.vision ?? 0) + m.vision;
  if (m.hp) into.hp = (into.hp ?? 1) * m.hp;
  if (m.speed) into.speed = (into.speed ?? 1) * m.speed;
  if (m.damageTaken) into.damageTaken = (into.damageTaken ?? 1) * m.damageTaken;
  if (m.structure) into.structure = (into.structure ?? 1) * m.structure;
  if (m.wallBreak) into.wallBreak = (into.wallBreak ?? 1) * m.wallBreak;
  if (m.blastPerModel) into.blastPerModel = true;
  if (m.precision) into.precision = true;
  if (m.still) into.still = m.still;
  if (m.guard) into.guard = m.guard;
  if (m.slowHit) into.slowHit = m.slowHit;
  if (m.burnField) into.burnField = m.burnField;
  if (m.crack) into.crack = !into.crack || m.crack.level > into.crack.level ? m.crack : into.crack;
}

/**
 * Wirkung einer Technoclan-Einheit neu berechnen: gestapelte Panzerung, Verbund (oder Prägung), Elite. Setzt Leben,
 * Widerstand, Sicht, Tempo und die Waffe; die bedingten Teile (Ansitz, Schutz) liest der Kampf.
 */
export function refreshTech(world: World, e: Entity): void {
  if (!e.net || e.kind !== 'unit') return;
  const t = (e.tech ??= {
    key: '',
    mods: {},
    eliteFx: null,
    base: { maxHp: e.maxHp, toughness: e.toughness, vision: e.vision, speed: e.mover?.speed ?? 0 },
    sig: '',
    still: world.tick,
    lastPos: { x: e.pos.x, y: e.pos.y },
    lastTarget: 0,
    guardOn: false,
  });
  // Ansitz: seit wann steht er still?
  if ((e.pos.x - t.lastPos.x) ** 2 + (e.pos.y - t.lastPos.y) ** 2 > 0.01) t.still = world.tick;
  t.lastPos = { x: e.pos.x, y: e.pos.y };

  const protocols = e.net.protocols;
  const mods: TechMods = {};
  // Gestapelte Panzerung (die eigene erste Kopie des Koloss steckt in seinen Werten).
  const plating = count(protocols, 'plating');
  for (let c = protocols[0] === 'plating' ? 2 : 1; c <= Math.min(3, plating); c++) merge(mods, c === 1 ? { toughness: 1 } : { damageTaken: c === 2 ? 0.9 : 0.95 });
  // Verbund bzw. Prägung
  if (!e.verbundPrint) {
    const v = verbundOf(world, e);
    if (v) e.verbundPrint = v;
  }
  const key = e.elite?.print ?? e.verbundPrint ?? '';
  if (key) merge(mods, VERBUND[key]?.mods[e.defId as VerbundUnit]);
  // Elite
  let fx: NonNullable<typeof t.eliteFx> | null = null;
  if (e.elite) {
    fx = { headshot: 0, splashFull: false, mark: false, detect: false, heal: 0 };
    mods.hp = (mods.hp ?? 1) * world.rules.network.eliteHp;
    const n = (p: ProtocolId): number => count(protocols, p);
    const b = (p: ProtocolId): number => DUP[Math.min(3, n(p))]!;
    if (n('antiHeavy')) fx.headshot = 1 * b('antiHeavy');
    if (n('area')) fx.splashFull = true;
    if (n('mark')) fx.mark = true;
    if (n('range')) {
      fx.detect = true;
      merge(mods, { range: 2 + 0.5 * (n('range') - 1), vision: 3 + (n('range') - 1) });
    }
    if (n('pierce')) merge(mods, { crack: { seconds: 4, level: n('pierce') >= 2 ? 2 : 1 } });
    if (n('plating')) merge(mods, { toughness: 1, damageTaken: [1, 0.8, 0.7, 0.65][Math.min(3, n('plating'))]! });
    if (n('repair')) fx.heal = 2 * b('repair');
  }
  t.key = key;
  t.mods = mods;
  t.eliteFx = fx;
  // Schutz (Deckungsfeuer, Geleitschutz, Aufklärungspanzer): steht eine eigene Einheit der Art nah genug?
  t.guardOn = !!mods.guard && world.entities.some((o) => o.alive && o.owner === e.owner && o.defId === mods.guard!.near && (o.pos.x - e.pos.x) ** 2 + (o.pos.y - e.pos.y) ** 2 <= mods.guard!.radius ** 2);

  // Werte setzen (immer von den Grundwerten aus)
  const maxHp = t.base.maxHp * (mods.hp ?? 1);
  if (Math.abs(maxHp - e.maxHp) > 1e-9) {
    const k = maxHp / e.maxHp;
    e.hp *= k;
    e.modelWounds *= k;
    e.maxHp = maxHp;
  }
  e.toughness = t.base.toughness + (mods.toughness ?? 0);
  e.vision = t.base.vision + (mods.vision ?? 0);
  if (e.mover) e.mover.speed = t.base.speed * (mods.speed ?? 1);
  // Waffe nur neu bauen, wenn sich etwas geändert hat
  const sig = `${protocols.join(',')}|${key}|${e.elite ? 1 : 0}`;
  if (sig !== t.sig && e.weapon) {
    t.sig = sig;
    let w = withProtocols(e.weapon.baseDef, protocols);
    if (fx?.splashFull) w = { ...w, splash: Math.max(w.splash ?? 0, 1.5 + 0.25 * (count(protocols, 'area') - 1)) };
    if (mods.range) w = { ...w, range: w.range + mods.range };
    if (mods.hit) w = { ...w, skill: Math.max(2, w.skill - mods.hit) };
    if (mods.ap) w = { ...w, ap: w.ap + mods.ap };
    if (mods.splash) w = { ...w, splash: (w.splash ?? 0) + mods.splash };
    if (mods.blastPerModel && w.blast) w = { ...w, blast: 1 };
    e.weapon.def = w;
  }
}

/** Brandfelder: Gegner im Feld nehmen einmal je Sekunde Schaden; abgelaufene verschwinden. */
function burnFields(world: World): void {
  if (world.groundFields.length === 0) return;
  world.groundFields = world.groundFields.filter((f) => world.tick < f.until);
  const hits: Hit[] = [];
  for (const f of world.groundFields) {
    const r2 = f.radius * f.radius;
    for (const o of world.entities) {
      if (!o.alive || o.kind !== 'unit' || o.owner === f.owner) continue;
      if ((o.pos.x - f.pos.x) ** 2 + (o.pos.y - f.pos.y) ** 2 > r2) continue;
      hits.push({ target: o, wounds: 1, damage: f.dps, attacker: f.owner, src: f.src });
    }
  }
  if (hits.length) applyHits(world, hits);
}
