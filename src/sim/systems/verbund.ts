import type { TechMods } from '../../data/verbund';
import type { ProtocolId, UnitId } from '../../data/units';
import type { Entity } from '../entity';
import type { World } from '../world';
import { applyHits } from './combat';
import type { Hit } from './combat';
import { withProtocols } from './network';
import { TRICK, hasTrick, stillSeconds } from './tricks';
import { hasKeystone } from './keystone';

/**
 * Technoclan-Technik (v2, 16.11.): Der Verbund (Lane-Kombinationen) und die Netze sind aus dem Spiel genommen. Geblieben:
 * Elite (über das Fabrik-Verhalten „Eliteprogramm“, jeder 4. Verband) mit der Elite-Fassung des eigenen Protokolls, und die
 * Kniffe/Schlusssteine, die als Werte auf die Waffe wirken (Ruhige Hand, Plasmabrand, Rammbock, Glutfeld).
 *
 * Alles läuft einmal je Sekunde; die Wirkung im Kampf lesen combat.ts und hitmath.ts aus `e.tech`.
 */
export function updateVerbund(world: World): void {
  if (world.tick % world.tps !== 0) return;
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

/** Welcher Verbund gilt gerade für diese Einheit (Fabrik im aktiven Verbund ihrer Lane)? */
export function verbundOf(_world: World, _e: Entity): string | null {
  return null; // v2 (16.11.): kein Verbund mehr
}

/** Aufstieg zur Elite: Leben ×rules.network.eliteHp (über refreshTech; die Heilung auf volles Leben macht inherit), Prägung = Geburts-Verbund, sonst der gerade aktive. */
export function becomeElite(world: World, e: Entity): void {
  if (e.elite) return;
  e.elite = { print: null, since: world.tick };
  world.players[e.owner].stats.elites++;
  world.emit({ type: 'elite', owner: e.owner, unit: e.defId as UnitId, pos: { x: e.pos.x, y: e.pos.y } });
}

const DUP = [0, 1, 1.5, 1.75] as const;

/**
 * Dominierender Baustein einer Elite: der häufigste. Gleichstand: die eigene Grundart, wenn sie dabei ist,
 * sonst der zuletzt aufgenommene.
 */
export function dominantProtocol(protocols: readonly ProtocolId[]): ProtocolId | null {
  if (protocols.length === 0) return null;
  let max = 0;
  for (const p of protocols) max = Math.max(max, count(protocols, p));
  const own = protocols[0]!;
  if (count(protocols, own) === max) return own;
  for (let i = protocols.length - 1; i >= 0; i--) if (count(protocols, protocols[i]!) === max) return protocols[i]!;
  return own;
}

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
  const key = '';
  const dominant = e.elite ? dominantProtocol(protocols) : null;
  const pure = true;
  // Kniffe und Schlusssteine (v2, 16.11.) als Werte
  let calm = false;
  if (e.defId === 'sniper' && hasTrick(world, e.owner, 'calmHand') && stillSeconds(world, e) >= TRICK.calmHand.still) {
    calm = true;
    merge(mods, { range: TRICK.calmHand.range });
  }
  if (e.defId === 'plasma' && hasTrick(world, e.owner, 'plasmaBurn')) merge(mods, { slowHit: { seconds: TRICK.plasmaBurn.seconds, factor: TRICK.plasmaBurn.factor } });
  if (e.defId === 'plasma' && hasKeystone(world, e.owner, 'plasma')) merge(mods, { burnField: { seconds: TRICK.glow.seconds, radius: TRICK.glow.radius, dps: TRICK.glow.dps } });
  if (e.defId === 'colossus' && hasTrick(world, e.owner, 'ram')) merge(mods, { wallBreak: TRICK.ram.wallBreak });
  // Elite
  let fx: NonNullable<typeof t.eliteFx> | null = null;
  if (e.elite) {
    fx = { headshot: 0, splashFull: false, mark: false, detect: false, heal: 0, kind: pure ? 'pure' : 'hybrid', dominant: dominant ?? protocols[0]! };
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
  const sig = `${protocols.join(',')}|${key}|${e.elite ? 1 : 0}|${calm ? 1 : 0}`;
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
      if (f.acid) {
        // Säuregeschoss (Myr-Kanone): 1 Rüstung weniger, solange man in der Säure steht.
        const c = o.corrosion && world.tick < o.corrosion.until ? o.corrosion : { shots: 0, level: 0, until: 0 };
        c.level = Math.max(c.level, 1);
        c.until = Math.max(c.until, world.tick + Math.round(1.2 * world.tps));
        o.corrosion = c;
        continue;
      }
      hits.push({ target: o, wounds: 1, damage: f.dps, attacker: f.owner, src: f.src });
    }
  }
  if (hits.length) applyHits(world, hits);
}
