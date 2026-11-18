import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { simSourceHash } from '../scripts/simSource.mjs';

/**
 * Multiplayer-Version (18.11.): Der Fingerabdruck des Simulations-Codes geht in `gameVersion()` ein.
 * Ändert ein Push nur Code in der Simulation, dürfen alte und neue Seite nicht mehr zusammen spielen.
 */
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'tc-sim-'));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

const BASE = {
  'src/sim/world.ts': 'export const a = 1;\n',
  'src/data/units.ts': 'export const u = {};\n',
  'src/net/lockstep.ts': 'export const l = 1;\n',
  'src/match.ts': 'export const m = 1;\n',
  'src/ui/session.ts': 'export const s = 1;\n',
  'src/ui/hud.ts': 'export const h = 1;\n',
};

describe('Multiplayer: Versionsabgleich', () => {
  it('Simulations-Code geändert → anderer Fingerabdruck; reine Oberfläche oder Zeilenenden → gleich', () => {
    const roots = [
      tree(BASE),
      tree({ ...BASE, 'src/sim/world.ts': 'export const a = 2;\n' }),
      tree({ ...BASE, 'src/net/lockstep.ts': 'export const l = 2;\n' }),
      tree({ ...BASE, 'src/ui/hud.ts': 'export const h = 2;\n' }),
      tree({ ...BASE, 'src/sim/world.ts': 'export const a = 1;\r\n' }),
    ];
    try {
      const [base, sim, net, ui, crlf] = roots.map((r) => simSourceHash(r));
      assert.match(base!, /^[0-9a-f]{8}$/);
      assert.notEqual(sim, base, 'Simulation');
      assert.notEqual(net, base, 'Lockstep');
      assert.equal(ui, base, 'Oberfläche zählt nicht');
      assert.equal(crlf, base, 'Zeilenenden (Windows/Linux) zählen nicht');
    } finally {
      for (const r of roots) rmSync(r, { recursive: true, force: true });
    }
  });

  it('im echten Projekt stabil', () => {
    assert.equal(simSourceHash(), simSourceHash());
  });
});
