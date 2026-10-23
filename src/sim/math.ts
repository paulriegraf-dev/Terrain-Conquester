import type { CellRect, Vec2 } from './types';

/*
 * Rechen-Regel für alles unter src/sim:
 * Nur + − × ÷, Math.sqrt, Math.floor, Math.abs, Math.min, Math.max benutzen.
 * Diese Operationen liefern in jedem Browser bit-genau dasselbe Ergebnis.
 * Math.sin/cos/atan2/hypot/pow dürfen je nach Engine minimal abweichen und würden
 * Replays und späteren Multiplayer (Lockstep) zerstören. Ein Test wacht darüber.
 */

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function dist(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function length(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** Nächster Punkt eines Kachel-Rechtecks zu p (p selbst, wenn p innen liegt). */
export function closestPointInRect(p: Vec2, r: CellRect): Vec2 {
  return { x: clamp(p.x, r.x, r.x + r.w), y: clamp(p.y, r.y, r.y + r.h) };
}

/** Abstand von p zum Rand eines Rechtecks (0, wenn p innen liegt). */
export function distToRect(p: Vec2, r: CellRect): number {
  return dist(p, closestPointInRect(p, r));
}

export function rectCenter(r: CellRect): Vec2 {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function rectContains(r: CellRect, cx: number, cy: number): boolean {
  return cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h;
}
