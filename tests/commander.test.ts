import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FACTIONS } from '../src/data/factions';
import { felsenpass } from '../src/data/maps/felsenpass';
import { UNITS } from '../src/data/units';
import { rectCenter } from '../src/sim/math';
import type { Entity } from '../src/sim/entity';
import { commandBonus, setHeroMode } from '../src/sim/systems/hero';
import { referenceDefense, woundsPerShot } from '../src/sim/systems/hitmath';
import { unitOrder } from '../src/sim/systems/movement';
import { World } from '../src/sim/world';
import { cmd, stepTimes } from './fixtures';

/** Technoclan mit Commander auf der Mittel-Route; das gegnerische HQ schießt nicht. */
function withCommander(): { world: World; lead: Entity } {
  const world = new World({ map: felsenpass, seed: 1, rules: { startEnergy: 400 } });
  world.hq(1)!.weapon = undefined;
  world.step([cmd(0, { type: 'buyHero', route: 'mid' })]);
  world.step();
  const lead = world.entities.find((e) => e.alive && e.defId === 'commander');
  assert.ok(lead, 'Commander ist da');
  // Ein Stück vor das HQ stellen, damit rundherum Platz für Begleiter ist.
  lead.pos = { x: 12.5, y: 13.5 };
  lead.prev = { x: 12.5, y: 13.5 };
  return { world, lead };
}

const distTo = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('Commander (Technoclan): Sammeln und Losschlagen', () => {
  it('Sammeln: ein Vorstoß auf seiner Route wartet bei ihm, andere Routen ziehen los', () => {
    const { world, lead } = withCommander();
    world.players[0].stance.mid = 'push';
    world.players[0].stance.top = 'push';
    const mid = world.addUnit(0, UNITS.gunner, { x: 10.5, y: 13.5 }, 'mid');
    const top = world.addUnit(0, UNITS.gunner, { x: 10.5, y: 6.5 }, 'top');
    assert.equal(world.players[0].hero!.mode, 'gather');
    assert.equal(unitOrder(world, lead), 'hold', 'der Commander selbst wartet an der Grenze');
    assert.equal(unitOrder(world, mid), 'hold');
    assert.equal(unitOrder(world, top), 'push');
    stepTimes(world, 40 * world.tps);
    const wp = world.map.waypoints.mid;
    assert.ok(mid.pos.x < wp.x, `wartet diesseits der Mitte (x ${mid.pos.x.toFixed(1)})`);
    assert.equal(mid.mover!.committed, false);
    assert.equal(top.mover!.committed, true, 'die obere Route stößt vor');
  });

  it('Losschlagen: Truppen seiner Route in seiner Nähe ziehen gebunden mit – andere nicht', () => {
    const { world, lead } = withCommander();
    world.players[0].stance.mid = 'push';
    const near = [0, 1, 2].map((k) => world.addUnit(0, UNITS.gunner, { x: lead.pos.x - 2 - k, y: lead.pos.y + 1 }, 'mid'));
    const far = world.addUnit(0, UNITS.gunner, { x: lead.pos.x - 9, y: lead.pos.y }, 'mid');
    const otherRoute = world.addUnit(0, UNITS.gunner, { x: lead.pos.x - 1, y: lead.pos.y - 1 }, 'top');
    world.step([cmd(0, { type: 'heroMode', mode: 'strike' })]);
    for (const u of near) {
      assert.equal(u.mover!.committed, true);
      assert.equal(u.mover!.escortId, lead.id);
    }
    assert.equal(far.mover!.committed, false, 'zu weit weg');
    assert.equal(otherRoute.mover!.committed, false, 'andere Route');
    assert.equal(unitOrder(world, lead), 'push');
    const ev = world.events.find((e) => e.type === 'hero' && e.what === 'strike');
    assert.ok(ev && ev.type === 'hero' && ev.count === 3, 'Meldung mit der Zahl der Begleiter');
  });

  it('die Begleiter überholen den Commander nicht', () => {
    const { world, lead } = withCommander();
    world.players[0].stance.mid = 'push';
    // Schnelle Hover-Scouts – ohne Bindung wären sie längst vorneweg.
    const scouts = [0, 1, 2, 3].map((k) => {
      const u = world.addUnit(0, UNITS.hoverscout, { x: lead.pos.x - 1 - (k % 2), y: lead.pos.y - 1 + k * 0.7 }, 'mid');
      u.weapon = undefined;
      return u;
    });
    world.step([cmd(0, { type: 'heroMode', mode: 'strike' })]);
    const enemyHq = rectCenter(world.map.hq[1]);
    const start = distTo(lead.pos, enemyHq);
    for (let t = 0; t < 15; t++) {
      stepTimes(world, world.tps);
      for (const s of scouts) {
        assert.ok(
          distTo(s.pos, enemyHq) >= distTo(lead.pos, enemyHq) - 1.5 - 0.3,
          `nach ${t + 1} s: Scout ${distTo(s.pos, enemyHq).toFixed(1)}, Commander ${distTo(lead.pos, enemyHq).toFixed(1)}`,
        );
      }
    }
    assert.ok(distTo(lead.pos, enemyHq) < start - 8, 'die Welle ist vorangekommen');
    for (const s of scouts) assert.ok(distTo(s.pos, lead.pos) < 5, 'und hält zusammen');
  });

  it('Aura: eigene Einheiten in seiner Nähe treffen eine Stufe besser', () => {
    const { world, lead } = withCommander();
    const near = world.addUnit(0, UNITS.gunner, { x: lead.pos.x - 2, y: lead.pos.y }, 'mid');
    const far = world.addUnit(0, UNITS.gunner, { x: lead.pos.x - 8, y: lead.pos.y }, 'mid');
    const enemy = world.addUnit(1, UNITS.gunner, { x: lead.pos.x + 1, y: lead.pos.y }, 'mid');
    assert.equal(commandBonus(world, near), UNITS.commander.command!.hitBonus);
    assert.equal(commandBonus(world, far), 0);
    assert.equal(commandBonus(world, enemy), 0, 'nicht für den Gegner');
    const heavy = referenceDefense('heavy').defense;
    const w = UNITS.gunner.weapon!;
    assert.ok(woundsPerShot(w, heavy, 1) > woundsPerShot(w, heavy, 0) * 1.2);
  });

  it('Sammeln nach dem Losschlagen hält niemanden fest, solange er schon im Angriff ist', () => {
    const { world, lead } = withCommander();
    world.players[0].stance.mid = 'push';
    const trooper = world.addUnit(0, UNITS.gunner, { x: 4.5, y: 13.5 }, 'mid');
    world.step([cmd(0, { type: 'heroMode', mode: 'strike' })]);
    lead.mover!.committed = true; // er ist schon über die Mitte gezogen
    world.step([cmd(0, { type: 'heroMode', mode: 'gather' })]);
    assert.equal(unitOrder(world, lead), 'push', 'er kommt nicht zurück');
    assert.equal(unitOrder(world, trooper), 'push', 'also wartet auch niemand an der Grenze auf ihn');
  });

  it('Losschlagen braucht ihn im Feld; nach seinem Tod kehrt er zurück und sammelt wieder', () => {
    const { world, lead } = withCommander();
    assert.equal(setHeroMode(world, 0, 'strike').ok, true);
    world.destroy(lead, 1);
    world.step();
    assert.equal(setHeroMode(world, 0, 'gather').ok, true, 'Sammeln geht immer');
    assert.equal(setHeroMode(world, 0, 'strike').ok, false, 'nicht im Feld');
    world.players[0].hero!.mode = 'strike';
    stepTimes(world, FACTIONS.technoclan.hero!.respawnSeconds * world.tps + 1);
    const back = world.entities.filter((e) => e.alive && e.defId === 'commander');
    assert.equal(back.length, 1, 'zurück am HQ');
    assert.equal(world.players[0].hero!.mode, 'gather');
  });
});
