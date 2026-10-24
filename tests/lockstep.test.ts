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
 */
function pair(latency: (rng: () => number) => number, seed = 11) {
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
  const deliver = (): void => {
    queue.sort((a, b) => a.at - b.at);
    while (queue.length && queue[0]!.at <= now) {
      const { to, m } = queue.shift()!;
      sides[to]!.ls.onMessage(m, now);
    }
  };
  const run = (ms: number, onTick?: (side: number) => void): void => {
    const end = now + ms;
    while (now < end) {
      now += 10;
      deliver();
      if (now % 1000 === 0) for (const { ls } of sides) ls.ping(now);
      for (let i = 0; i < 2; i++) {
        const { s, ai } = sides[i]!;
        const due = Math.floor(now / 50);
        while (s.world.tick < due && !s.world.result) {
          if (s.world.tick % 5 === 0) for (const cmd of ai.think(s.world)) s.issue(cmd);
          if (!s.tryStep()) break;
          onTick?.(i);
        }
      }
    }
  };
  return { sides, run, now: () => now, net, sends, queue, seed };
}

describe('Multiplayer: Lockstep', () => {
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
    assert.ok(cmds > 20, `Befehle wurden ausgeführt (${cmds})`);
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
});
