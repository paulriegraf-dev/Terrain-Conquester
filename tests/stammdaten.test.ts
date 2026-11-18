import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { UNITS } from '../src/data/units';

/**
 * Stammdaten-Export (Review 18.11.): Das Skript lädt die Übersicht (codex.ts), die über die Porträts Sprite-Bilder
 * importiert. Ohne Platzhalter für Bilddateien brach es mit ERR_UNKNOWN_FILE_EXTENSION ab – die CSV ließ sich nicht neu erzeugen.
 */
describe('Stammdaten-Export', () => {
  it('läuft durch und schreibt eine Zeile je Einheit der Übersicht', () => {
    const dir = mkdtempSync(join(tmpdir(), 'stammdaten-'));
    try {
      const out = join(dir, 'stamm.csv');
      execFileSync(process.execPath, ['--import', 'tsx', 'scripts/stammdaten.ts', out], { stdio: 'pipe' });
      const lines = readFileSync(out, 'utf8').split('\n').filter(Boolean);
      assert.ok(lines[0]!.includes('Fraktion;Einheit;Id'), 'Kopfzeile');
      assert.ok(lines.length > 10, `zu wenige Zeilen: ${lines.length}`);
      assert.ok(lines.some((l) => l.includes(`;${UNITS.colossus.name};colossus;`)), 'Koloss fehlt');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
