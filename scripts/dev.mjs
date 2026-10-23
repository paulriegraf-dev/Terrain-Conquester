/**
 * Entwicklungs-Server: baut bei jeder Änderung neu und lädt den Browser automatisch neu.
 *   npm run dev  →  http://localhost:8000
 */
import { context } from 'esbuild';

const ctx = await context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: true,
  loader: { '.mp3': 'dataurl' },
  outfile: 'build/app.js',
  banner: { js: "new EventSource('/esbuild').addEventListener('change', () => location.reload());" },
  logLevel: 'info',
});
await ctx.watch();
const { port } = await ctx.serve({ servedir: '.', port: 8000 });
console.log(`\nVorposten läuft auf http://localhost:${port}  (Strg+C beendet)`);
