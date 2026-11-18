import type { UpgradeEffect } from '../../data/factions';
import type { UnitId } from '../../data/units';
import type { Entity } from '../entity';
import type { World } from '../world';
import { refreshTech } from './verbund';

/**
 * Rückwirkende Forschung (18.11.): Bisher galten Upgrades nur für neu gebaute Verbände (Werte fest in addUnit). Jetzt rüstet
 * dieses System einmal je Sekunde jeden Verband nach, dessen Forschungswerte (`fxApplied`) nicht mehr zur aktuellen Forschung
 * passen – aber nur, wenn er `rules.retrofit.calmSeconds` lang weder geschossen hat noch getroffen wurde (`combatTick`).
 *
 * Angewendet wird nur die Differenz zu den schon eingebauten Werten, damit Elite, Netz-Protokolle, Kniffe und Boden-Boni,
 * die andere Systeme setzen, erhalten bleiben. Leben skaliert mit (Lebens-Anteil bleibt, kein Gratis-Heilen).
 */
export function updateRetrofit(world: World): void {
  const R = world.rules.retrofit;
  if (!R.on || world.tick % world.tps !== 0) return;
  const calm = R.calmSeconds * world.tps;
  const cache = new Map<string, Required<UpgradeEffect>>();
  for (const e of world.entities) {
    if (!e.alive || e.kind !== 'unit' || !e.fxApplied) continue;
    if (e.combatTick !== undefined && world.tick - e.combatTick < calm) continue;
    const key = `${e.owner}:${e.defId}`;
    let now = cache.get(key);
    if (!now) cache.set(key, (now = world.upgradeEffects(e.owner, e.defId as UnitId)));
    if (sameFx(now, e.fxApplied)) continue;
    applyDelta(world, e, e.fxApplied, now);
    e.fxApplied = now;
  }
}

function sameFx(a: Required<UpgradeEffect>, b: Required<UpgradeEffect>): boolean {
  for (const k of Object.keys(a) as (keyof UpgradeEffect)[]) if (a[k] !== b[k]) return false;
  return true;
}

/** Die Differenz von `from` nach `to` auf den Verband anwenden (wie addUnit die Werte aus den Stammdaten baut). */
function applyDelta(world: World, e: Entity, from: Required<UpgradeEffect>, to: Required<UpgradeEffect>): void {
  const hpK = to.hp / from.hp;
  const speedK = to.speed / from.speed;
  const dT = to.toughness - from.toughness;
  const dV = to.vision - from.vision;
  const tech = e.tech;
  if (tech) {
    // Netz-Verband (Technoclan): Grundwerte anpassen, refreshTech baut Leben, Widerstand, Sicht, Tempo und Waffe daraus neu.
    tech.base.maxHp *= hpK;
    tech.base.toughness += dT;
    tech.base.vision += dV;
    tech.base.speed *= speedK;
  } else {
    e.maxHp *= hpK;
    e.hp *= hpK;
    e.modelWounds *= hpK;
    e.toughness += dT;
    e.vision += dV;
    if (e.mover) e.mover.speed *= speedK;
  }
  e.save = Math.max(2, e.save - (to.save - from.save));
  if (e.lifespan) e.lifespan.seconds += to.lifespan - from.lifespan;
  if (e.support) {
    e.support.heal *= to.heal / from.heal;
    e.support.radius += to.range - from.range;
    if (e.support.deathHeal !== undefined) e.support.deathHeal *= to.heal / from.heal;
  }
  if (e.weapon) {
    const shift = (w: NonNullable<Entity['weapon']>['def']): typeof w => ({
      ...w,
      damage: w.damage * (to.damage / from.damage),
      strength: w.strength + (to.strength - from.strength),
      ap: w.ap + (to.ap - from.ap),
      skill: Math.max(2, w.skill - (to.hit - from.hit)),
      range: w.range + (e.support ? 0 : to.range - from.range),
      splash: w.splash !== undefined || to.splash !== from.splash ? (w.splash ?? 0) + (to.splash - from.splash) : undefined,
      pierce: to.pierce !== from.pierce ? (w.pierce ?? 0) + (to.pierce - from.pierce) : w.pierce,
    });
    const sameBase = e.weapon.baseDef === e.weapon.def;
    e.weapon.baseDef = shift(e.weapon.baseDef);
    e.weapon.def = sameBase ? e.weapon.baseDef : shift(e.weapon.def);
  }
  if (tech) {
    tech.sig = ''; // Waffe aus der neuen baseDef neu aufbauen
    refreshTech(world, e);
  }
}
