import { FACTIONS, FACTION_IDS } from '../data/factions';
import type { FactionId } from '../data/factions';
import type { UnitId } from '../data/units';
import { escapeHtml } from './format';
import { portraitStyle } from './unitPortrait';

/** Gesicht je Fraktion im Rundenmenü (Nutzer 16.11.): ihr Held. */
const FACE: Record<FactionId, UnitId> = { technoclan: 'commander', myriaden: 'swarmmind', terraformer: 'landformer' };

/**
 * Fraktionswahl als Bildkarten (Nutzer 16.11.: „UI im Rundenmenü schöner“): ersetzt die sichtbare Auswahlliste, die Liste
 * bleibt als Quelle der Wahrheit (versteckt). Gibt eine Funktion zurück, die die Karten an die Liste angleicht.
 */
export function factionTiles(select: HTMLSelectElement): () => void {
  const doc = select.ownerDocument;
  const row = doc.createElement('div');
  row.className = 'fpick';
  row.setAttribute('role', 'radiogroup');
  row.innerHTML = FACTION_IDS.map((id) => `<button type="button" class="fpick-b" data-f="${id}" role="radio" aria-checked="false">` +
    `<span class="fpick-face" style="${portraitStyle(FACE[id], 52)}"></span><span class="fpick-n">${escapeHtml(FACTIONS[id].name)}</span></button>`).join('');
  select.classList.add('fpick-src');
  select.insertAdjacentElement('afterend', row);
  const sync = (): void => {
    for (const b of row.querySelectorAll<HTMLButtonElement>('.fpick-b')) b.setAttribute('aria-checked', String(b.dataset.f === select.value));
  };
  row.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest<HTMLButtonElement>('.fpick-b');
    if (!b?.dataset.f) return;
    select.value = b.dataset.f;
    select.dispatchEvent(new Event('change'));
    sync();
  });
  select.addEventListener('change', sync);
  sync();
  return sync;
}
