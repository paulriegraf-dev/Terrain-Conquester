/** Kleine Format-Helfer für die Oberfläche (deutsch). */

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function num(value: number, digits = 0): string {
  return value.toLocaleString('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function percent(share: number): string {
  return `${Math.round(share * 100)} %`;
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * Kurzer, sprechender Name eines Upgrades für das Forschungspanel (Wunsch 24.10.): die Wirkung statt des Namens –
 * „Stärke +1“ statt „Waffen I“. Die echten Namen stehen weiter in der Fabrik und im Tooltip.
 */
export function shortUpgradeLabel(description: string): string {
  const parts = description.split(' – ');
  const fork = parts[0] === 'Lücke schließen' || parts[0] === 'Spezialist';
  let s = (fork ? parts[1] : parts[0]) ?? description;
  s = s
    .replace(/^größerer Flächenschaden \((\+[\d,]+) Radius\)$/, 'Fläche $1')
    .replace(/^kleiner Flächenschaden \(Radius ([\d,]+)\)$/, 'Fläche $1')
    .replace(/^Flächenschaden \(Radius ([\d,]+)\)$/, 'Fläche $1')
    .replace(/^größere Fläche \((\+[\d,]+)\)/, 'Fläche $1')
    .replace(/kleinere Fläche \((−[\d,]+)\)/, 'Fläche $1')
    .replace(/, 20 % weniger Schaden$/, ', −20 % Schaden')
    .replace(/^trifft auch den nächsten Gegner dahinter \(halbe Wirkung\)$/, 'Durchschuss')
    .replace(/^\+30 s bis zum Verfall$/, 'Lebenszeit +30 s')
    .replace(/ pro Wunde$/, '');
  return fork ? `${parts[0] === 'Spezialist' ? 'Spezialist' : 'Lücke'}: ${s}` : s;
}
