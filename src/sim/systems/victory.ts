import type { World } from '../world';

/**
 * Runde vorbei, sobald ein HQ fällt. Es gibt bewusst kein Zeitlimit:
 * Das Pacing (Phasen in src/data/rules.ts) sorgt dafür, dass es dazu kommt.
 */
export function checkVictory(world: World): void {
  if (world.result) return;
  const hq0 = world.hq(0);
  const hq1 = world.hq(1);
  const dead0 = !hq0 || !hq0.alive;
  const dead1 = !hq1 || !hq1.alive;
  if (dead0 || dead1) world.finish(dead0 && dead1 ? null : dead0 ? 1 : 0, 'hq');
}
