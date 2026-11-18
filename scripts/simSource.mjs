/**
 * Fingerabdruck des Codes, der im Multiplayer auf beiden Rechnern gleich sein muss (Simulation, Spielwerte,
 * Lockstep, Session). Build und Dev-Server schreiben ihn als `__SIM_SOURCE__` ins Spiel; `gameVersion()`
 * nimmt ihn mit auf. So spielen nach einem Push auf main nicht alter und neuer Simulations-Code zusammen.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const PARTS = ['src/sim', 'src/data', 'src/net', 'src/match.ts', 'src/ui/session.ts'];

function listFiles(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path).sort().flatMap((name) => listFiles(join(path, name)));
}

export function simSourceHash(root = '.') {
  let h = 0x811c9dc5;
  const mix = (text) => {
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  };
  for (const part of PARTS) {
    for (const file of listFiles(join(root, part))) {
      mix(relative(root, file).replace(/\\/g, '/'));
      mix(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'));
    }
  }
  return h.toString(16).padStart(8, '0');
}
