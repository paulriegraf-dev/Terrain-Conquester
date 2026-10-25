import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { felsenpass } from '../src/data/maps/felsenpass';
import { UNITS, UNIT_IDS } from '../src/data/units';
import { BUILD_ZONE } from '../src/sim/map';
import { incomePerSecond } from '../src/sim/systems/economy';
import { siegeMultiplier } from '../src/sim/systems/front';
import { controllerAt } from '../src/sim/systems/influence';
import { updateVision } from '../src/sim/systems/visibility';
import type { PlayerCommand } from '../src/sim/commands';
import { World } from '../src/sim/world';
import { cmd, lastBuilding, noIncome, openMap, stepTimes } from './fixtures';

/** Felsenpass (kompakt): Niemandsland bei x 21–26. */
const BAND_LEFT = 21;
const BAND_RIGHT = 26;

describe('Front: Halten und Vorstoß', () => {
  it('Halten: Truppen bleiben an der eigenen Grenze, nie im Niemandsland', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const u = world.addUnit(0, UNITS.sniper, { x: 12.5, y: 13.5 }, 'mid');
    stepTimes(world, 60 * world.tps);
    assert.ok(u.pos.x < BAND_LEFT, `x = ${u.pos.x.toFixed(2)}`);
    assert.ok(u.pos.x > 15, `die Grenze wandert mit der Präsenz nach vorn (x = ${u.pos.x.toFixed(2)})`);
  });

  it('Vorstoß greift erst nach der Umstellzeit und führt über die Mitte', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    world.hq(1)!.weapon = undefined;
    const u = world.addUnit(0, UNITS.sniper, { x: 12.5, y: 13.5 }, 'mid');
    world.step([cmd(0, { type: 'setStance', route: 'mid', stance: 'push' })]);
    assert.equal(world.players[0].stance.mid, 'hold');
    assert.equal(world.players[0].pendingStance.mid?.stance, 'push');
    stepTimes(world, world.rules.front.stanceChangeSeconds * world.tps);
    assert.equal(world.players[0].stance.mid, 'push');
    stepTimes(world, 40 * world.tps);
    assert.ok(u.pos.x > BAND_RIGHT + 1, `x = ${u.pos.x.toFixed(2)}`);
  });

  it('eine Umstellung lässt sich abbrechen', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    world.step([cmd(0, { type: 'setStance', route: 'top', stance: 'push' })]);
    world.step([cmd(0, { type: 'setStance', route: 'top', stance: 'hold' })]);
    assert.equal(world.players[0].pendingStance.top, null);
  });

  it('haltende Truppen eilen Eindringlingen im eigenen Gebiet entgegen', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const defender = world.addUnit(0, UNITS.sniper, { x: 10.5, y: 4.5 }, 'top');
    const intruder = world.addUnit(1, UNITS.sniper, { x: 9.5, y: 18.5 }, 'mid');
    intruder.mover!.speed = 0;
    intruder.weapon = undefined;
    stepTimes(world, world.rules.visionEvery + 1);
    const before = Math.hypot(defender.pos.x - intruder.pos.x, defender.pos.y - intruder.pos.y);
    stepTimes(world, 3 * world.tps);
    const after = Math.hypot(defender.pos.x - intruder.pos.x, defender.pos.y - intruder.pos.y);
    assert.ok(after < before - 1, `${before.toFixed(1)} → ${after.toFixed(1)}`);
  });
});

describe('Front: Verteidigen, Halten, Front – wer über die Mitte zieht, bleibt dabei', () => {
  it('Verteidigen: Truppen bleiben in der Basis nahe dem HQ', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    world.players[0].stance.mid = 'defend';
    const u = world.addUnit(0, UNITS.sniper, { x: 16.5, y: 13.5 }, 'mid');
    stepTimes(world, 40 * world.tps);
    const hq = { x: 2.5, y: 13.5 };
    const d = Math.hypot(u.pos.x - hq.x, u.pos.y - hq.y);
    const rally = world.rules.influence.hqRadius * 0.6;
    assert.ok(Math.abs(d - rally) <= 2, `Abstand zum HQ ${d.toFixed(1)}, Sammelpunkt ${rally}`);
  });

  it('Verteidiger eilen Eindringlingen im eigenen Gebiet entgegen', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    world.players[0].stance.mid = 'defend';
    const defender = world.addUnit(0, UNITS.sniper, { x: 8.5, y: 13.5 }, 'mid');
    const intruder = world.addUnit(1, UNITS.sniper, { x: 5.5, y: 21.5 }, 'mid');
    intruder.mover!.speed = 0;
    intruder.weapon = undefined;
    stepTimes(world, world.rules.visionEvery + 1);
    const before = Math.hypot(defender.pos.x - intruder.pos.x, defender.pos.y - intruder.pos.y);
    stepTimes(world, 3 * world.tps);
    const after = Math.hypot(defender.pos.x - intruder.pos.x, defender.pos.y - intruder.pos.y);
    assert.ok(after < before - 1, `${before.toFixed(1)} → ${after.toFixed(1)}`);
  });

  it('wer im Angriff die Mitte überquert hat, ignoriert ein späteres Halten – die anderen folgen', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    world.hq(1)!.weapon = undefined;
    world.players[0].stance.mid = 'push';
    const attacker = world.addUnit(0, UNITS.sniper, { x: 12.5, y: 13.5 }, 'mid');
    stepTimes(world, 25 * world.tps);
    assert.ok(attacker.mover!.committed, `über die Mitte (x = ${attacker.pos.x.toFixed(1)})`);
    const fresh = world.addUnit(0, UNITS.sniper, { x: 5.5, y: 13.5 }, 'mid');
    world.step([cmd(0, { type: 'setStance', route: 'mid', stance: 'hold' })]);
    const x0 = attacker.pos.x;
    stepTimes(world, (world.rules.front.stanceChangeSeconds + 20) * world.tps);
    assert.equal(world.players[0].stance.mid, 'hold');
    assert.ok(attacker.pos.x >= x0 - 0.5 && attacker.pos.x > BAND_RIGHT + 1, `Angreifer bleibt drüben (${x0.toFixed(1)} → ${attacker.pos.x.toFixed(1)})`);
    assert.ok(!fresh.mover!.committed);
    assert.ok(fresh.pos.x < BAND_LEFT, `der Nachzügler hält an der Grenze (x = ${fresh.pos.x.toFixed(1)})`);
  });

  it('neue Einheiten folgen der aktuellen Haltung ihrer Route', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    world.players[0].stance.top = 'defend';
    const u = world.addUnit(0, UNITS.sniper, { x: 12.5, y: 3.5 }, 'top');
    assert.equal(u.mover!.committed, false);
    stepTimes(world, 30 * world.tps);
    assert.ok(u.pos.x < 10, `bleibt in der Basis (x = ${u.pos.x.toFixed(1)})`);
  });

  it('ungültige Haltungen werden abgelehnt', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    world.step([cmd(0, { type: 'setStance', route: 'top', stance: 'charge' as never })]);
    assert.equal(world.players[0].pendingStance.top, null);
  });
});

describe('Niemandsland', () => {
  it('dort wächst kein Einfluss', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const x = 22;
    const y = 13;
    assert.equal(world.map.buildZone[world.grid.index(x, y)], BUILD_ZONE.neutral);
    const u = world.addUnit(0, UNITS.sniper, { x: x + 0.5, y: y + 0.5 }, 'mid');
    u.mover!.speed = 0;
    stepTimes(world, 30 * world.tps);
    assert.equal(world.influence[world.grid.index(x, y)], 0);
    assert.equal(controllerAt(world, world.grid.index(x, y)), null);
  });
});

describe('Gebiet zahlt sich aus', () => {
  it('Einheiten heilen sich im eigenen Gebiet, nicht im Niemandsland', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const home = world.addUnit(0, UNITS.sniper, { x: 6.5, y: 13.5 }, 'mid');
    const out = world.addUnit(0, UNITS.sniper, { x: 23.5, y: 13.5 }, 'mid');
    for (const u of [home, out]) {
      u.mover!.speed = 0;
      u.hp = 20;
    }
    stepTimes(world, 5 * world.tps);
    assert.ok(home.hp > 25, `zu Hause ${home.hp.toFixed(1)}`);
    assert.equal(out.hp, 20);
  });

  it('mehr Gebiet bringt mehr Einkommen', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const before = incomePerSecond(world, 0);
    world.territory[0] += 300;
    assert.ok(incomePerSecond(world, 0) > before);
    assert.ok(incomePerSecond(world, 0) > world.rules.energyPerSecond);
  });

  it('Belagerungsdruck: Wer mehr Gebiet hält, trifft HQ und Gebäude härter', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    world.territory[0] = 600;
    world.territory[1] = 200;
    assert.equal(siegeMultiplier(world, 1), 1 + world.rules.front.siegeFactor * 0.5);
    assert.equal(siegeMultiplier(world, 0), 1, 'wer vorn liegt, bekommt keinen Malus');
  });

  it('das eigene Gebiet ist immer aufgedeckt', () => {
    const world = new World({ map: felsenpass, seed: 1 });
    const i = world.grid.index(18, 2);
    assert.equal(world.players[0].vision.visible[i], 0);
    world.influence[i] = 1;
    updateVision(world);
    assert.equal(world.players[0].vision.visible[i], 1);
  });
});

describe('Durchbruch und Schutz', () => {
  it('eine zerstörte Fabrik bringt dem Angreifer Beute', () => {
    const world = new World({ map: openMap, seed: 1, rules: noIncome });
    world.step([cmd(0, { type: 'build', x: 1, y: 0, building: 'barracks' })]);
    const b = lastBuilding(world);
    b.producer!.paused = true;
    b.shieldUntil = 0;
    b.hp = 1;
    world.hq(0)!.weapon = undefined;
    world.addUnit(1, UNITS.colossus, { x: 5.6, y: 0.5 }, 'top').mover!.speed = 0; // nur das Gebäude in Reichweite, nicht das HQ
    const energy = world.players[1].energy;
    stepTimes(world, 3 * world.tps);
    assert.equal(b.alive, false);
    const bounty = Math.floor(b.paid! * world.rules.front.buildingBounty);
    assert.equal(world.players[1].stats.bounty, bounty);
    assert.equal(world.players[1].energy, energy + bounty);
  });

  it('neue Gebäude sind kurz geschützt', () => {
    const world = new World({ map: openMap, seed: 1 });
    world.step([cmd(0, { type: 'build', x: 1, y: 0, building: 'barracks' })]);
    const b = lastBuilding(world);
    b.producer!.paused = true;
    world.hq(0)!.weapon = undefined;
    world.addUnit(1, UNITS.colossus, { x: 5.6, y: 0.5 }, 'top').mover!.speed = 0; // nur das Gebäude in Reichweite, nicht das HQ
    stepTimes(world, 5 * world.tps);
    assert.equal(b.hp, b.maxHp, 'unter Bauschutz kein Schaden');
    stepTimes(world, world.rules.front.buildShieldSeconds * world.tps);
    assert.ok(b.hp < b.maxHp, 'danach angreifbar');
  });
});

describe('Fairness', () => {
  it('ein exakt gespiegelter Aufbau verläuft für beide Seiten exakt gleich', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: { startEnergy: 400 } });
    const W = world.map.width;
    const sites = [[6, 6, 'barracks'], [8, 9, 'workshop'], [8, 15, 'foundry']] as const;
    const cmds: PlayerCommand[] = [];
    for (const [x, y, building] of sites) {
      cmds.push(cmd(0, { type: 'build', x, y, building }));
      cmds.push(cmd(1, { type: 'build', x: W - x - 2, y, building }));
    }
    world.step(cmds);
    world.step(([0, 1] as const).flatMap((p) => (['top', 'mid', 'bottom'] as const).map((route) => cmd(p, { type: 'setStance', route, stance: 'push' }))));
    stepTimes(world, 100 * world.tps);
    const summary = (p: 0 | 1): string => {
      const s = world.players[p].stats;
      const hp = world.entities.filter((e) => e.alive && e.kind === 'unit' && e.owner === p).reduce((a, u) => a + u.hp, 0);
      return `lost ${s.lost.sniper + s.lost.hoverscout + s.lost.colossus} · kills ${s.kills} · hp ${hp.toFixed(3)}`;
    };
    assert.ok(world.players[0].stats.lost.sniper > 0, 'es soll gekämpft worden sein');
    assert.equal(summary(0), summary(1));
  });

  it('auch mit den Myriaden (Munition, Zerfall, Masse-Bonus) bleibt es spiegelgleich', () => {
    const world = new World({ map: felsenpass, seed: 1, rules: { startEnergy: 400 }, factions: ['myriaden', 'myriaden'] });
    const W = world.map.width;
    const sites = [[6, 6, 'barracks'], [8, 9, 'workshop'], [8, 15, 'foundry']] as const;
    const cmds: PlayerCommand[] = [];
    for (const [x, y, building] of sites) {
      cmds.push(cmd(0, { type: 'build', x, y, building }));
      cmds.push(cmd(1, { type: 'build', x: W - x - 2, y, building }));
    }
    world.step(cmds);
    world.step(([0, 1] as const).flatMap((p) => (['top', 'mid', 'bottom'] as const).map((route) => cmd(p, { type: 'setStance', route, stance: 'push' }))));
    stepTimes(world, 100 * world.tps);
    const summary = (p: 0 | 1): string => {
      const s = world.players[p].stats;
      const lost = UNIT_IDS.reduce((a, id) => a + s.lost[id], 0);
      const units = world.entities.filter((e) => e.alive && e.kind === 'unit' && e.owner === p);
      const hp = units.reduce((a, u) => a + u.hp, 0);
      return `lost ${lost} · kills ${s.kills} · units ${units.length} · hp ${hp.toFixed(3)}`;
    };
    assert.ok(world.players[0].stats.lost.drone > 0, 'es soll gekämpft worden sein');
    assert.equal(summary(0), summary(1));
  });
});
