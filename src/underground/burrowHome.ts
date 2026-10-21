import { vec3s } from '../core/vec';
import { WORM_SEGMENTS } from '../game/crawl';
import { wormBody } from '../worm/bodyLength';
import { canDigHere } from './digSpot';
import type { Slab } from './slab';
import { saveBurrow } from './burrows';
import { arriveBelow, buildStage, type MoveState } from './burrowMoves';
import { pressDig } from './burrowApproach';

/**
 * Straight underground, with no move to watch: the speed test's dig (BurrowGame.enterNow) and the
 * start again at "your burrow" (V4 spec 3 and 4.1: BurrowGame.enterBurrow), the burrow the worm
 * last went down, its tunnels put back. Once per entry; nothing here runs per step.
 */
const N = WORM_SEGMENTS;
const lying = vec3s(N);

/**
 * Underground at once: the dig-down started where the crawl lies (into `g.reuse` when set),
 * built, and ended in one go, the worm sunk and the camera framed. Not the player's visit (their
 * first still shows the hint card). False when the machine would not dig (it is not on the surface).
 */
export function sinkAtOnce(g: MoveState): boolean {
  if (!pressDig(g, true)) return false;
  g.visits--;
  while (g.stage) buildStage(g);
  g.machine.step(false, false, false, true, 1e6);
  arriveBelow(g, true);
  return true;
}

/**
 * The crawl lying still at slab `s`'s entry (where it was dug), head first, straight back along
 * the cut and facing along it: as the worm lay when it dug there (the dig was only offered where
 * that body's turn into the cut was clear of every footprint), so going down again is no turn.
 */
export function layAtEntry(g: MoveState, s: Slab): void {
  for (let i = 0; i < N; i++) {
    lying[i].x = s.ox - s.tx * wormBody.spacing * i;
    lying[i].y = 0;
    lying[i].z = s.oz - s.tz * wormBody.spacing * i;
  }
  g.crawl.reset(g.crawl.hero.count, lying, Math.atan2(s.tx, s.tz));
}

/**
 * Underground at once in "your burrow" (`g.home`), its tunnels as the worm left them, from
 * wherever the game was: on the surface, or below (what was dug there is kept first). With no
 * burrow yet (no dig-down this play), a new one where the crawl lies, or at the spawn (the crawl's
 * fresh start) where it may not dig. The caller resets what is its own (the prompt, the press).
 */
export function enterHome(g: MoveState): void {
  if (g.mode.mode !== 'surface' && !g.stage) saveBurrow(g.burrows, g.burrow, g.grid);
  g.machine.reset();
  g.stage = 0;
  g.nearTop = false;
  const s = g.home >= 0 ? g.burrows.slabs[g.home] : null;
  if (s) layAtEntry(g, s);
  else if (!canDigHere(g.crawl.motion, g.crawl.body)) g.crawl.reset(g.crawl.hero.count);
  g.reuse = s ? g.home : -1;
  sinkAtOnce(g);
}
