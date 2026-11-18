/**
 * Gamepad für Menüs (UI-Review 18.11., Punkt H): Steuerkreuz oder linker Stick bewegen den Fokus durch die Knöpfe
 * des offenen Menüs, A bestätigt, B wirkt wie Esc. Auf der Karte greift das Gamepad nicht ein.
 * `scope` liefert das gerade oberste Menü (oder null = kein Menü offen).
 */
export function startMenuGamepad(doc: Document, scope: () => Element | null): void {
  const win = doc.defaultView;
  if (!win || typeof navigator === 'undefined' || !('getGamepads' in navigator)) return;
  const root = doc.documentElement;
  let prev = new Set<string>();
  let held = '';
  let repeatAt = 0;
  let raf = 0;

  const focusables = (box: Element): HTMLElement[] =>
    [...box.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not([type="hidden"]):not(:disabled), [tabindex="0"]')].filter((e) => e.getClientRects().length > 0);
  const move = (box: Element, dir: 1 | -1): void => {
    const list = focusables(box);
    if (list.length === 0) return;
    const i = list.indexOf(doc.activeElement as HTMLElement);
    const el = list[i < 0 ? 0 : (i + dir + list.length) % list.length]!;
    el.focus();
    el.scrollIntoView({ block: 'nearest' });
  };

  const tick = (t: number): void => {
    raf = win.requestAnimationFrame(tick);
    const box = scope();
    const pad = navigator.getGamepads().find((g) => !!g);
    if (!pad || !box) {
      prev = new Set();
      return;
    }
    const b = (i: number): boolean => !!pad.buttons[i]?.pressed;
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const now = new Set<string>();
    if (b(12) || ay < -0.5) now.add('up');
    if (b(13) || ay > 0.5) now.add('down');
    if (b(14) || ax < -0.5) now.add('left');
    if (b(15) || ax > 0.5) now.add('right');
    if (b(0)) now.add('a');
    if (b(1)) now.add('b');
    for (const k of now) {
      const dir = k === 'up' || k === 'left' ? -1 : k === 'down' || k === 'right' ? 1 : 0;
      if (!prev.has(k)) {
        held = k;
        repeatAt = t + 400; // gehalten: nach 0,4 s wiederholen, dann alle 0,12 s
      } else if (dir !== 0 && held === k && t >= repeatAt) {
        repeatAt = t + 120;
      } else continue;
      root.classList.add('gp-nav');
      if (dir !== 0) move(box, dir);
      else if (k === 'a') {
        const el = doc.activeElement as HTMLElement | null;
        if (el && el !== doc.body && box.contains(el)) el.click();
        else move(box, 1);
      } else if (k === 'b') (doc.activeElement ?? doc.body).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }
    prev = now;
  };

  // Maus benutzt: Gamepad-Fokusrahmen wieder dem Browser überlassen.
  doc.addEventListener('pointerdown', () => root.classList.remove('gp-nav'));
  win.addEventListener('gamepadconnected', () => {
    if (!raf) raf = win.requestAnimationFrame(tick);
  });
}
