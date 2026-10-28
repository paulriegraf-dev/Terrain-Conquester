import { KEYSTONE_OF, KEYSTONES, KEYSTONE_CARD_STYLE } from '../data/keystones';
import { UNITS } from '../data/units';
import type { UnitId } from '../data/units';
import type { PlayerId } from '../sim/types';
import type { World } from '../sim/world';
import { keystoneChoices, keystoneKnown } from '../sim/systems/keystone';
import { escapeHtml } from './format';
import { Portrait } from './portrait';

/**
 * Schlussstein-Zone (28.10. abends) in der Hinweiszone der Konsole: der Soldat (Porträt aus dem Tutorial, Text rechts,
 * höchstens zwei Zeilen) und darunter bis zu drei Schlussstein-Karten. Nur Anzeige und Klicks – die Wahl geht als Befehl
 * (mit Tick) an die Simulation. Jeder Spieler sieht nur seinen eigenen Soldaten.
 */

export interface KeystoneZoneHost {
  doc: Document;
  /** Schlussstein wählen (Befehl an die Simulation). */
  choose(upgradeId: string): void;
  /** Bildschirm-Punkt der eigenen Einheit (oder Fabrik) dieser Art – Ziel der fliegenden Karte. */
  locate(unit: UnitId): { x: number; y: number } | null;
}

/** Wichtigkeit: Erinnerungen verfallen, wenn etwas Wichtigeres kommt. */
const enum Prio {
  Reminder = 0,
  Note = 1,
  Main = 2,
}

interface Line {
  text: string;
  ms: number;
  prio: Prio;
}

const SPEAKER_FACE = 'sonde';

const LINES = {
  pre: 'Kommandant, die Lage spitzt sich zu. In dreißig Sekunden können wir einen Schlussstein setzen. Entscheiden Sie weise.',
  first: 'Jetzt oder nie, Kommandant! Der erste Schlussstein ist bereit – er wird diese Schlacht entscheiden. Wählen Sie, bevor der Feind es tut.',
  more: ['Ein weiterer Schlussstein, Kommandant. Nutzen Sie ihn.', 'Der Feind rüstet. Wir sollten nachziehen.', 'Noch eine Entscheidung, die den Tag wenden kann.'],
  centerOwn: 'Die Mitte hält, Kommandant. Noch vierzig Sekunden, dann ziehen wir vor.',
  centerFoe: 'Der Feind hält die Mitte – wenn wir ihn nicht vertreiben, rüstet er vor uns.',
  early: 'Die Mitte ist unser! Der nächste Schlussstein ist jetzt verfügbar.',
  waiting: 'Kommandant, die Wahl steht noch aus.',
  two: 'Zwei Schlusssteine warten. Länger sollten wir nicht zögern.',
  foe: (name: string): string => `Der Feind hat einen Schlussstein gesetzt: ${name}. Wir sollten darauf reagieren.`,
};

/** Lange Wörter auf schmalen Karten weich trennen (Scharf·schützen, Plasma·werfer) – Silbentrennung kennt der Browser nicht überall. */
function soft(text: string): string {
  return text.replace(/[A-Za-zÄÖÜäöüß]{11,}/g, (w) => `${w.slice(0, 6)}\u00ad${w.slice(6)}`);
}

/** Anzeigename und Hover-Text einer Karte. */
export function keystoneCardText(unit: UnitId): { name: string; sub: string; tip: string } {
  const k = KEYSTONE_OF[unit];
  if (!k) return { name: UNITS[unit].name, sub: '', tip: '' };
  const partner = KEYSTONES.find((x) => x.line === unit && x.unit !== unit);
  if (partner) {
    return { name: k.lineName ?? k.name, sub: `${k.name} · ${partner.name}`, tip: `${k.name} (${UNITS[k.unit].name}): ${k.rule} Zügel: ${k.rein}\n${partner.name} (${UNITS[partner.unit].name}): ${partner.rule} Zügel: ${partner.rein}` };
  }
  if (k.doors) return { name: UNITS[unit].name, sub: 'zwei Türen', tip: `${k.doors.map((d) => `${d.name}: ${d.description}`).join('\n')}\nZügel: ${k.rein}` };
  return { name: k.name, sub: UNITS[unit].name, tip: `${k.rule} Zügel: ${k.rein}` };
}

/** Name eines gewählten Schlusssteins (Lagebericht, Soldat). */
export function keystoneUpgradeName(world: World, p: PlayerId, upgradeId: string): string {
  const u = world.players[p].faction.upgrades.find((x) => x.id === upgradeId);
  if (!u) return upgradeId;
  const k = KEYSTONE_OF[u.unit];
  if (k?.doors) return `${u.name.replace(/^Schlussstein:? ?/, '')} (${UNITS[u.unit].name})`;
  const t = keystoneCardText(u.unit);
  return t.sub && k?.lineName ? `${t.name}: ${t.sub}` : `${t.name} (${UNITS[u.unit].name})`;
}

export class KeystoneZone {
  private readonly root: HTMLElement;
  private readonly sayEl: HTMLElement;
  private readonly soldierEl: HTMLElement;
  private readonly cardsEl: HTMLElement;
  private readonly chip: HTMLButtonElement;
  private readonly portrait: Portrait;
  private world: World | null = null;
  private current: { line: Line; until: number } | null = null;
  private queue: Line[] = [];
  private lastNow = 0;
  /** Zustand je Partie (Auslöser einmalig). */
  private seen = { opened: 0, early: 0, credits: 0, holdOwn: 0, holdFoe: 0, pre: false, more: 0, remindedFor: -2, revealed: new Set<string>() };
  private open = false;
  private expanded = false;
  private lockedUntil = 0;
  private flying = false;
  private sig = '';

  constructor(private readonly host: KeystoneZoneHost) {
    const doc = host.doc;
    this.root = doc.createElement('div');
    this.root.className = 'ks-zone';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="ks-soldier" hidden>
        <div class="ks-face"><canvas class="ks-portrait" aria-hidden="true"></canvas></div>
        <p class="ks-say" title="Klicken zum Ausblenden"></p>
      </div>
      <div class="ks-cards" role="group" aria-label="Schlussstein-Karten" hidden></div>`;
    const tip = doc.querySelector('.console-tip');
    (tip ?? doc.body).prepend(this.root);
    this.soldierEl = this.root.querySelector('.ks-soldier')!;
    this.sayEl = this.root.querySelector('.ks-say')!;
    this.cardsEl = this.root.querySelector('.ks-cards')!;
    this.portrait = new Portrait(this.root.querySelector('.ks-portrait')!);
    this.portrait.setFace(SPEAKER_FACE);
    // Chip neben der Uhr: pulsiert, solange Guthaben offen ist.
    this.chip = doc.createElement('button');
    this.chip.type = 'button';
    this.chip.className = 'ks-chip';
    this.chip.hidden = true;
    this.chip.title = 'Schlussstein wählen (Taste K)';
    this.chip.textContent = 'Schlussstein ◆';
    doc.getElementById('clock')?.after(this.chip);
    this.chip.addEventListener('click', () => this.toggle());
    this.sayEl.addEventListener('click', () => {
      this.current = null;
    });
    this.cardsEl.addEventListener('click', (ev) => this.onCardClick(ev));
  }

  /** Taste K: Karten öffnen/schließen. Gibt zurück, ob die Taste hier gebraucht wurde. */
  toggle(): boolean {
    const w = this.world;
    if (!w || this.me === null) return false;
    const credits = w.players[this.me].gate.credits;
    if (credits <= 0 && !this.open) return false;
    this.open = !this.open;
    this.expanded = false;
    this.sig = '';
    return true;
  }

  /** Hat der Spieler gerade eine Wahl offen (für die Tastenbelegung)? */
  get pending(): boolean {
    return !!this.world && this.me !== null && this.world.players[this.me].gate.credits > 0;
  }

  private me: PlayerId | null = null;

  /** Jedes Bild. `me` = null: niemand spielt (Vorschau, Replay) – die Zone bleibt leer. */
  update(world: World, me: PlayerId | null, active: boolean, now: number): void {
    const dt = this.lastNow ? Math.min(0.1, (now - this.lastNow) / 1000) : 0;
    this.lastNow = now;
    if (world !== this.world) this.reset(world);
    this.me = active ? me : null;
    if (this.me === null || !world.rules.keystone.enabled) {
      this.root.hidden = true;
      this.chip.hidden = true;
      this.setTipBusy(false);
      return;
    }
    this.triggers(world, this.me, now);
    this.showLine(now, dt);
    this.renderCards(world, this.me, now);
    const gate = world.players[this.me].gate;
    this.chip.hidden = gate.credits <= 0;
    const busy = !this.soldierEl.hidden || !this.cardsEl.hidden;
    this.root.hidden = !busy;
    this.setTipBusy(busy);
  }

  private setTipBusy(busy: boolean): void {
    this.root.parentElement?.classList.toggle('ks-busy', busy);
  }

  private reset(world: World): void {
    this.world = world;
    this.current = null;
    this.queue = [];
    this.seen = { opened: 0, early: 0, credits: 0, holdOwn: 0, holdFoe: 0, pre: false, more: 0, remindedFor: -2, revealed: new Set() };
    this.open = false;
    this.expanded = false;
    this.lockedUntil = 0;
    this.sig = '';
  }

  // ------------------------------------------------------------------ Soldat

  private say(text: string, seconds: number, prio: Prio): void {
    const line = { text, ms: seconds * 1000, prio };
    const higher = (this.current && this.current.line.prio > prio) || this.queue.some((q) => q.prio > prio);
    if (prio === Prio.Reminder && higher) return; // Erinnerungen verfallen
    if (prio > Prio.Reminder) this.queue = this.queue.filter((q) => q.prio !== Prio.Reminder);
    if (this.current && this.current.line.prio === Prio.Reminder && prio > Prio.Reminder) this.current = null;
    this.queue.push(line);
    this.queue.sort((a, b) => b.prio - a.prio);
  }

  private triggers(world: World, me: PlayerId, now: number): void {
    const s = this.seen;
    const g = world.players[me].gate;
    const foe: PlayerId = me === 0 ? 1 : 0;
    const fg = world.players[foe].gate;
    const r = world.rules.keystoneGate;
    if (!s.pre && g.opened === 0 && world.seconds >= r.first - 30 && world.seconds < r.first) {
      s.pre = true;
      this.say(LINES.pre, 6, Prio.Main);
    }
    if (g.opened > s.opened) {
      const early = g.early > s.early;
      if (early) this.say(LINES.early, 6, Prio.Main);
      else if (s.opened === 0) this.say(LINES.first, 15, Prio.Main);
      else {
        const i = s.more < LINES.more.length ? s.more : 0;
        s.more++;
        this.say(LINES.more[i]!, 6, Prio.Main);
      }
      s.opened = g.opened;
      s.early = g.early;
      if (g.credits > 0) {
        this.open = true;
        this.sig = '';
      }
    }
    if (s.holdOwn < 20 && g.hold >= 20) this.say(LINES.centerOwn, 6, Prio.Main);
    if (s.holdFoe < 20 && fg.hold >= 20) this.say(LINES.centerFoe, 6, Prio.Main);
    s.holdOwn = g.hold;
    s.holdFoe = fg.hold;
    if (g.credits >= 2 && s.credits < 2) this.say(LINES.two, 4, Prio.Note);
    s.credits = g.credits;
    if (g.credits > 0 && g.openSince >= 0 && world.tick - g.openSince >= 60 * world.tps && s.remindedFor !== g.openSince) {
      s.remindedFor = g.openSince;
      this.say(LINES.waiting, 4, Prio.Reminder);
    }
    for (const c of fg.chosen) {
      if (s.revealed.has(c.upgrade) || !keystoneKnown(world, me, foe, c.upgrade)) continue;
      s.revealed.add(c.upgrade);
      this.say(LINES.foe(keystoneUpgradeName(world, foe, c.upgrade)), 4, Prio.Note);
    }
    void now;
  }

  private showLine(now: number, dt: number): void {
    if (this.current && now >= this.current.until) this.current = null;
    if (!this.current && this.queue.length > 0) {
      const line = this.queue.shift()!;
      this.current = { line, until: now + line.ms };
      this.sayEl.textContent = line.text;
      this.sayEl.scrollTop = 0;
    }
    this.soldierEl.hidden = !this.current;
    if (this.current) {
      const left = this.current.until - now;
      // Mehr als zwei Zeilen: ab 15 % der Zeit langsam weiterrollen, bei 65 % ist das Ende zu sehen.
      const over = this.sayEl.scrollHeight - this.sayEl.clientHeight;
      if (over > 1) {
        const k = Math.min(1, Math.max(0, ((this.current.line.ms - left) / this.current.line.ms - 0.15) / 0.5));
        this.sayEl.scrollTop = Math.round(over * k);
      } else if (this.sayEl.scrollTop !== 0) this.sayEl.scrollTop = 0;
      const talking = this.current.line.ms - left < Math.min(this.current.line.ms * 0.6, this.current.line.text.length * 45) ? 1 : 0;
      this.portrait.draw(dt, talking);
    }
  }

  // ------------------------------------------------------------------ Karten

  private renderCards(world: World, me: PlayerId, now: number): void {
    if (this.flying) return;
    const gate = world.players[me].gate;
    const show = this.open && gate.credits > 0;
    this.cardsEl.hidden = !show;
    if (!show) {
      if (gate.credits <= 0) this.open = false;
      return;
    }
    const locked = now < this.lockedUntil;
    const dim = gate.openSince >= 0 && world.tick - gate.openSince >= 60 * world.tps;
    const choices = keystoneChoices(world, me);
    const sig = `${choices.map((c) => c.unit).join(',')}|${this.expanded}|${locked}|${dim}|${gate.credits}`;
    if (sig === this.sig) return;
    this.sig = sig;
    const style = KEYSTONE_CARD_STYLE[world.players[me].faction.id];
    this.cardsEl.style.setProperty('--ks-accent', style.accent);
    this.cardsEl.style.setProperty('--ks-glow', style.glow);
    this.cardsEl.classList.toggle('ks-dim', dim);
    this.cardsEl.classList.toggle('ks-locked', locked);
    this.cardsEl.classList.toggle('ks-expanded', this.expanded);
    const shown = this.expanded ? choices : choices.slice(0, 3);
    const card = (c: (typeof choices)[number]): string => {
      const t = keystoneCardText(c.unit);
      const icon = escapeHtml(KEYSTONE_OF[c.unit]?.icon ?? '◆');
      const k = KEYSTONE_OF[c.unit];
      if (k?.doors && c.upgrades.length === 2) {
        const doors = k.doors.map((d, i) => `<button type="button" class="ks-door" data-ks="${escapeHtml(c.upgrades[i]!)}" data-unit="${c.unit}" title="${escapeHtml(`${d.name}: ${d.description}`)}"${locked ? ' disabled' : ''}>${escapeHtml(d.name)}</button>`).join('');
        return `<div class="ks-card ks-has-doors" data-unit="${c.unit}" title="${escapeHtml(t.tip)}"><span class="ks-icon">${icon}</span><span class="ks-name">${escapeHtml(soft(t.name))}</span><span class="ks-doors">${doors}</span></div>`;
      }
      return `<button type="button" class="ks-card" data-ks="${escapeHtml(c.upgrades[0]!)}" data-unit="${c.unit}" title="${escapeHtml(t.tip)}"${locked ? ' disabled' : ''}><span class="ks-icon">${icon}</span><span class="ks-name">${escapeHtml(soft(t.name))}</span>${t.sub ? `<span class="ks-sub">${escapeHtml(soft(t.sub))}</span>` : ''}</button>`;
    };
    const more = !this.expanded && choices.length > 3 ? `<button type="button" class="ks-card ks-more" data-ks-more="1" title="Alle übrigen Schlusssteine zeigen"><span class="ks-icon">⋯</span><span class="ks-name">mehr …</span><span class="ks-sub">${choices.length - 3} weitere</span></button>` : '';
    this.cardsEl.innerHTML = shown.map(card).join('') + more;
  }

  private onCardClick(ev: Event): void {
    const el = (ev.target as HTMLElement).closest<HTMLElement>('[data-ks], [data-ks-more]');
    if (!el || this.flying) return;
    if (el.dataset.ksMore) {
      this.expanded = true;
      this.sig = '';
      return;
    }
    const id = el.dataset.ks;
    if (!id || performance.now() < this.lockedUntil) return;
    this.host.choose(id);
    this.lockedUntil = performance.now() + 2000; // gegen Doppelklick-Fehlwahlen
    // Karte fliegt zur Einheit/Fabrik, die anderen verblassen.
    const card = el.closest<HTMLElement>('.ks-card') ?? el;
    const unit = (el.dataset.unit ?? card.dataset.unit) as UnitId | undefined;
    const target = unit ? this.host.locate(unit) : null;
    for (const other of this.cardsEl.querySelectorAll<HTMLElement>('.ks-card')) if (other !== card) other.classList.add('ks-fade');
    const r = card.getBoundingClientRect();
    const dx = target ? target.x - (r.left + r.width / 2) : 0;
    const dy = target ? target.y - (r.top + r.height / 2) : -40;
    card.style.setProperty('--ks-dx', `${Math.round(dx)}px`);
    card.style.setProperty('--ks-dy', `${Math.round(dy)}px`);
    card.classList.add('ks-fly');
    this.flying = true;
    window.setTimeout(() => {
      this.flying = false;
      this.expanded = false;
      this.sig = '';
    }, 650);
  }
}
