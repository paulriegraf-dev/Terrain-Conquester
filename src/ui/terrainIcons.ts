import { TILESETS } from '../render/hd2d/assets';
import type { TerrainId } from '../data/terrain';

/**
 * Gelände-Symbole (Nutzer 16.11.: „Geländearten klarer darstellen – kann den Wald null nachvollziehen“): statt Text-
 * zeichen ein kleines Bild aus der echten Bodenkachel plus ein typisches Detail (Baum, Blumen, Pfütze, Fels …). Gilt
 * überall, wo Geländearten gewählt werden: Geländetausch, Vorbereitung, Boden der Terra-Former-Lanes.
 */
interface Look {
  /** Bodenkachel: Bild, Zeile, Spalte (32 px). */
  ground: [keyof typeof TILESETS, number, number];
  /** Detail aus dem Deko-Atlas (tiles2): Zeile-Start y, Index, Kantenlänge (32 = Deko, 64 = Baum). */
  deco?: { y: number; i: number; size: number; scale: number; dy: number };
}

const LOOKS: Record<TerrainId, Look> = {
  meadow: { ground: ['tiles2', 0, 0], deco: { y: 96, i: 3, size: 32, scale: 0.9, dy: 2 } },
  forest: { ground: ['tiles2', 0, 9], deco: { y: 32, i: 4, size: 64, scale: 0.62, dy: -2 } },
  mud: { ground: ['tiles1', 0, 10], deco: { y: 96, i: 38, size: 32, scale: 0.85, dy: 4 } },
  snow: { ground: ['tiles3', 0, 0], deco: { y: 32, i: 11, size: 64, scale: 0.55, dy: -1 } },
  mountain: { ground: ['tiles3', 0, 3], deco: { y: 96, i: 24, size: 32, scale: 1, dy: 1 } },
  gorge: { ground: ['tiles3', 0, 6] },
  rubble: { ground: ['tiles3', 0, 12], deco: { y: 96, i: 21, size: 32, scale: 0.9, dy: 3 } },
  wall: { ground: ['walls', 0, 2] },
  waste: { ground: ['tiles3', 0, 9], deco: { y: 96, i: 27, size: 32, scale: 0.85, dy: 1 } },
};

const imgs = new Map<string, HTMLImageElement>();
const cache = new Map<TerrainId, string>();

function img(key: keyof typeof TILESETS): HTMLImageElement {
  let i = imgs.get(key);
  if (!i) {
    i = new Image();
    i.src = TILESETS[key];
    imgs.set(key, i);
  }
  return i;
}

/** Bild-URL des Symbols, oder null, solange die Kacheln noch laden. */
function iconUrl(t: TerrainId): string | null {
  const hit = cache.get(t);
  if (hit) return hit;
  const look = LOOKS[t];
  const g0 = img(look.ground[0]);
  const deco = img('tiles2');
  if (!g0.complete || !g0.naturalWidth || !deco.complete || !deco.naturalWidth) return null;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(g0, look.ground[2] * 32, look.ground[1] * 32, 32, 32, 0, 0, 32, 32);
  if (look.deco) {
    const d = look.deco;
    const s = Math.round(d.size * d.scale);
    const per = 1024 / d.size;
    g.drawImage(deco, (d.i % per) * d.size, d.y + Math.floor(d.i / per) * d.size, d.size, d.size, Math.round((32 - s) / 2), 32 - s + d.dy, s, s);
  }
  if (t === 'gorge') {
    // Schlucht: dunkler Spalt quer durch
    g.fillStyle = 'rgba(8,6,10,0.85)';
    g.fillRect(0, 13, 32, 6);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(0, 19, 32, 2);
  }
  // dunkler Rahmen, damit das Bild auf dem Knopf als Fläche lesbar ist
  g.strokeStyle = 'rgba(5,8,12,0.9)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 30, 30);
  const url = c.toDataURL();
  cache.set(t, url);
  return url;
}

/** HTML für den Befehlsknopf, oder null (dann bleibt das Textzeichen). */
export function terrainIconHtml(t: TerrainId, prefix = ''): string | null {
  const url = iconUrl(t);
  if (!url) return null;
  return `${prefix ? `<span class="ic-terr-route">${prefix}</span>` : ''}<img class="ic-terr" src="${url}" alt="" draggable="false">`;
}
