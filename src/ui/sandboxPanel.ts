import { FACTIONS, FACTION_IDS } from '../data/factions';
import type { FactionId } from '../data/factions';
import { MAPS } from '../data/maps';
import { UNITS } from '../data/units';
import type { UnitId } from '../data/units';
import type { Command } from '../sim/commands';
import type { PlayerId } from '../sim/types';

/**
 * Test-Box (15.11., Nutzer): Einheiten und Animationen direkt in der Umgebung ansehen – ohne Partie, Produktion
 * und Energie. Seitenleiste: Fraktionen und Karte wechseln (startet die Box neu), Einheit wählen und auf die Karte
 * klicken. Bauen geht wie gewohnt über die Bauleiste – ohne Bauzonen, Bauplatz-Limit und Wartezeit.
 */

export interface SandboxSetup {
  map: string;
  /** [links, rechts] – links bist du. */
  factions: [FactionId, FactionId];
}

export interface SandboxHost {
  issue: (cmd: Command) => void;
  restart: (setup: SandboxSetup) => void;
  aiOn: () => boolean;
  setAi: (on: boolean) => void;
  fogOn: () => boolean;
  setFog: (on: boolean) => void;
}

/** Alle Einheiten einer Fraktion, gruppiert nach Gebäude (Stufe 1–3), dazu Gerufene und Held. */
export function factionUnits(f: FactionId): { group: string; units: UnitId[] }[] {
  const def = FACTIONS[f];
  const out: { group: string; units: UnitId[] }[] = [];
  const seen = new Set<UnitId>();
  for (const b of Object.values(def.buildings)) {
    if (!b) continue;
    const units = b.tiers.filter((u) => !seen.has(u));
    units.forEach((u) => seen.add(u));
    if (units.length) out.push({ group: b.name, units });
  }
  const extra: UnitId[] = [];
  for (const u of [...seen]) {
    const sp = UNITS[u].former?.special;
    if (sp && !seen.has(sp)) {
      seen.add(sp);
      extra.push(sp);
    }
  }
  if (extra.length) out.push({ group: 'Gerufen', units: extra });
  if (def.hero && !seen.has(def.hero.unit)) out.push({ group: 'Held', units: [def.hero.unit] });
  return out;
}

export class SandboxPanel {
  readonly el: HTMLElement;
  /** Gewählte Einheit: Klicks auf die Karte setzen sie. */
  armed: UnitId | null = null;
  owner: PlayerId = 0;
  hold = true;
  count = 1;

  constructor(
    private readonly doc: Document,
    private readonly host: SandboxHost,
    private setup: SandboxSetup,
  ) {
    this.el = doc.createElement('aside');
    this.el.className = 'sbx';
    this.el.addEventListener('click', (ev) => this.onClick(ev));
    this.el.addEventListener('change', (ev) => {
      const t = ev.target as HTMLSelectElement;
      if (t.dataset.sbx === 'map') this.host.restart({ ...this.setup, map: t.value });
    });
    // Klicks und Rechtsklicks im Panel nicht an die Karte durchreichen.
    this.el.addEventListener('contextmenu', (ev) => ev.stopPropagation());
    doc.body.appendChild(this.el);
    doc.body.classList.add('sandbox-mode');
    this.render();
  }

  /** Neue Box mit anderem Aufbau (Fraktion/Karte): Panel bleibt, Auswahl wird zurückgesetzt. */
  reset(setup: SandboxSetup): void {
    this.setup = setup;
    this.armed = null;
    this.render();
  }

  disarm(): boolean {
    if (!this.armed) return false;
    this.armed = null;
    this.render();
    return true;
  }

  /** Klick auf die Karte (Punkt in Kacheln): gewählte Einheit setzen. true = verbraucht. */
  place(x: number, y: number): boolean {
    if (!this.armed) return false;
    this.host.issue({ type: 'sandboxSpawn', unit: this.armed, owner: this.owner, x, y, count: this.count, hold: this.hold });
    return true;
  }

  end(): void {
    this.el.remove();
    this.doc.body.classList.remove('sandbox-mode');
  }

  private onClick(ev: MouseEvent): void {
    const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-sbx]');
    if (!b || b.tagName === 'SELECT') return;
    const v = b.dataset.v ?? '';
    switch (b.dataset.sbx) {
      case 'fac-0':
      case 'fac-1': {
        const side = b.dataset.sbx === 'fac-0' ? 0 : 1;
        const f: [FactionId, FactionId] = [...this.setup.factions];
        f[side] = v as FactionId;
        this.host.restart({ ...this.setup, factions: f });
        return;
      }
      case 'owner':
        this.owner = Number(v) as PlayerId;
        this.armed = null;
        break;
      case 'hold':
        this.hold = v === '1';
        break;
      case 'count':
        this.count = Number(v);
        break;
      case 'unit':
        this.armed = this.armed === v ? null : (v as UnitId);
        break;
      case 'fog':
        this.host.setFog(!this.host.fogOn());
        break;
      case 'ai':
        this.host.setAi(!this.host.aiOn());
        break;
      case 'clear':
        this.host.issue({ type: 'sandboxClear', owner: v === '' ? undefined : (Number(v) as PlayerId) });
        break;
    }
    this.render();
  }

  private render(): void {
    const s = this.setup;
    const seg = (key: string, items: [string, string][], cur: string): string =>
      `<div class="sbx-seg">${items.map(([val, label]) => `<button type="button" data-sbx="${key}" data-v="${val}" class="${val === cur ? 'on' : ''}">${label}</button>`).join('')}</div>`;
    const facs = FACTION_IDS.map((f): [string, string] => [f, FACTIONS[f].name]);
    const groups = factionUnits(s.factions[this.owner])
      .map(
        (g) =>
          `<div class="sbx-group"><span>${g.group}</span>${g.units
            .map((u) => `<button type="button" data-sbx="unit" data-v="${u}" class="sbx-unit${this.armed === u ? ' on' : ''}" title="${UNITS[u].name}">${UNITS[u].name}</button>`)
            .join('')}</div>`,
      )
      .join('');
    this.el.innerHTML = `
      <h2>Test-Box</h2>
      <label class="sbx-row">Karte <select data-sbx="map">${MAPS.map((m) => `<option value="${m.id}"${m.id === s.map ? ' selected' : ''}>${m.name}</option>`).join('')}</select></label>
      <div class="sbx-row"><b>Du</b>${seg('fac-0', facs, s.factions[0])}</div>
      <div class="sbx-row"><b>Gegner</b>${seg('fac-1', facs, s.factions[1])}</div>
      <hr>
      <div class="sbx-row"><b>Setzen für</b>${seg('owner', [['0', 'Dich'], ['1', 'Gegner']], String(this.owner))}</div>
      <div class="sbx-row"><b>Verhalten</b>${seg('hold', [['1', 'Halten'], ['0', 'Laufen']], this.hold ? '1' : '0')}</div>
      <div class="sbx-row"><b>Anzahl</b>${seg('count', [['1', '1'], ['5', '5'], ['10', '10']], String(this.count))}</div>
      <div class="sbx-units">${groups}</div>
      <p class="sbx-hint">${this.armed ? `<b>${UNITS[this.armed].name}</b>: auf die Karte klicken · Rechtsklick oder Esc beendet` : 'Einheit wählen, dann auf die Karte klicken. Bauen über die Bauleiste – überall, ohne Limit und sofort.'}</p>
      <hr>
      <div class="sbx-row sbx-actions">
        <button type="button" data-sbx="ai" class="${this.host.aiOn() ? 'on' : ''}">Gegner-KI ${this.host.aiOn() ? 'an' : 'aus'}</button>
        <button type="button" data-sbx="fog" class="${this.host.fogOn() ? 'on' : ''}">Nebel ${this.host.fogOn() ? 'an' : 'aus'}</button>
        <button type="button" data-sbx="clear" data-v="1">Gegner leeren</button>
        <button type="button" data-sbx="clear" data-v="">Alle leeren</button>
      </div>`;
  }
}
