import { FACTIONS, FACTION_IDS } from '../data/factions';
import type { FactionId } from '../data/factions';
import { MAPS } from '../data/maps';
import { OVERTIME_VARIANTS, OVERTIME_VARIANT_IDS } from '../data/rules';
import type { LobbySettings } from '../net/protocol';
import type { RoomRole, RoomStatus } from '../net/room';
import { escapeHtml } from './format';

/**
 * Multiplayer-Lobby (24.10.): Raum erstellen (Link und Code) oder beitreten. Sind beide da, wählt
 * jeder seine Fraktion (der andere sieht sie), der Host Karte, Spielbeschleuniger und Seite – und startet.
 */
export interface LobbyView {
  role: RoomRole | null;
  status: RoomStatus | 'idle';
  detail: string;
  code: string;
  link: string;
  local: boolean;
  settings: LobbySettings;
  ping: number;
  /** Code im Eingabefeld (Beitreten). */
  joinCode: string;
  copied: boolean;
}

export function defaultLobbySettings(): LobbySettings {
  return { mapId: 'random', overtime: 'off', hostSide: 0, hostFaction: 'technoclan', guestFaction: null };
}

const factionOptions = (selected: FactionId | null): string =>
  FACTION_IDS.map((id) => `<option value="${id}"${id === selected ? ' selected' : ''}>${escapeHtml(FACTIONS[id].name)}</option>`).join('');

function mapName(id: string): string {
  return id === 'random' ? 'Zufällige Karte' : MAPS.find((m) => m.id === id)?.name ?? id;
}

export function renderLobby(v: LobbyView): string {
  const head = `<p class="eyebrow">Multiplayer · 1 gegen 1</p><h1 class="card-title">${v.role === 'guest' ? 'Raum beitreten' : v.role === 'host' ? 'Dein Raum' : 'Multiplayer'}</h1>`;
  const leave = `<button type="button" class="btn" data-action="mp-leave">${v.role ? 'Raum verlassen' : 'Zurück'}</button>`;

  if (!v.role) {
    return `${head}
      <p class="lede small-lede">Erstelle einen Raum und schick den Link an deinen Mitspieler – oder tritt mit einem Raum-Code bei. Beide brauchen dieselbe Spielversion (die GitHub-Seite).</p>
      <div class="btn-row"><button type="button" class="btn-primary" data-action="mp-host">Raum erstellen</button></div>
      <div class="mp-join">
        <label for="mp-code" class="mp-label">Raum-Code</label>
        <input id="mp-code" class="mp-input" data-mp="code" maxlength="8" autocomplete="off" spellcheck="false" placeholder="z. B. K7QX2" value="${escapeHtml(v.joinCode)}">
        <button type="button" class="btn" data-action="mp-join">Beitreten</button>
      </div>
      <label class="mp-check"><input type="checkbox" data-mp="local" ${v.local ? 'checked' : ''}> Test: zwei Tabs in diesem Browser (ohne Internet)</label>
      ${v.detail ? `<p class="mp-error">${escapeHtml(v.detail)}</p>` : ''}
      <div class="btn-row">${leave}</div>`;
  }

  if (v.status === 'error' || v.status === 'closed') {
    return `${head}<p class="mp-error">${escapeHtml(v.detail || 'Verbindung beendet.')}</p><div class="btn-row">${leave}</div>`;
  }

  const codeBlock = v.role === 'host'
    ? `<div class="mp-code-row"><span class="mp-code" aria-label="Raum-Code">${escapeHtml(v.code)}</span>
         <button type="button" class="btn" data-action="mp-copy">${v.copied ? 'Link kopiert ✓' : 'Link kopieren'}</button></div>
       <p class="fine mp-link">${escapeHtml(v.link)}</p>`
    : `<p class="fine">Raum ${escapeHtml(v.code)}</p>`;

  if (v.status !== 'connected') {
    const wait = v.status === 'connecting' ? 'Verbinde …' : v.role === 'host' ? 'Warte auf deinen Mitspieler …' : 'Suche den Raum …';
    return `${head}${codeBlock}<p class="mp-status"><span class="mp-dot" data-s="wait"></span>${wait}</p><div class="btn-row">${leave}</div>`;
  }

  const s = v.settings;
  const host = v.role === 'host';
  const mySideHost = host;
  const side = (p: number): string => (p === 0 ? 'links' : 'rechts');
  const guestSide = s.hostSide === 0 ? 1 : 0;
  const row = (who: 'host' | 'guest'): string => {
    const mine = (who === 'host') === mySideHost;
    const faction = who === 'host' ? s.hostFaction : s.guestFaction;
    const name = mine ? 'Du' : 'Mitspieler';
    const role = who === 'host' ? 'Host' : 'Gast';
    const where = side(who === 'host' ? s.hostSide : guestSide);
    const pick = mine
      ? `<select data-mp="faction" aria-label="Deine Fraktion">${factionOptions(faction)}</select>`
      : `<span class="mp-faction" data-f="${faction ?? ''}">${faction ? escapeHtml(FACTIONS[faction].name) : 'wählt noch …'}</span>`;
    return `<li class="mp-player${mine ? ' me' : ''}"><span class="mp-who">${name} <small>${role} · ${where}</small></span>${pick}</li>`;
  };
  const settings = host
    ? `<div class="field-pair mp-settings">
        <div class="field"><label for="mp-map">Karte</label><select id="mp-map" data-mp="map"><option value="random"${s.mapId === 'random' ? ' selected' : ''}>Zufällige Karte</option>${MAPS.map((m) => `<option value="${m.id}"${m.id === s.mapId ? ' selected' : ''}>${escapeHtml(m.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="mp-ot">Spielbeschleuniger</label><select id="mp-ot" data-mp="overtime">${OVERTIME_VARIANT_IDS.map((id) => `<option value="${id}"${id === s.overtime ? ' selected' : ''}>${escapeHtml(OVERTIME_VARIANTS[id].name)}</option>`).join('')}</select></div>
        <div class="field"><label for="mp-side">Deine Seite</label><select id="mp-side" data-mp="side"><option value="0"${s.hostSide === 0 ? ' selected' : ''}>Links</option><option value="1"${s.hostSide === 1 ? ' selected' : ''}>Rechts</option></select></div>
      </div>
      <p class="field-note">${escapeHtml(OVERTIME_VARIANTS[s.overtime].description)}</p>`
    : `<p class="mp-summary">Karte: <b>${escapeHtml(mapName(s.mapId))}</b> · Spielbeschleuniger: <b>${escapeHtml(OVERTIME_VARIANTS[s.overtime].name)}</b></p>`;
  const ready = !!s.guestFaction;
  const start = host
    ? `<button type="button" class="btn-primary" data-action="mp-start" ${ready ? '' : 'disabled'}>Runde starten</button>`
    : `<p class="mp-status"><span class="mp-dot" data-s="ok"></span>Warte, bis der Host startet …</p>`;
  return `${head}${codeBlock}
    <p class="mp-status"><span class="mp-dot" data-s="ok"></span>Verbunden<span id="mp-ping">${v.ping ? ` · Ping ${Math.round(v.ping)} ms` : ''}</span></p>
    <ul class="mp-players">${row('host')}${row('guest')}</ul>
    ${settings}
    <p class="fine">Nach dem Start formt jeder verdeckt sein Gelände – die Runde beginnt, wenn beide „Bereit“ drücken. Im Multiplayer gibt es kein Tempo und keinen Blick durch den Nebel; pausieren kann nur der Host.</p>
    <div class="btn-row">${start}${leave}</div>`;
}
