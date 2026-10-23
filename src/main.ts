import { Game } from './ui/game';

/** Einstieg: Spielfeld und HUD aus index.html holen und das Spiel starten. */
const canvas = document.getElementById('board') as HTMLCanvasElement;
const frame = document.getElementById('board-frame') as HTMLElement;
new Game(canvas, frame, document).start();
