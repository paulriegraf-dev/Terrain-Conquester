import type { Route } from '../sim/types';
import type { World } from '../sim/world';
import type { Entity } from '../sim/entity';
import type { ViewState } from './view';
import type { Session } from './session';
import { Portrait } from './portrait';
import { checkBuild } from '../sim/placement';
import { BUILDINGS } from '../data/buildings';

/**
 * Tutorial (25.10. abends): eine echte Runde (Technoclan auf Felsenpass gegen eine wartende KI), in der die Leitstelle
 * Schritt für Schritt je einen Handgriff erklärt – was, wo und warum. Der Ort wird hervorgehoben (Ring + Pfeil auf
 * Knopf oder Karte), dann wartet das Tutorial, bis der Spieler es getan hat. Nur reine Hinweise haben „Weiter“.
 * Die KI hält still, bis die Grundlagen sitzen; danach läuft die Runde normal weiter.
 */
export interface TutorialHost {
  readonly doc: Document;
  session(): Session;
  view(): ViewState;
  /** Bildschirm-Koordinaten eines Kachelpunkts und Kachelgröße in Pixeln. */
  clientOf(x: number, y: number): { x: number; y: number };
  tilePx(): number;
}

type Target = { el: string } | { tile: { x: number; y: number }; r: number } | null;

interface Step {
  text: string;
  /** Tastenhinweis über dem Funkfenster (z. B. „Taste 1 · Kaserne“). */
  hint?: (c: Ctx) => string | null;
  target?: (c: Ctx) => Target;
  /** Fertig, sobald true – ohne `done` gibt es den Knopf „Weiter“. */
  done?: (c: Ctx) => boolean;
  onEnter?: (c: Ctx) => void;
  /** Schritt überspringen (z. B. Mechanik, die in dieser Ansicht ausgeblendet ist). */
  skip?: (c: Ctx) => boolean;
}

interface Ctx {
  world: World;
  view: ViewState;
  session: Session;
  /** Werte, die beim Betreten eines Schritts gemerkt werden. */
  memo: Record<string, number | string>;
  /** Bildschirmpunkt einer Kachel (für die Kamera-Schritte). */
  screenOf: (p: { x: number; y: number }) => { x: number; y: number };
}

/** Sprecher (Nutzer, 25.10. abends): Sonde 7 aus „Face_for_Tutorial“, Fenster im Hologramm-Stil. */
const SPEAKER = { face: 'sonde', name: 'Sonde 7' } as const;
const TYPE_SPEED = 55; // Zeichen je Sekunde

function own(c: Ctx, kind: 'building' | 'unit'): Entity[] {
  return c.world.entities.filter((e) => e.alive && e.owner === 0 && e.kind === kind);
}

function selectedFactory(c: Ctx): Entity | null {
  const s = c.view.selected;
  if (s?.kind !== 'entity') return null;
  const e = c.world.get(s.id);
  return e && e.alive && e.owner === 0 && e.producer ? e : null;
}

function keyOf(doc: Document, cmd: string): string | null {
  const k = doc.querySelector(`[data-cmd="${cmd}"] .key`)?.textContent?.trim();
  return k ? k.toUpperCase() : null;
}

function siteTop(c: Ctx): { x: number; y: number } | null {
  const s = c.world.map.sites.find((x) => x.route === 'top');
  return s ? s.pos : null;
}

/** Ein guter Punkt für die erste Fläche: vor der eigenen Grenze an der mittleren Lane. */
function prepSpot(c: Ctx): { x: number; y: number } {
  const w = c.world.map.width;
  return { x: Math.round(c.world.map.reserve + (w - 2 * c.world.map.reserve) * 0.28), y: Math.round(c.world.map.waypoints.mid.y) };
}

/** Freier Bauplatz in der eigenen Basis-Zone, möglichst nah an der mittleren Lane und weit vorn (zwischengespeichert). */
function buildSpot(c: Ctx): { x: number; y: number } {
  const key = `spot${own(c, 'building').length}`;
  const hit = c.memo[key];
  if (typeof hit === 'string') {
    const [x, y] = hit.split(',').map(Number);
    return { x: x!, y: y! };
  }
  const w = c.world.map.width;
  const midY = c.world.map.waypoints.mid.y;
  let best: { x: number; y: number } | null = null;
  let bestScore = Infinity;
  for (const sec of c.world.map.sections[0]) {
    for (const i of sec.cells) {
      const x = i % w;
      const y = Math.floor(i / w);
      const check = checkBuild(c.world, 0, x, y, BUILDINGS.barracks);
      if (!check.ok && !/Energie/.test(check.reason)) continue;
      const score = Math.abs(y + 1 - midY) * 2 - x;
      if (score < bestScore) {
        bestScore = score;
        best = { x: x + 1, y: y + 1 };
      }
    }
  }
  const spot = best ?? { x: 8, y: midY };
  c.memo[key] = `${spot.x},${spot.y}`;
  return spot;
}

/** Neue Spiel-UI (Variante C, 2,5D): nur Klicks, andere Knöpfe; die alte Ansicht behält Tastenhinweise. */
function isC(doc: Document): boolean {
  return doc.body.classList.contains('ui-c');
}

/** Erster sichtbarer Treffer aus mehreren Selektoren (neue und alte UI) – oder null. */
function vis(doc: Document, ...sel: string[]): Target {
  for (const q of sel) {
    const el = doc.querySelector<HTMLElement>(q);
    if (el && el.offsetParent !== null) return { el: q };
  }
  return null;
}

function frontsOpen(c: Ctx, doc: Document): boolean {
  return c.view.menu === 'front' || doc.body.dataset.pop === 'front';
}

function stanceBtn(doc: Document, r: Route, st: string): Target {
  return vis(doc, `[data-action="stance"][data-route="${r}"][data-stance="${st}"]`, `[data-cmd="stance-${r}-${st}"]`);
}

function ownHq(c: Ctx): Entity | undefined {
  return c.world.entities.find((e) => e.alive && e.kind === 'hq' && e.owner === 0);
}

function hqSelected(c: Ctx): boolean {
  const s = c.view.selected;
  return s?.kind === 'entity' && c.world.get(s.id)?.kind === 'hq';
}

function steps(doc: Document): Step[] {
  const key = (cmd: string, fallback: string): string => keyOf(doc, cmd) ?? fallback;
  return [
    {
      text: 'Kommandant, hier {name} von der Leitstelle. Ich zeige dir die Grundlagen – immer einen Handgriff nach dem anderen. Noch steht die Uhr still: Erst bereitest du dein Gelände vor.',
    },
    {
      text: 'Vor der Schlacht darfst du deine Hälfte umformen. Wald gibt Fußtruppen Deckung (Rüstung +1) und bremst Fahrzeuge. Wald ist schon gewählt – setz eine Fläche vor deine Grenze an der mittleren Lane.',
      hint: () => (isC(doc) ? 'Linksklick auf die Karte · Bodenart unten in der Leiste wählen' : 'Linksklick auf die Karte · 1–5 wechselt die Bodenart'),
      target: (c) => ({ tile: prepSpot(c), r: 2 }),
      onEnter: (c) => {
        c.memo.prep = c.world.players[0].prepLeft;
      },
      done: (c) => c.world.players[0].prepLeft < Number(c.memo.prep),
    },
    {
      text: 'Gut so. Der Gegner sieht deine Vorbereitung nicht. Weitere Flächen kannst du jederzeit setzen – jetzt drück „Bereit“, dann läuft die Zeit.',
      hint: () => (isC(doc) ? 'Unten auf ▶ · Bereit' : 'Enter · Bereit'),
      target: () => ({ el: '[data-cmd="prep-ready"]' }),
      done: (c) => !c.session.prepActive,
    },
    // 13.11. (Nutzer: „gehe auf Kameraführung auch ein“): die Kamera der 2,5D-Ansicht zum Mitmachen.
    {
      text: 'Kurz zur Kamera. Zieh die Karte mit gedrückter linker Maustaste – oder fahr mit W, A, S, D darüber.',
      hint: () => 'Linke Maustaste ziehen · W A S D',
      skip: () => !isC(doc),
      onEnter: (c) => {
        const p = c.screenOf(ownHq(c)?.pos ?? { x: 0, y: 0 });
        c.memo.camX = p.x;
        c.memo.camY = p.y;
      },
      done: (c) => {
        const p = c.screenOf(ownHq(c)?.pos ?? { x: 0, y: 0 });
        return Math.hypot(p.x - Number(c.memo.camX), p.y - Number(c.memo.camY)) > 80;
      },
    },
    {
      text: 'Es gibt vier Zoomstufen: Karte, Lanes, Mittel und Nah. Nah zeigt jede Figur im Gefecht. Schalte auf Nah.',
      hint: () => 'Rechts unten „Nah“ · Taste 4 · oder Mausrad',
      target: () => vis(doc, '[data-action="c-level"][data-level="near"]'),
      skip: () => !isC(doc),
      done: () => !!doc.querySelector('[data-action="c-level"][data-level="near"].on'),
    },
    {
      text: 'Darunter springst du direkt zu einer Lane – die Kamera fährt hin und bleibt in deiner Zoomstufe. Spring zur oberen Lane.',
      hint: () => 'Rechts unten „Oben“ · Tab springt zur nächsten Lane',
      target: () => vis(doc, '[data-action="c-lane"][data-route="top"]'),
      skip: () => !isC(doc),
      done: () => !!doc.querySelector('[data-action="c-lane"][data-route="top"].on'),
    },
    {
      text: 'Für den Überblick ist „Lanes“ am besten: alle drei Lanes mit Figuren im Bild. „Karte“ zeigt alles als Symbole. Schalte zurück auf Lanes.',
      hint: () => 'Rechts unten „Lanes“ · Taste 2',
      target: () => vis(doc, '[data-action="c-level"][data-level="lanes"]'),
      skip: () => !isC(doc),
      done: () => !!doc.querySelector('[data-action="c-level"][data-level="lanes"].on'),
    },
    {
      text: 'Truppen kommen aus Fabriken. Die Kaserne baut Fußtruppen wie Scharfschützen und Plasmawerfer. Wähle sie unten in der Bauleiste.',
      hint: () => (isC(doc) ? 'Klick auf die Kaserne in der Bauleiste' : `Taste ${key('build-barracks', '1')} · Kaserne`),
      target: () => ({ el: '[data-cmd="build-barracks"]' }),
      done: (c) => c.view.build?.building === 'barracks' || own(c, 'building').length > 0,
    },
    {
      text: 'Jetzt setz sie in deine Bauzone – die umrandete Fläche um dein HQ. Dort steht sie nah am HQ und bei deinen Truppen.',
      hint: (c) => (c.view.build ? 'Linksklick in die Bauzone · Rechtsklick bricht ab' : 'Erst die Kaserne in der Bauleiste wählen'),
      // Baumodus verloren (Rechtsklick, Esc)? Dann zurück auf den Knopf statt ins Leere.
      target: (c) => (c.view.build ? { tile: buildSpot(c), r: 2.5 } : { el: '[data-cmd="build-barracks"]' }),
      done: (c) => own(c, 'building').length > 0,
    },
    {
      text: 'Energie ist deine einzige Ressource: Du bezahlst damit Fabriken, Stufen, Forschung und Gelände – die Einheiten selbst kosten nichts, Fabriken bauen sie laufend. Energie fließt von selbst, mehr Land bringt mehr. Gleich rückt dein erster Verband aus.',
      target: () => vis(doc, '.c-energy', '#energy-value'),
      done: (c) => own(c, 'unit').length > 0,
    },
    {
      text: 'Da ist er. Klick jetzt deine Kaserne an – dort stellst du ein, welche Einheit sie baut und über welche Lane sie marschiert.',
      hint: () => 'Linksklick auf die Kaserne',
      target: (c) => {
        const b = own(c, 'building')[0];
        return b ? { tile: { x: b.pos.x, y: b.pos.y }, r: 1.6 } : null;
      },
      done: (c) => selectedFactory(c) !== null,
    },
    {
      text: 'Jede Fabrik schickt ihre Truppen über eine Lane: oben, Mitte oder unten. Ein Wechsel greift nach {route} s – bis dahin läuft der Nachschub über die alte Lane. Oben steht eine Station: Schick die Kaserne dorthin.',
      hint: (c) => (isC(doc) ? (selectedFactory(c) ? 'Im Fabrikfenster rechts unten · Oben' : 'Erst die Kaserne anklicken') : `Taste ${key('route-top', 'O')} · Oben`),
      target: (c) => {
        const t = vis(doc, '.cx-route[data-route="top"]', '[data-cmd="route-top"]');
        if (t) return t;
        const b = own(c, 'building')[0];
        return b ? { tile: { x: b.pos.x, y: b.pos.y }, r: 1.6 } : null;
      },
      done: (c) => own(c, 'building').some((f) => !!f.producer && (f.producer.route === 'top' || f.producer.pendingRoute === 'top')),
    },
    {
      text: 'Was die Truppen auf einer Lane tun, bestimmst du über die Fronten. Öffne die Fronten.',
      hint: () => (isC(doc) ? 'Klick oben auf die Lanes-Anzeige' : 'Esc, dann Taste A · Fronten'),
      target: (c) => (isC(doc) ? vis(doc, '[data-action="c-fronts"]') : c.view.selected ? null : { el: '[data-cmd="front"]' }),
      done: (c) => frontsOpen(c, doc),
    },
    {
      text: 'Vier Haltungen je Lane: Verteidigen bleibt an der Basis, Halten an der Grenze, Front greift an. Sichern schickt die Lane zur Station und hält sie. Ein Wechsel greift nach {stance} s. Stell die obere Lane auf Sichern.',
      hint: () => (isC(doc) ? 'Obere Lane · Sichern' : 'Taste 3 · Sichern (obere Lane)'),
      target: (c) => (frontsOpen(c, doc) ? stanceBtn(doc, 'top', 'secure') : vis(doc, '[data-action="c-fronts"]', '[data-cmd="front"]')),
      done: (c) => c.world.players[0].stance.top === 'secure' || c.world.players[0].pendingStance.top?.stance === 'secure',
    },
    {
      text: 'Die Station oben ist eine Werkhalle: Solange du sie hältst, bauen deine Fabriken dieser Lane schneller. Sie ruht, sobald Gegner näher als 6 Kacheln kommen. Deine Truppen sind unterwegs – mit 2× oder 4× geht es schneller.',
      hint: () => (isC(doc) ? 'Einnehmen: allein im Kreis stehen · Tempo links unten' : 'Einnehmen: allein im Kreis stehen · Ansicht 2× / 4×'),
      target: (c) => {
        const s = siteTop(c);
        return s ? { tile: s, r: 3.2 } : null;
      },
      done: (c) => c.world.siteStates.some((st, i) => c.world.map.sites[i]!.route === 'top' && st.owner === 0),
    },
    {
      text: 'Station gehört dir. Eine Fabrik reicht nicht lange: Der Hangar baut schnelle Hover-Späher, das Schwerwerk Panzer. Bau eine zweite Fabrik, sobald die Energie reicht.',
      hint: () => (isC(doc) ? 'Esc, dann Hangar in der Bauleiste' : `Taste ${key('build-workshop', '2')} · Hangar`),
      target: (c) => (c.view.build ? { tile: buildSpot(c), r: 2.5 } : vis(doc, '[data-cmd="build-workshop"]')),
      onEnter: (c) => {
        if (c.view.menu === 'front') c.view.menu = 'main';
        if (doc.body.dataset.pop === 'front') delete doc.body.dataset.pop;
      },
      done: (c) => own(c, 'building').length > 1,
    },
    {
      text: 'Fabriken lassen sich aufstufen: Eine höhere Stufe schaltet stärkere Einheiten frei. Klick eine deiner Fabriken an und stufe sie auf Stufe 2, sobald die Energie reicht.',
      hint: (c) => (selectedFactory(c) ? (isC(doc) ? 'Reiter „Stufe“ · Preis anklicken' : `Taste ${key('level', 'S')} · Stufe 2`) : 'Linksklick auf eine Fabrik'),
      target: (c) => {
        if (selectedFactory(c)) return vis(doc, '.cx-btn[data-action="upgrade"]', '[data-cmd="level"]');
        const b = own(c, 'building')[0];
        return b ? { tile: { x: b.pos.x, y: b.pos.y }, r: 1.6 } : null;
      },
      onEnter: (c) => {
        if (c.view.menu !== 'main') c.view.menu = 'main';
      },
      done: (c) => own(c, 'building').some((b) => (b.producer?.level ?? 1) >= 2 || b.producer?.job?.kind === 'level'),
    },
    {
      text: 'Auch dein HQ lässt sich ausbauen – in drei Zweigen: Aufklärung, Markt und Gelände. Jede Stufe bringt einen dauerhaften Vorteil. Klick dein HQ an und kauf eine erste Stufe.',
      hint: (c) => (hqSelected(c) ? 'Einen Zweig wählen' : 'Linksklick auf dein HQ'),
      target: (c) => {
        if (hqSelected(c)) return vis(doc, '[data-cmd^="hq-"]');
        const hq = ownHq(c);
        return hq ? { tile: { x: hq.pos.x, y: hq.pos.y }, r: 2.4 } : null;
      },
      done: (c) => Object.values(c.world.players[0].hq).some((t) => t > 0),
    },
    {
      text: 'Was der Gegner baut, verbirgt der Nebel. Ein Späher verrät es dir – Fabriken, Lanes, Truppen. Schick einen los.',
      hint: () => (isC(doc) ? 'Unten auf „Späher“, dann „Späher losschicken“' : `${vis(doc, '[data-cmd="scout"]') ? '' : 'Esc, dann '}Taste ${key('scout', 'L')} · Späher`),
      target: () => (isC(doc) ? (doc.body.dataset.pop === 'scout' ? vis(doc, '#scout-btn') : vis(doc, '.c-pop-btn[data-pop="scout"]')) : vis(doc, '[data-cmd="scout"]')),
      onEnter: (c) => {
        c.memo.scouts = c.world.players[0].stats.scouts;
      },
      done: (c) => c.world.players[0].stats.scouts > Number(c.memo.scouts),
    },
    {
      text: 'Der Bericht kommt gleich. Ab jetzt wird es ernst: Der Gegner baut auf. Achte auf seine Einheiten – im Konter-Brett (Taste H) siehst du, was wogegen hilft.',
      target: () => vis(doc, '#panel-scout', '.scout'),
      onEnter: (c) => {
        c.session.aiHold = false;
      },
    },
    {
      text: 'Wenn du dich stark genug fühlst: Front. Die Truppen der Lane ziehen bis zum gegnerischen HQ – wer die Mitte überquert, bleibt im Angriff. Öffne die Fronten und schick eine Lane nach vorn.',
      hint: () => (isC(doc) ? 'Lanes-Anzeige oben · eine Lane auf Front' : 'Taste A · Fronten, dann 4 / R / F · Front'),
      target: (c) => (frontsOpen(c, doc) ? stanceBtn(doc, 'mid', 'push') : vis(doc, '[data-action="c-fronts"]', '[data-cmd="front"]')),
      onEnter: () => {
        if (doc.body.dataset.pop === 'scout') delete doc.body.dataset.pop;
      },
      done: (c) => (['top', 'mid', 'bottom'] as Route[]).some((r) => c.world.players[0].stance[r] === 'push' || c.world.players[0].pendingStance[r]?.stance === 'push'),
    },
    {
      // 28.10. abends: Schlussstein-Fenster – der Schritt wartet auf das erste Fenster (10:00).
      // 13.11.: Nur in der alten Ansicht – die neue Spiel-UI blendet die Schlussstein-Karten aus (Nutzer 06.11.).
      text: 'Ab Minute 10 öffnet sich alle zwei Minuten ein Schlussstein-Fenster (wer ab Minute 8 die Kartenmitte hält, früher): Unten erscheinen Karten – ein Klick setzt den Schlussstein, kostenlos und sofort. Wähle deinen ersten, sobald es so weit ist.',
      skip: () => isC(doc),
      hint: (c) => {
        const g = c.world.players[0].gate;
        if (g.credits > 0) return 'Karte anklicken · Taste K öffnet und schließt die Karten';
        const left = Math.max(0, Math.ceil((g.next - c.world.tick) / c.world.tps));
        return `Erstes Fenster in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')} – mit 2× oder 4× geht es schneller`;
      },
      target: (c) => (c.world.players[0].gate.credits > 0 ? { el: '.ks-cards' } : null),
      done: (c) => c.world.players[0].gate.bought > 0,
    },
    {
      // 13.11.: Notfallverlegung (Knopf, einmal je Partie) und Basis-Comeback (11.11.).
      text: 'Noch ein Rettungsanker: Drängt der Gegner deine Basis zurück, erscheint unten die Notfallverlegung – einmal je Partie verlegst du Fabriken hinter dein HQ und betäubst die Angreifer kurz. Außerdem bauen Fabriken bei belagertem HQ schneller.',
    },
    {
      text: 'Das sind die Grundlagen. Gelände formen, Forschung und Erdwälle findest du in der Bauleiste, alles zum Nachlesen in der Übersicht (F1) unter Grundlagen. Zerstör das gegnerische HQ – viel Erfolg, Kommandant!',
    },
  ];
}

export class Tutorial {
  private readonly root: HTMLElement;
  private readonly box: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly progressEl: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly arrow: HTMLElement;
  private readonly portrait: Portrait;
  private readonly list: Step[];
  private index = -1;
  private shown = 0;
  private last = 0;
  private memo: Record<string, number | string> = {};
  private finished = false;
  constructor(private readonly host: TutorialHost) {
    const doc = host.doc;
    this.list = steps(doc);
    this.root = doc.createElement('div');
    this.root.className = 'tut tut-s-holo';
    this.root.innerHTML = `
      <div class="tut-ring" hidden></div>
      <div class="tut-arrow" hidden>▼</div>
      <div class="tut-box" role="dialog" aria-live="polite" aria-label="Tutorial">
        <p class="tut-hint" hidden></p>
        <div class="tut-frame">
          <div class="tut-face"><canvas class="tut-portrait" aria-hidden="true"></canvas></div>
          <div class="tut-talk">
            <p class="tut-name"></p>
            <p class="tut-text"></p>
            <div class="tut-row">
              <span class="tut-progress"></span>
              <button type="button" class="tut-skip" data-tut="skip">Tutorial beenden</button>
              <button type="button" class="tut-next" data-tut="next">Weiter ▸</button>
            </div>
          </div>
        </div>
      </div>`;
    doc.body.appendChild(this.root);
    this.box = this.root.querySelector('.tut-box')!;
    this.textEl = this.root.querySelector('.tut-text')!;
    this.hintEl = this.root.querySelector('.tut-hint')!;
    this.nextBtn = this.root.querySelector('.tut-next')!;
    this.progressEl = this.root.querySelector('.tut-progress')!;
    this.ring = this.root.querySelector('.tut-ring')!;
    this.arrow = this.root.querySelector('.tut-arrow')!;
    this.portrait = new Portrait(this.root.querySelector('.tut-portrait')!);
    this.root.addEventListener('click', (ev) => {
      const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-tut]');
      if (t?.dataset.tut === 'skip') this.end();
      else if (t?.dataset.tut === 'next') this.advance();
      else if ((ev.target as HTMLElement).closest('.tut-frame')) this.shown = Infinity; // Text sofort ganz zeigen
    });
    this.portrait.setFace(SPEAKER.face);
    this.root.querySelector('.tut-name')!.textContent = `${SPEAKER.name} · Leitstelle`;
    this.host.session().aiHold = true;
    this.advance();
  }

  get active(): boolean {
    return !this.finished;
  }

  private ctx(): Ctx {
    const session = this.host.session();
    return { world: session.world, view: this.host.view(), session, memo: this.memo, screenOf: (p) => this.host.clientOf(p.x, p.y) };
  }

  private advance(): void {
    if (this.index >= this.list.length - 1) {
      this.end();
      return;
    }
    this.index++;
    this.shown = 0;
    this.memo = {};
    if (this.list[this.index]!.skip?.(this.ctx())) {
      this.advance();
      return;
    }
    this.list[this.index]!.onEnter?.(this.ctx());
    this.box.classList.remove('tut-pop');
    void this.box.offsetWidth; // Animation neu starten
    this.box.classList.add('tut-pop');
  }

  /** Jedes Bild: Text tippen, Gesicht sprechen lassen, Ziel markieren, auf die Aktion warten. */
  update(now: number): void {
    if (this.finished) return;
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    const step = this.list[this.index]!;
    const c = this.ctx();
    const full = step.text
      .replace('{name}', SPEAKER.name)
      .replace('{route}', String(c.world.rules.routeChangeSeconds))
      .replace('{stance}', String(c.world.rules.front.stanceChangeSeconds));
    this.shown = Math.min(full.length, this.shown + dt * TYPE_SPEED);
    const n = Math.floor(this.shown);
    if (this.textEl.dataset.n !== String(n) || this.textEl.dataset.i !== String(this.index)) {
      this.textEl.textContent = full.slice(0, n);
      this.textEl.dataset.n = String(n);
      this.textEl.dataset.i = String(this.index);
    }
    const talking = n < full.length ? 1 : 0;
    this.portrait.draw(dt, talking);
    const hint = step.hint?.(c) ?? null;
    this.hintEl.hidden = !hint;
    if (hint && this.hintEl.textContent !== hint) this.hintEl.textContent = hint;
    this.nextBtn.hidden = !!step.done;
    this.nextBtn.textContent = this.index === this.list.length - 1 ? 'Los geht’s ▸' : 'Weiter ▸';
    const shownSteps = this.list.filter((st) => !st.skip?.(c));
    this.progressEl.textContent = `${shownSteps.indexOf(step) + 1} / ${shownSteps.length}`;
    this.place(step.target?.(c) ?? null);
    if (step.done && n >= full.length * 0.4 && step.done(c)) this.advance();
  }

  /** Ring und Pfeil auf den Knopf oder die Kachel legen (versteckt, wenn es das Ziel gerade nicht gibt). */
  private place(target: Target): void {
    let rect: { x: number; y: number; w: number; h: number } | null = null;
    if (target && 'el' in target) {
      const el = this.host.doc.querySelector<HTMLElement>(target.el);
      if (el && el.offsetParent !== null) {
        const r = el.getBoundingClientRect();
        rect = { x: r.left - 4, y: r.top - 4, w: r.width + 8, h: r.height + 8 };
      }
    } else if (target) {
      const p = this.host.clientOf(target.tile.x, target.tile.y);
      const r = target.r * this.host.tilePx();
      rect = { x: p.x - r, y: p.y - r, w: 2 * r, h: 2 * r };
    }
    this.ring.hidden = this.arrow.hidden = !rect;
    if (!rect) return;
    // Verdeckt das Funkfenster das Ziel, rückt es an den oberen Rand des Spielfelds.
    const b = this.box.getBoundingClientRect();
    const bottomTop = (this.host.doc.defaultView?.innerHeight ?? 900) - 300 - b.height; // Oberkante in der unteren Lage
    const overlaps = rect.x < b.right && rect.x + rect.w > b.left && rect.y + rect.h > bottomTop - 40 && rect.y < bottomTop + b.height;
    const onBoard = !('el' in (target ?? {}));
    this.box.classList.toggle('tut-top', overlaps && onBoard);
    const round = target && 'tile' in target;
    this.ring.style.cssText = `left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;border-radius:${round ? '50%' : '8px'}`;
    // Pfeil darüber – oder darunter, wenn oben kein Platz ist
    const below = rect.y < 60;
    this.arrow.classList.toggle('up', below);
    this.arrow.textContent = below ? '▲' : '▼';
    this.arrow.style.left = `${rect.x + rect.w / 2}px`;
    this.arrow.style.top = below ? `${rect.y + rect.h + 6}px` : `${rect.y - 34}px`;
  }

  end(): void {
    if (this.finished) return;
    this.finished = true;
    this.host.session().aiHold = false;
    this.root.remove();
  }
}
