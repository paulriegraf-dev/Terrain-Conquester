import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { UNITS } from '../src/data/units';
import { World } from '../src/sim/world';
import { cmd, lastBuilding, noIncome, openMap, stepTimes } from './fixtures';

/**
 * Spieler 0 mit einer Kaserne oben links (x 1–2, y 0–1), ohne Bauschutz und ohne HQ-Waffe.
 * Gebiet auf openMap: Spieler 0 bis x 8, umkämpft x 9–10, Spieler 1 ab x 11.
 */
function siegeWorld(): { world: World; barracks: number } {
  const world = new World({ map: openMap, seed: 1, rules: noIncome });
  world.step([cmd(0, { type: 'build', x: 1, y: 0, building: 'barracks' })]);
  const b = lastBuilding(world);
  b.producer!.paused = true;
  b.shieldUntil = 0;
  world.hq(0)!.weapon = undefined;
  world.hq(1)!.weapon = undefined;
  return { world, barracks: b.id };
}

describe('Artillerie belagert automatisch', () => {
  it('beschießt Bauwerke in Reichweite vor Einheiten', () => {
    const { world } = siegeWorld();
    const battery = world.addUnit(1, UNITS.battery, { x: 8.5, y: 1.0 }, 'top');
    battery.mover!.speed = 0;
    const guard = world.addUnit(0, UNITS.sniper, { x: 5.5, y: 5.0 }, 'mid'); // 5 Kacheln: in Reichweite
    guard.mover!.speed = 0;
    guard.weapon = undefined;
    stepTimes(world, world.rules.visionEvery + 1);
    const target = world.get(battery.weapon!.targetId);
    assert.ok(target && target.kind !== 'unit', `Ziel: ${target?.name ?? 'keins'}`);
  });

  it('wehrt sich, wenn ein Gegner ganz nah kommt', () => {
    const { world } = siegeWorld();
    const battery = world.addUnit(1, UNITS.battery, { x: 8.5, y: 1.0 }, 'top');
    battery.mover!.speed = 0;
    const raider = world.addUnit(0, UNITS.sniper, { x: 7.0, y: 2.0 }, 'top');
    raider.mover!.speed = 0;
    raider.weapon = undefined;
    stepTimes(world, world.rules.visionEvery + 1);
    assert.equal(battery.weapon!.targetId, raider.id);
  });

  it('rückt beim Halten bis auf volle Reichweite an ein Gebäude heran, solange sie im eigenen Gebiet bleibt', () => {
    const { world, barracks } = siegeWorld();
    const battery = world.addUnit(1, UNITS.battery, { x: 14.5, y: 1.0 }, 'top'); // 11,5 Kacheln entfernt
    battery.vision = 14; // Sicht ist hier nicht die Frage
    assert.equal(world.players[1].stance.top, 'hold');
    const hp = world.get(barracks)!.hp;
    stepTimes(world, 12 * world.tps);
    // Schusspunkt bei x ≈ 10,25 (umkämpft): dort bleibt sie stehen und schießt.
    assert.equal(battery.weapon!.targetId, barracks);
    assert.ok(battery.pos.x > 10.2 && battery.pos.x < 11, `steht bei x ${battery.pos.x.toFixed(2)}`);
    assert.ok(world.get(barracks)!.hp < hp, 'Kaserne nimmt Schaden');
  });

  it('läge der Schusspunkt im gegnerischen Gebiet, bleibt haltende Artillerie stehen – im Angriff rückt sie vor', () => {
    const run = (push: boolean): number => {
      const { world, barracks } = siegeWorld();
      if (push) world.players[1].stance.top = 'push';
      const battery = world.addUnit(1, UNITS.battery, { x: 11.5, y: 1.0 }, 'top');
      battery.vision = 14;
      battery.weapon!.def = { ...battery.weapon!.def, range: 4 }; // Schusspunkt bei x ≈ 6,75 (Gebiet von Spieler 0)
      stepTimes(world, world.rules.visionEvery + 1);
      return battery.weapon!.targetId === barracks ? 1 : 0;
    };
    assert.equal(run(false), 0, 'Halten: kein Vorrücken ins gegnerische Gebiet');
    assert.equal(run(true), 1, 'Front: rückt vor');
  });
});
