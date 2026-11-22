import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SimpleAi } from '../src/ai/simpleAi';
import { aiSeed } from '../src/match';
import { Lockstep } from '../src/net/lockstep';
import type { NetMsg } from '../src/net/protocol';
import { hashWorld } from '../src/sim/hash';
import type { PlayerId } from '../src/sim/types';
import { Session } from '../src/ui/session';

/**
 * Multiplayer (24.10.): Zwei Sessions, verbunden über eine nachgebaute Leitung mit schwankender
 * Laufzeit. Jede Seite wird von einer KI gesteuert, die nur über `issue` Befehle gibt – wie ein Mensch.
 * Beide Welten müssen am Ende gleich sein.
 *
 * `hidden`: Diese Seite liegt im Hintergrund-Tab – ihr Timer läuft nur 1× pro Sekunde (Browser-Drosselung).
 * `onMessage`: Sie rechnet zusätzlich bei jeder eintreffenden Nachricht weiter (wie game.ts seit 18.11.).
 */
function pair(latency: (rng: () => number) => number, seed = 11, hidden?: { side: 0 | 1; onMessage: boolean }) {
  let now = 0;
  let r = 12345;
  const rng = (): number => ((r = (Math.imul(r, 1103515245) + 12345) >>> 0) / 2 ** 32);
  const queue: { at: number; to: 0 | 1; m: NetMsg }[] = [];
  const net = { down: false };
  const sides: { s: Session; ls: Lockstep; ai: SimpleAi }[] = [];
  const sends: ((m: NetMsg) => void)[] = [];
  let lastAt: [number, number] = [0, 0];
  for (const me of [0, 1] as PlayerId[]) {
    const send = (m: NetMsg): void => {
      if (net.down) return; // Leitung weg: Nachricht verloren
      // Geordnete, zuverlässige Leitung: nie vor der vorherigen Nachricht ankommen.
      const to = (1 - me) as 0 | 1;
      const at = Math.max(lastAt[to], now + latency(rng));
      lastAt[to] = at;
      queue.push({ at, to, m: JSON.parse(JSON.stringify(m)) as NetMsg });
    };
    sends.push(send);
    const ls = new Lockstep(me, me === 0, send, 3);
    const s = new Session('play', 'felsenpass', seed, 'normal', ['technoclan', 'myriaden'], undefined, 'off', me, ls);
    sides.push({ s, ls, ai: new SimpleAi(me, aiSeed(seed, me)) });
  }
  // Verdeckte Vorbereitung: jeder formt in seiner Welt, dann tauschen.
  for (const { s, ai } of sides) for (const cmd of ai.prepare(s.world)) s.prepPlace(cmd);
  const preps = sides.map(({ s }) => s.finishPrep());
  sides[0]!.s.receivePrep(preps[1]!);
  sides[1]!.s.receivePrep(preps[0]!);
  lastAt = [0, 0];
  const stepSide = (i: number, onTick?: (side: number) => void): void => {
    const { s, ai } = sides[i]!;
    const due = Math.floor(now / 50);
    while (s.world.tick < due && !s.world.result) {
      if (s.world.tick % 5 === 0) for (const cmd of ai.think(s.world)) s.issue(cmd);
      if (!s.tryStep()) break;
      onTick?.(i);
    }
  };
  const deliver = (): void => {
    queue.sort((a, b) => a.at - b.at);
    while (queue.length && queue[0]!.at <= now) {
      const { to, m } = queue.shift()!;
      sides[to]!.ls.onMessage(m, now);
      if (hidden?.onMessage && to === hidden.side) stepSide(to);
    }
  };
  const run = (ms: number, onTick?: (side: number) => void): void => {
    const end = now + ms;
    while (now < end) {
      now += 10;
      deliver();
      if (now % 1000 === 0) for (const { ls } of sides) ls.ping(now);
      for (let i = 0; i < 2; i++) {
        if (hidden?.side === i && now % 1000 !== 0) continue; // gedrosselter Timer im Hintergrund-Tab
        stepSide(i, onTick);
      }
    }
  };
  return { sides, run, now: () => now, net, sends, queue, seed };
}

describe('Multiplayer: Lockstep', () => {
  it('22.11.: Verzögerung steigt bei Ausreißern sofort, sinkt erst nach mehreren ruhigen Messungen', () => {
    const ls = new Lockstep(0, true, () => {}, 3);
    let now = 0;
    const pong = (ms: number): void => {
      now += 1000;
      ls.onMessage({ k: 'pong', ts: now - ms }, now);
    };
    for (let i = 0; i < 3; i++) pong(40);
    assert.equal(ls.delay, 3, 'ruhige Leitung: 3 Ticks');
    pong(400); // ein Ausreißer
    assert.equal(ls.delay, 6, 'sofort hoch');
    // Der Ausreißer bleibt 8 Messungen im Spitzenwert, danach 5 ruhige in Folge, bis es wieder runtergeht.
    const seen: number[] = [];
    for (let i = 0; i < 14; i++) {
      pong(40);
      seen.push(ls.delay);
    }
    assert.ok(seen.slice(0, 11).every((d) => d === 6), `hält erst (${seen.join(',')})`);
    assert.equal(ls.delay, 3, 'dann wieder runter');
  });

  it('22.11.: eine Abweichung wird mit den betroffenen Bereichen gemeldet (Diagnose)', () => {
    const p = pair((rng) => 20 + rng() * 60);
    p.run(10_000);
    const [a, b] = p.sides;
    assert.equal(a!.ls.desyncAt, null);
    // Nur auf Rechner B: Fabrik-Fortschritt minimal verstellen (bewegt noch keine Einheit).
    const factory = b!.s.world.entities.find((e) => e.alive && e.producer && !e.producer.paused)!;
    factory.producer!.progress += 1e-6;
    p.run(3000);
    for (const side of [a!, b!]) {
      assert.ok(side.ls.desyncAt !== null, 'Abweichung erkannt');
      assert.ok(side.ls.desync!.differ.includes('fabriken'), `Bereich genannt: ${side.ls.desync!.differ.join(', ')}`);
      assert.ok(!side.ls.desync!.differ.includes('gelaende'));
      assert.equal(side.ls.desync!.theirs!.length, side.ls.desync!.mine.length);
    }
  });

  it('zwei Rechner mit schwankender Laufzeit bleiben gleich (KI-Befehle über issue)', () => {
    const p = pair((rng) => 20 + rng() * 140);
    p.run(120_000);
    const [a, b] = p.sides;
    const t = Math.min(a!.s.world.tick, b!.s.world.tick);
    assert.ok(t > 1500, `Partie läuft (Tick ${t})`);
    // Den weiter vorne liegenden nicht vergleichen: auf gleichen Tick bringen.
    p.run(2000);
    assert.equal(a!.ls.desyncAt, null, 'keine Abweichung gemeldet');
    assert.equal(b!.ls.desyncAt, null);
    const cmds = a!.s.world.log.filter((c) => c.tick > 0).length;
    // 30.10. (KI-Patch 3): Der Arbiter gibt je Denkschritt höchstens eine Energie-Ausgabe – in 2 min kommen weniger Befehle
    // als früher (vorher knapp über 20, auf dem Stand vor dem Patch schon 19). Es geht nur darum, dass Befehle durchlaufen.
    assert.ok(cmds > 10, `Befehle wurden ausgeführt (${cmds})`);
    // Beide Logs gleich bis zum gemeinsamen Tick.
    const upTo = Math.min(a!.s.world.tick, b!.s.world.tick);
    const la = a!.s.world.log.filter((c) => c.tick < upTo);
    const lb = b!.s.world.log.filter((c) => c.tick < upTo);
    assert.deepEqual(la, lb);
    assert.ok(a!.ls.delay >= 2 && a!.ls.delay <= 6, `Verzögerung nach Laufzeit (${a!.ls.delay})`);
  });

  it('die Vorbereitung beider landet in beiden Welten (gleicher Fingerabdruck zu Beginn)', () => {
    const p = pair(() => 40);
    const [a, b] = p.sides;
    assert.equal(a!.s.prepActive, false);
    assert.equal(hashWorld(a!.s.world), hashWorld(b!.s.world));
    const preps = a!.s.world.log.filter((c) => c.cmd.type === 'prepTerrain');
    assert.ok(preps.some((c) => c.player === 0) && preps.some((c) => c.player === 1), 'Platzierungen beider Seiten');
  });

  it('Pause des Hosts: beide halten nach demselben Tick an und laufen gemeinsam weiter', () => {
    const p = pair(() => 60);
    p.run(5000);
    const [host, guest] = p.sides;
    host!.ls.requestPause();
    guest!.ls.requestPause(); // der Gast darf nicht pausieren
    p.run(3000);
    assert.ok(host!.ls.paused && guest!.ls.paused, 'beide pausiert');
    assert.equal(host!.ls.pausedAt, guest!.ls.pausedAt, 'nach demselben Tick');
    const at = host!.s.world.tick;
    p.run(2000);
    assert.equal(host!.s.world.tick, at, 'steht');
    host!.ls.resume();
    p.run(3000);
    assert.ok(!host!.ls.paused && !guest!.ls.paused, 'beide laufen wieder');
    assert.ok(host!.s.world.tick > at + 40);
    p.run(2000);
    assert.equal(host!.ls.desyncAt, null);
  });

  it('Abweichung wird erkannt (Gegenprobe)', () => {
    const p = pair(() => 40);
    p.run(3000);
    p.sides[1]!.s.world.players[0].energy += 1; // nur auf einem Rechner
    p.run(5000);
    assert.notEqual(p.sides[0]!.ls.desyncAt, null);
  });

  it('kurzer Abbruch: Nachrichten gehen verloren, „resync“ holt sie nach – beide bleiben gleich', () => {
    const p = pair((rng) => 30 + rng() * 60);
    p.run(10_000);
    p.net.down = true;
    p.run(4000);
    p.net.down = false;
    const [a, b] = p.sides;
    // Wieder verbunden: jeder sagt, bis wohin er die Eingaben des anderen hat; der andere schickt nach.
    p.sends[0]!(b!.ls.resendFrom(a!.ls.have));
    p.sends[1]!(a!.ls.resendFrom(b!.ls.have));
    p.run(15_000);
    assert.ok(a!.s.world.tick > 500, `läuft weiter (${a!.s.world.tick})`);
    assert.equal(a!.ls.desyncAt, null);
    assert.equal(b!.ls.desyncAt, null);
  });

  it('Neuladen: der Neue bekommt den Stand, rechnet nach und spielt gleich weiter', () => {
    const p = pair((rng) => 30 + rng() * 60);
    p.run(20_000);
    // Rechner 1 stürzt ab: alles, was noch unterwegs ist, geht verloren.
    p.net.down = true;
    p.queue.length = 0;
    p.run(3000);
    p.net.down = false;
    const holder = p.sides[0]!;
    const payload = JSON.parse(JSON.stringify(holder.s.rejoinPayload({ mapId: 'felsenpass', seed: p.seed, factions: ['technoclan', 'myriaden'], overtime: 'off', hostSide: 0, delay: 3 }))) as ReturnType<Session['rejoinPayload']>;
    const ls = Lockstep.mirror(payload.ls, 1, false, p.sends[1]!, payload.tick);
    const fresh = new Session('play', 'felsenpass', p.seed, 'normal', ['technoclan', 'myriaden'], undefined, 'off', 1, ls);
    fresh.restore(payload);
    while (fresh.catchUpStep(1000)) { /* nachrechnen */ }
    assert.equal(fresh.catchUpMismatch, false, 'gleicher Fingerabdruck nach dem Nachrechnen');
    assert.equal(fresh.world.tick, holder.s.world.tick);
    p.sides[1] = { s: fresh, ls, ai: new SimpleAi(1, aiSeed(p.seed, 1)) };
    p.run(20_000);
    assert.ok(fresh.world.tick > payload.tick + 300, `läuft weiter (${payload.tick} → ${fresh.world.tick})`);
    assert.equal(holder.ls.desyncAt, null);
    assert.equal(ls.desyncAt, null);
  });

  it('hohe Laufzeit: größere Verzögerung, trotzdem gleich', () => {
    const p = pair((rng) => 150 + rng() * 200);
    p.run(30_000);
    const [a, b] = p.sides;
    assert.ok(a!.ls.delay >= 5, `Verzögerung wächst mit der Laufzeit (${a!.ls.delay})`);
    assert.equal(a!.ls.desyncAt, null);
    assert.equal(b!.ls.desyncAt, null);
  });

  it('Hintergrund-Tab (Timer nur 1×/s): rechnet er bei eintreffenden Eingaben weiter, läuft die Runde für beide in Echtzeit', () => {
    // Nur der gedrosselte Timer: Der wache Rechner wartet jede Sekunde auf den schlafenden – die Runde läuft
    // dann mit etwa 2 × Verzögerung Ticks pro Sekunde (~30 % Tempo) für beide.
    const slow = pair(() => 30, 11, { side: 1, onMessage: false });
    slow.run(20_000);
    const fast = pair(() => 30, 11, { side: 1, onMessage: true });
    fast.run(20_000);
    const rate = (p: typeof slow): number => p.sides[0]!.s.world.tick / 400; // 20 s × 20 Ticks
    assert.ok(rate(slow) < 0.5, `ohne Nachrichten-Antrieb gebremst (${rate(slow).toFixed(2)})`);
    assert.ok(rate(fast) > 0.9, `mit Nachrichten-Antrieb Echtzeit (${rate(fast).toFixed(2)})`);
    fast.run(2000);
    assert.equal(fast.sides[0]!.ls.desyncAt, null);
    assert.equal(fast.sides[1]!.ls.desyncAt, null);
  });
});
