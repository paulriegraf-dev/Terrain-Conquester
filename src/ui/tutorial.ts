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
}

interface Ctx {
  world: World;
  view: ViewState;
  session: Session;
  /** Werte, die beim Betreten eines Schritts gemerkt werden. */
  memo: Record<string, number | string>;
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

function steps(doc: Document): Step[] {
  return [
    {
      text: 'Kommandant, hier {name} von der Leitstelle. Ich zeige dir die Grundlagen – immer einen Handgriff nach dem anderen. Noch steht die Uhr still: Erst bereitest du dein Gelände vor.',
    },
    {
      text: 'Vor der Schlacht darfst du deine Hälfte umformen. Wald gibt Fußtruppen Deckung (Rüstung +1) und bremst Fahrzeuge. Wald ist schon gewählt – setz eine Fläche vor deine Grenze an der mittleren Lane.',
      hint: () => 'Linksklick auf die Karte · 1–5 wechselt die Bodenart',
      target: (c) => ({ tile: prepSpot(c), r: 2 }),
      onEnter: (c) => {
        c.memo.prep = c.world.players[0].prepLeft;
      },
      done: (c) => c.world.players[0].prepLeft < Number(c.memo.prep),
    },
    {
      text: 'Gut so. Der Gegner sieht deine Vorbereitung nicht. Weitere Flächen kannst du jederzeit setzen – jetzt drück „Bereit“, dann läuft die Zeit.',
      hint: () => 'Enter · Bereit',
      target: () => ({ el: '[data-cmd="prep-ready"]' }),
      done: (c) => !c.session.prepActive,
    },
    {
      text: 'Truppen kommen aus Fabriken. Die Kaserne baut Fußtruppen wie Scharfschützen und Plasmawerfer. Wähle sie unten im Befehlsraster.',
      hint: () => `Taste ${keyOf(doc, 'build-barracks') ?? '1'} · Kaserne`,
      target: () => ({ el: '[data-cmd="build-barracks"]' }),
      done: (c) => c.view.build?.building === 'barracks' || own(c, 'building').length > 0,
    },
    {
      text: 'Jetzt setz sie in deine Bauzone – die umrandete Fläche um dein HQ. Dort ist sie befestigt und nimmt nur halben Schaden.',
      hint: () => 'Linksklick in die Bauzone · Rechtsklick bricht ab',
      target: (c) => ({ tile: buildSpot(c), r: 2.5 }),
      done: (c) => own(c, 'building').length > 0,
    },
    {
      text: 'Fabriken produzieren von selbst – du musst nichts nachkaufen. Energie kommt aus deinem Gebiet; je mehr Land du hältst, desto mehr fließt. Warte kurz, gleich rückt dein erster Verband aus.',
      target: () => ({ el: '#energy-value' }),
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
      text: 'Jede Fabrik schickt ihre Truppen über eine Lane: oben, Mitte oder unten. Oben steht eine Station – schick die Kaserne dorthin.',
      hint: () => `Taste ${keyOf(doc, 'route-top') ?? 'O'} · Oben`,
      target: () => ({ el: '[data-cmd="route-top"]' }),
      done: (c) => {
        const f = selectedFactory(c) ?? own(c, 'building')[0];
        return !!f?.producer && (f.producer.route === 'top' || f.producer.pendingRoute === 'top');
      },
    },
    {
      text: 'Was die Truppen auf einer Lane tun, bestimmst du über die Fronten. Schließ die Fabrik mit Esc und öffne die Fronten.',
      hint: () => 'Esc, dann Taste A · Fronten',
      target: (c) => (c.view.selected ? null : { el: '[data-cmd="front"]' }),
      done: (c) => c.view.menu === 'front',
    },
    {
      text: 'Vier Haltungen je Lane: Verteidigen bleibt an der Basis, Halten an der Grenze, Front greift an. Sichern schickt die Lane zur Station und hält sie. Stell die obere Lane auf Sichern.',
      hint: () => 'Taste 3 · Sichern (obere Lane)',
      target: () => ({ el: '[data-cmd="stance-top-secure"]' }),
      done: (c) => c.world.players[0].stance.top === 'secure' || c.world.players[0].pendingStance.top?.stance === 'secure',
    },
    {
      text: 'Die Station oben ist eine Werkhalle: Solange du sie hältst, bauen deine Fabriken dieser Lane schneller. Sie ruht, sobald Gegner näher als 6 Kacheln kommen. Deine Truppen sind unterwegs – mit 2× oder 4× geht es schneller.',
      hint: () => 'Einnehmen: allein im Kreis stehen · Ansicht 2× / 4×',
      target: (c) => {
        const s = siteTop(c);
        return s ? { tile: s, r: 3.2 } : null;
      },
      done: (c) => c.world.siteStates.some((st, i) => c.world.map.sites[i]!.route === 'top' && st.owner === 0),
    },
    {
      text: 'Station gehört dir. Eine Fabrik reicht nicht lange: Der Hangar baut schnelle Hover-Späher, das Schwerwerk Panzer. Bau eine zweite Fabrik, sobald die Energie reicht.',
      hint: () => `Taste ${keyOf(doc, 'build-workshop') ?? '2'} · Hangar`,
      target: (c) => (c.view.build ? { tile: buildSpot(c), r: 2.5 } : { el: '[data-cmd="build-workshop"]' }),
      onEnter: (c) => {
        if (c.view.menu === 'front') c.view.menu = 'main';
      },
      done: (c) => own(c, 'building').length > 1,
    },
    {
      text: 'Was der Gegner baut, verbirgt der Nebel. Ein Späher verrät es dir – Fabriken, Lanes, Truppen. Schick einen los.',
      hint: () => `Taste ${keyOf(doc, 'scout') ?? 'L'} · Späher`,
      target: () => ({ el: '[data-cmd="scout"]' }),
      onEnter: (c) => {
        c.memo.scouts = c.world.players[0].stats.scouts;
      },
      done: (c) => c.world.players[0].stats.scouts > Number(c.memo.scouts),
    },
    {
      text: 'Der Bericht steht rechts. Ab jetzt wird es ernst: Der Gegner baut auf. Achte auf seine Einheiten – im Konter-Brett (Taste H) siehst du, was wogegen hilft.',
      target: () => ({ el: '.scout' }),
      onEnter: (c) => {
        c.session.aiHold = false;
      },
    },
    {
      text: 'Wenn du dich stark genug fühlst: Front. Die Truppen der Lane ziehen bis zum gegnerischen HQ – wer die Mitte überquert, bleibt im Angriff. Öffne die Fronten und schick eine Lane nach vorn.',
      hint: () => 'Taste A · Fronten, dann 4 / R / F · Front',
      target: (c) => (c.view.menu === 'front' ? { el: '[data-cmd="stance-mid-push"]' } : { el: '[data-cmd="front"]' }),
      done: (c) => (['top', 'mid', 'bottom'] as Route[]).some((r) => c.world.players[0].stance[r] === 'push' || c.world.players[0].pendingStance[r]?.stance === 'push'),
    },
    {
      text: 'Das sind die Grundlagen. Gelände formen, Forschung und Erdwälle findest du im Befehlsraster, alles zum Nachlesen – Wirtschaft, Markt, Gebiet – in der Übersicht (F1) unter Grundlagen. Zerstör das gegnerische HQ – viel Erfolg, Kommandant!',
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
    return { world: session.world, view: this.host.view(), session, memo: this.memo };
  }

  private advance(): void {
    if (this.index >= this.list.length - 1) {
      this.end();
      return;
    }
    this.index++;
    this.shown = 0;
    this.memo = {};
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
    const full = step.text.replace('{name}', SPEAKER.name);
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
    this.progressEl.textContent = `${this.index + 1} / ${this.list.length}`;
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
