import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { LocalRoom, STALE_MS, isStale } from '../src/net/roomBase';
import type { RoomStatus } from '../src/net/roomBase';
import type { NetMsg } from '../src/net/protocol';

/**
 * Raum (22.11.): Eine halbtote Verbindung (seit STALE_MS nichts mehr) darf ein neu anklopfender
 * Mitspieler ersetzen – sonst hieße es „Raum voll“, bis das späte `close` kommt.
 */
(globalThis as unknown as { window: unknown }).window ??= globalThis;
const realNow = performance.now.bind(performance);
let offset = 0;
Object.defineProperty(performance, 'now', { value: () => realNow() + offset, configurable: true });
after(() => Object.defineProperty(performance, 'now', { value: realNow, configurable: true }));

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function room(role: 'host' | 'guest', code: string) {
  const log: { status: RoomStatus[]; msgs: NetMsg[] } = { status: [], msgs: [] };
  const r = new LocalRoom(role, code, { status: (s) => log.status.push(s), message: (m) => log.msgs.push(m) });
  return { r, log };
}

describe('Raum: halbtote Verbindung', () => {
  it('isStale erst nach STALE_MS', () => {
    assert.equal(isStale(1000, 1000 + STALE_MS), false);
    assert.equal(isStale(1000, 1001 + STALE_MS), true);
  });

  it('ein zweiter Gast wird abgewiesen, solange der erste lebt – und ersetzt ihn, wenn nichts mehr kommt', async () => {
    const code = `T${Math.floor(Math.random() * 1e6)}`;
    const host = room('host', code);
    const a = room('guest', code);
    await wait(50);
    assert.equal(host.r.status, 'connected');
    assert.equal(a.r.status, 'connected');
    const b = room('guest', code);
    await wait(700);
    assert.equal(b.r.status, 'connecting', 'Raum voll');
    // A verstummt (Leitung still tot, kein „bye“): Zeit vorspulen.
    offset += STALE_MS + 1000;
    await wait(700);
    assert.equal(b.r.status, 'connected', 'B ersetzt A');
    host.r.send({ k: 'bye' });
    await wait(50);
    assert.equal(b.log.msgs.length, 1, 'Nachrichten gehen an B');
    assert.equal(a.log.msgs.length, 0);
    for (const x of [host, a, b]) x.r.close();
  });
});
