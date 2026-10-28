/**
 * Scharten-Automatik (28.10., Wunsch des Nutzers): Haltende Fernkämpfer mit direkter Waffe (Reichweite ≥ MIN_RANGE = 4)
 * rücken an eine freie Kachel direkt am eigenen Erdwall (Schießscharte, bis SLIT Kacheln vom Wall), wenn dahinter ein
 * Gegner steht, den sie von dort treffen könnten – höchstens REACH Kacheln von ihrem Platz. Ohne Gegner kehren sie in
 * ihre Reihe zurück. Gesteuert über die Haltung: nur bei „Halten“.
 */
import type { Entity } from '../entity';
import type { World } from '../world';
import { unitOrder } from './movement';
import { fireBlocked, indirectFire } from './targeting';
import { SLIT } from './visibility';

const MIN_RANGE = 4; // Scharfschütze 4,5
const REACH = 4;
const EVERY = 10;

function eligible(world: World, e: Entity): boolean {
  return e.alive && e.kind === 'unit' && !!e.mover && !!e.weapon && e.weapon.def.range >= MIN_RANGE && !indirectFire(e) && unitOrder(world, e) === 'hold';
}

export function updateSlits(world: World): void {
  if (world.tick % EVERY !== 0) return;
  const g = world.grid;
  if (world.wallCellCount === 0) {
    for (const e of world.entities) if (e.mover?.slit) e.mover.slit = null;
    return;
  }
  const taken = new Set<number>();
  for (const e of world.entities) {
    if (!e.mover) continue;
    if (!eligible(world, e)) {
      e.mover.slit = null;
      continue;
    }
    const range = e.weapon!.def.range;
    const foes = world.entities.filter((o) => o.alive && o.kind === 'unit' && o.owner !== e.owner &&
      (o.pos.x - e.pos.x) ** 2 + (o.pos.y - e.pos.y) ** 2 <= (range + REACH + 1) ** 2);
    // Bewusst ohne Sichtprüfung: Hinter dem eigenen Wall sieht man erst von der Scharte aus – der Gegner dort ist hörbar nah.
    if (foes.length === 0) {
      e.mover.slit = null;
      continue;
    }
    // Schon gut stehend (trifft jemanden direkt)? Dann bleiben.
    if (foes.some((o) => (o.pos.x - e.pos.x) ** 2 + (o.pos.y - e.pos.y) ** 2 <= range * range && !fireBlocked(world, e, o))) {
      if (e.mover.slit) taken.add(g.index(Math.floor(e.mover.slit.x), Math.floor(e.mover.slit.y)));
      continue;
    }
    const cx = Math.floor(e.pos.x);
    const cy = Math.floor(e.pos.y);
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    const save = { x: e.pos.x, y: e.pos.y };
    for (let dy = -REACH; dy <= REACH; dy++) {
      for (let dx = -REACH; dx <= REACH; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const d = dx * dx + dy * dy;
        if (d > REACH * REACH || d >= bestD || !g.inBounds(x, y)) continue;
        const i = g.index(x, y);
        if (taken.has(i) || world.wallOwner[i] !== 0 || !g.isFreeGround(x, y)) continue;
        // eigener Wall in Scharten-Nähe?
        let near = false;
        for (let wy = -1; wy <= 1 && !near; wy++) for (let wx = -1; wx <= 1 && !near; wx++) {
          if (!g.inBounds(x + wx, y + wy)) continue;
          if (world.wallOwner[g.index(x + wx, y + wy)] === e.owner + 1 && wx * wx + wy * wy <= SLIT * SLIT) near = true;
        }
        if (!near) continue;
        e.pos.x = x + 0.5;
        e.pos.y = y + 0.5;
        const hits = foes.some((o) => (o.pos.x - e.pos.x) ** 2 + (o.pos.y - e.pos.y) ** 2 <= range * range && !fireBlocked(world, e, o));
        e.pos.x = save.x;
        e.pos.y = save.y;
        if (!hits) continue;
        best = { x: x + 0.5, y: y + 0.5 };
        bestD = d;
      }
    }
    e.mover.slit = best;
    if (best) taken.add(g.index(Math.floor(best.x), Math.floor(best.y)));
  }
}
