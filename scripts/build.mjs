/**
 * Baut das Spiel zu EINER HTML-Datei (alles eingebettet, läuft offline per Doppelklick):
 *   dist/index.html     – vollständige Seite zum lokalen Öffnen
 *   dist/vorposten.html – dieselbe Seite ohne <html>/<head>-Rahmen (zum Veröffentlichen als Artifact)
 */
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const result = await build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  write: false,
  legalComments: 'none',
  loader: { '.mp3': 'dataurl' },
});
const js = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = await readFile('src/styles.css', 'utf8');
const template = await readFile('index.html', 'utf8');

const styleTag = `<style>\n${css}</style>`;
const scriptTag = `<script type="module">\n${js}</script>`;
const full = template
  .replace('<link rel="stylesheet" href="src/styles.css">', () => styleTag)
  .replace('<script type="module" src="build/app.js"></script>', () => scriptTag);
if (full.includes('src/styles.css') || full.includes('build/app.js')) {
  throw new Error('index.html: Platzhalter für CSS/JS nicht gefunden');
}

// Variante ohne Dokument-Rahmen: Kopf-Inhalte (ohne charset/viewport) + Body-Inhalt.
const head = full.match(/<head>([\s\S]*?)<\/head>/)[1]
  .replace(/<meta charset="utf-8">\s*/, '')
  .replace(/<meta name="viewport"[^>]*>\s*/, '');
const body = full.match(/<body>([\s\S]*?)<\/body>/)[1];
const fragment = `${head.trim()}\n${body.trim()}\n`;

await mkdir('dist', { recursive: true });
await writeFile('dist/index.html', full);
await writeFile('dist/vorposten.html', fragment);
const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`dist/index.html (${kb(full)}) und dist/vorposten.html (${kb(fragment)}) gebaut.`);
