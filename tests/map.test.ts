import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MAPS } from '../src/data/maps';
import { MOVE_PROFILE_IDS, MOVE_PROFILES } from '../src/data/movement';
import { allReachable } from '../src/sim/flowfield';
import { Grid } from '../src/sim/grid';
import { isAsymmetric, parseMap, waypointCells, zoneAt } from '../src/sim/map';
import { FlowField, rectCells } from '../src/sim/flowfield';
import { checkBuild } from '../src/sim/placement';
import { World } from '../src/sim/world';
import { BUILDINGS } from '../src/data/buildings';
import { TERRAIN_LIST } from '../src/data/terrain';
import { ROUTES } from '../src/sim/types';

describe('Karten', () => {
  for (const def of MAPS) {
    describe(def.name, () => {
      const map = parseMap(def);
      const grid = new Grid(map);

      it(isAsymmetric(def) ? 'asymmetrisch: beide Wege zum gegnerischen HQ sind ähnlich lang' : 'ist spiegelsymmetrisch (fair)', () => {
        if (isAsymmetric(def)) {
          const len = (from: 0 | 1): number => {
            const field = new FlowField(grid, rectCells(grid, map.hq[from === 0 ? 1 : 0]), MOVE_PROFILES.foot);
            const r = map.hq[from];
            return field.distanceAt(from === 0 ? r.x + r.w : r.x - 1, r.y + Math.floor(r.h / 2));
          };
          const a = len(0);
          const b = len(1);
          assert.ok(Math.max(a, b) / Math.min(a, b) <= 1.3, `Wege ${a.toFixed(1)} und ${b.toFixed(1)}`);
          return;
        }
        for (let y = 0; y < map.height; y++) {
          for (let x = 0; x < map.width; x++) {
            assert.equal(map.terrain[y * map.width + x], map.terrain[y * map.width + (map.width - 1 - x)]);
          }
        }
        assert.equal(map.hq[0].x + map.hq[0].w, map.width - map.hq[1].x);
      });

      it(isAsymmetric(def) ? 'hat Außenposten auf beiden Seiten' : 'hat 6 Außenposten (2 pro Zone), gespiegelt', () => {
        if (isAsymmetric(def)) {
          const left = map.pads.filter((p) => p.rect.x + p.rect.w / 2 < map.width / 2).length;
          assert.ok(left >= 2 && map.pads.length - left >= 2, `links ${left}, rechts ${map.pads.length - left}`);
          return;
        }
        assert.equal(map.pads.length, 6);
        for (const zone of ROUTES) assert.equal(map.pads.filter((p) => p.zone === zone).length, 2);
        for (const p of map.pads) {
          const mirrorX = map.width - p.rect.x - p.rect.w;
          assert.ok(map.pads.some((q) => q.rect.x === mirrorX && q.rect.y === p.rect.y), `Spiegel zu (${p.rect.x}, ${p.rect.y})`);
        }
      });

      it('Bauzonen liegen auf bebaubarem Boden, nie auf HQ oder Außenposten', () => {
        const grid2 = new Grid(map);
        for (let i = 0; i < map.buildZone.length; i++) {
          if (map.buildZone[i] !== 1 && map.buildZone[i] !== 2) continue; // nur Bauzonen (nicht Niemandsland)
          assert.notEqual(TERRAIN_LIST[map.terrain[i]!]!.buildFactor, null, `Kachel ${i}`);
          assert.equal(grid2.structure[i], 0, `Kachel ${i} liegt unter einem Bauwerk`);
        }
      });

      it('zum Start hat jeder Spieler genug Platz zum Bauen – in jeder Zone', () => {
        const world = new World({ map: def, seed: 1 });
        for (const player of [0, 1] as const) {
          const zones = { top: 0, mid: 0, bottom: 0 };
          for (let y = 0; y < map.height - 1; y++) {
            for (let x = 0; x < map.width - 1; x++) {
              const c = checkBuild(world, player, x, y, BUILDINGS.barracks, { skipPaths: true, ignoreEnergy: true });
              if (c.ok) zones[zoneAt(map.height, y + 1)]++;
            }
          }
          for (const zone of ROUTES) assert.ok(zones[zone] >= 6, `Spieler ${player}, Zone ${zone}: ${zones[zone]} Standorte`);
        }
      });

      it('jede Truppenart erreicht das gegnerische HQ und alle Außenposten', () => {
        const targets = [map.hq[1], ...map.pads.map((p) => p.rect)];
        for (const id of MOVE_PROFILE_IDS) {
          assert.ok(allReachable(grid, map.hq[0], targets, MOVE_PROFILES[id]), `Profil ${id}`);
        }
      });

      it('Routen-Wegpunkte liegen auf passierbarem Boden', () => {
        for (const route of ROUTES) {
          for (const cell of waypointCells(map, route)) {
            const x = cell % map.width;
            const y = Math.floor(cell / map.width);
            for (const id of ['foot', 'wheels', 'tracks'] as const) {
              assert.ok(grid.isPassable(x, y, MOVE_PROFILES[id]), `${route} (${x},${y}) für ${id}`);
            }
          }
        }
      });
    });
  }

  it('meldet kaputte Karten verständlich', () => {
    assert.throws(
      () => parseMap({ id: 'x', name: 'x', description: '', waypointsY: { top: 0, mid: 1, bottom: 2 }, halfRows: ['HH', 'H'], zoneRows: ['..', '..'] }),
      /Zeile 1 hat 1 statt 2 Zeichen/,
    );
    assert.throws(
      () => parseMap({ id: 'x', name: 'x', description: '', waypointsY: { top: 0, mid: 1, bottom: 2 }, halfRows: ['HQ'], zoneRows: ['..'] }),
      /unbekanntes Zeichen 'Q'/,
    );
  });
});
