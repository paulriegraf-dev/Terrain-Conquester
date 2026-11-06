/**
 * PixelFX-Effekte der HD-2D-Darstellung (05.11., aus dem Mock-up übernommen): Mündungsfeuer, Funken, Explosionen, Erde,
 * Heilung als Sprite-Sheets (pixelfx, je Bild fw×fh, `cols` Bilder je Zeile). `px/py` = Bezugspunkt im Bild.
 */
import spark_cyan from '../../../assets/hd2d/pfx/spark_cyan.webp';
import spark_mag from '../../../assets/hd2d/pfx/spark_mag.webp';
import spark_green from '../../../assets/hd2d/pfx/spark_green.webp';
import spark_orange from '../../../assets/hd2d/pfx/spark_orange.webp';
import boom from '../../../assets/hd2d/pfx/boom.webp';
import pboom_purple from '../../../assets/hd2d/pfx/pboom_purple.webp';
import pboom_cyan from '../../../assets/hd2d/pfx/pboom_cyan.webp';
import pboom_mag from '../../../assets/hd2d/pfx/pboom_mag.webp';
import muzzle_orange from '../../../assets/hd2d/pfx/muzzle_orange.webp';
import muzzle_cyan from '../../../assets/hd2d/pfx/muzzle_cyan.webp';
import heal_cyan from '../../../assets/hd2d/pfx/heal_cyan.webp';
import heal_mag from '../../../assets/hd2d/pfx/heal_mag.webp';
import dirt from '../../../assets/hd2d/pfx/dirt.webp';

export interface PfxSheet {
  src: string;
  fw: number;
  fh: number;
  n: number;
  cols: number;
  fps: number;
  px: number;
  py: number;
}

export const PFX = {
  spark_cyan: { src: spark_cyan, fw: 122, fh: 71, n: 16, cols: 8, fps: 30, px: 34, py: 56 },
  spark_mag: { src: spark_mag, fw: 122, fh: 71, n: 16, cols: 8, fps: 30, px: 34, py: 56 },
  spark_green: { src: spark_green, fw: 122, fh: 71, n: 16, cols: 8, fps: 30, px: 34, py: 56 },
  spark_orange: { src: spark_orange, fw: 122, fh: 71, n: 16, cols: 8, fps: 30, px: 34, py: 56 },
  boom: { src: boom, fw: 168, fh: 202, n: 36, cols: 8, fps: 15, px: 62, py: 178 },
  pboom_purple: { src: pboom_purple, fw: 149, fh: 198, n: 36, cols: 8, fps: 15, px: 72, py: 173 },
  pboom_cyan: { src: pboom_cyan, fw: 137, fh: 206, n: 36, cols: 8, fps: 15, px: 60, py: 177 },
  pboom_mag: { src: pboom_mag, fw: 137, fh: 206, n: 36, cols: 8, fps: 15, px: 60, py: 177 },
  muzzle_orange: { src: muzzle_orange, fw: 76, fh: 61, n: 22, cols: 8, fps: 15, px: 35, py: 56 },
  muzzle_cyan: { src: muzzle_cyan, fw: 76, fh: 61, n: 22, cols: 8, fps: 15, px: 35, py: 56 },
  heal_cyan: { src: heal_cyan, fw: 136, fh: 115, n: 35, cols: 8, fps: 15, px: 68, py: 84 },
  heal_mag: { src: heal_mag, fw: 134, fh: 114, n: 35, cols: 8, fps: 15, px: 67, py: 82 },
  dirt: { src: dirt, fw: 101, fh: 187, n: 36, cols: 8, fps: 15, px: 47, py: 173 },
} as const satisfies Record<string, PfxSheet>;

export type PfxName = keyof typeof PFX;

/** Ein Effekt: Sheet, Höhe des Bezugspunkts über dem Fußpunkt (Effekt-Pixel), Maßstab. */
export interface PfxUse {
  name: PfxName;
  lift: number;
  scale?: number;
}

/**
 * Mündung und Einschlag je Geschoss-Optik – wie im Mock-up (`pfxPlay` je Angriffsart). Fehlt ein Eintrag, nimmt die
 * Darstellung die Funken der Fraktion.
 */
export const SHOT_PFX: Readonly<Record<string, { muzzle?: PfxUse; impact?: PfxUse }>> = {
  // Mock-up 2: Mündungsfeuer steckt in der Angriffsanimation der alten Figuren, nur Einschlag
  oshot: { impact: { name: 'spark_orange', lift: 20, scale: 0.55 } },
  obolt: { impact: { name: 'spark_cyan', lift: 20, scale: 0.5 } },
  orail: { impact: { name: 'spark_cyan', lift: 20, scale: 0.6 } },
  oglob: { impact: { name: 'pboom_purple', lift: 0, scale: 0.4 } },
  gshot: { muzzle: { name: 'muzzle_orange', lift: 26, scale: 0.8 }, impact: { name: 'spark_orange', lift: 20 } },
  bolt: { muzzle: { name: 'muzzle_cyan', lift: 26, scale: 0.6 }, impact: { name: 'spark_cyan', lift: 20 } },
  rail: { muzzle: { name: 'muzzle_cyan', lift: 26, scale: 0.7 }, impact: { name: 'spark_cyan', lift: 20 } },
  rail2: { muzzle: { name: 'muzzle_cyan', lift: 26, scale: 0.7 }, impact: { name: 'spark_cyan', lift: 20 } },
  larc: { impact: { name: 'pboom_cyan', lift: 0, scale: 0.7 } },
  hshell: { muzzle: { name: 'muzzle_orange', lift: 26 }, impact: { name: 'boom', lift: 0, scale: 0.8 } },
  pglob: { impact: { name: 'pboom_purple', lift: 0, scale: 0.45 } },
  plob: { impact: { name: 'pboom_purple', lift: 0, scale: 0.6 } },
  pstream: { impact: { name: 'pboom_purple', lift: 0, scale: 0.45 } },
  heal: { impact: { name: 'heal_cyan', lift: 0, scale: 0.7 } },
  spike: { impact: { name: 'spark_mag', lift: 20 } },
  drones: { muzzle: { name: 'spark_mag', lift: 20 }, impact: { name: 'dirt', lift: 0, scale: 0.7 } },
  stone: { muzzle: { name: 'dirt', lift: 0, scale: 0.6 }, impact: { name: 'boom', lift: 0, scale: 0.8 } },
  taunter: { impact: { name: 'pboom_mag', lift: 0, scale: 0.8 } },
  bash: { muzzle: { name: 'spark_mag', lift: 20 }, impact: { name: 'spark_mag', lift: 20 } },
  taunt: { muzzle: { name: 'spark_mag', lift: 20 } },
  blast: { impact: { name: 'pboom_mag', lift: 0 } },
  howl: { muzzle: { name: 'heal_mag', lift: 0, scale: 0.7 }, impact: { name: 'heal_mag', lift: 0, scale: 0.7 } },
  leap: { impact: { name: 'dirt', lift: 0 } },
  bomb: { impact: { name: 'pboom_mag', lift: 0, scale: 0.8 } },
  mbolt: { impact: { name: 'spark_mag', lift: 20 } },
  mbig: { impact: { name: 'pboom_mag', lift: 0 } },
  beam: { impact: { name: 'spark_mag', lift: 20 } },
  beam3: { impact: { name: 'spark_mag', lift: 20 } },
  rifle: { muzzle: { name: 'spark_green', lift: 20, scale: 0.7 }, impact: { name: 'spark_green', lift: 20 } },
  blade: { impact: { name: 'spark_green', lift: 20 } },
  spell: { impact: { name: 'spark_green', lift: 20 } },
  grow: { impact: { name: 'spark_green', lift: 20 } },
  melee: { impact: { name: 'spark_green', lift: 20 } },
  smash: { impact: { name: 'dirt', lift: 0, scale: 0.8 } },
  mud: { impact: { name: 'dirt', lift: 0, scale: 0.7 } },
  sling: { impact: { name: 'dirt', lift: 0, scale: 0.8 } },
  spit: { impact: { name: 'dirt', lift: 0, scale: 0.6 } },
  ice: { muzzle: { name: 'spark_cyan', lift: 20, scale: 0.7 }, impact: { name: 'spark_cyan', lift: 20 } },
  snowball: { impact: { name: 'spark_cyan', lift: 20 } },
  avalanche: { impact: { name: 'boom', lift: 0, scale: 0.7 } },
  cannon: { muzzle: { name: 'dirt', lift: 0, scale: 0.5 }, impact: { name: 'boom', lift: 0, scale: 0.7 } },
};

/** Funken je Fraktion, wenn eine Optik keinen eigenen Einschlag hat. */
export const FACTION_SPARK = { technoclan: 'spark_cyan', myriaden: 'spark_mag', terraformer: 'spark_green' } as const satisfies Record<string, PfxName>;
