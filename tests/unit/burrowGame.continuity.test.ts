import { describe, it, expect } from 'vitest';
import { cameraProgress, SWING_S, type Mode } from '../../src/underground/modeMachine';
import { POINT_SPEED } from '../../src/underground/bodyPath';
import { DT, UP, RIGHT, makeGame, press, run, until, steerToTop, shown, gap, type Shown } from './burrowPlay';
import type { BurrowGame } from '../../src/underground/burrowGame';

/** A point never moves more than this in a step (the moves' own cap, a little over): nothing jumps. */
const STEP_MAX = POINT_SPEED * DT * 1.05;
/** The cut camera's frame centre moves at most this in a step. */
const FRAME_STEP = 0.1;

/** The circular distance between two wave phases (only the fraction of a wave shows). */
const phaseGap = (a: number, b: number): number => Math.abs(a - b - Math.round(a - b));

/**
 * Watches every step as the renderer draws it: each step's first frame (alpha 0) is exactly the
 * last step's last frame (alpha 1), the worm and both cameras alike; no point jumps within a step;
 * the cut camera's frame and the blend between the cameras move smoothly.
 */
function watcher(game: BurrowGame) {
  let last: Shown = shown(game, 1);
  let lastMode: Mode = game.mode.mode;
  let lastBlend = cameraProgress(game.mode);
  const seen = new Set<string>();
  const most = { join: 0, step: 0, crawl: 0, cam: 0, cut: 0, blend: 0, wave: 0, frame: 0 };
  return {
    seen, most,
    each(): void {
      const a = shown(game, 0);
      const b = shown(game, 1);
      const mode = game.mode.mode;
      if (mode !== lastMode) seen.add(`${lastMode}>${mode}`);
      most.join = Math.max(most.join, gap(a.body, last.body));
      // Within a step: the game's poses (the moves, the cut), and the crawl's own (loosely: V1's).
      if (mode === 'surface') most.crawl = Math.max(most.crawl, gap(b.body, a.body));
      else most.step = Math.max(most.step, gap(b.body, a.body));
      const blend = cameraProgress(game.mode);
      // The surface camera moves to where the worm will come out as it starts up, while only the
      // cut camera shows (the blend is all the cut's then): it never jumps while it shows.
      if (blend < 1 || lastBlend < 1) most.cam = Math.max(most.cam, gap(a.surfCam, last.surfCam));
      most.wave = Math.max(most.wave, phaseGap(a.phase, last.phase), Math.abs(a.activity - last.activity));
      if (a.cut && last.cut) most.cut = Math.max(most.cut, ...a.cut.map((x, i) => Math.abs(x - last.cut![i])));
      if (a.cut && b.cut) most.frame = Math.max(most.frame, Math.hypot(b.cut[0] - a.cut[0], b.cut[1] - a.cut[1]));
      most.blend = Math.max(most.blend, Math.abs(blend - lastBlend));
      last = b;
      lastMode = mode;
      lastBlend = blend;
    },
  };
}

describe('the game is continuous frame to frame through every move (Matt notices jitter)', () => {
  for (const view of ['wide', 'close'] as const) {
    it(`down and back up in ${view}: the worm, the surface camera and the cut camera never jump`, () => {
      const { game } = makeGame({ view });
      const w = watcher(game);
      run(game, 0.6, { x: 0.4, y: 1 }, w.each);
      press(game, { x: 0.4, y: 1 }, w.each);
      until(game, 'underground', 8, UP, w.each);
      run(game, 1.5, RIGHT, w.each);
      run(game, 1, { x: -0.5, y: -1 }, w.each);
      press(game, RIGHT, w.each);
      steerToTop(game, w.each);
      press(game, UP, w.each);
      until(game, 'surface', 8, UP, w.each);
      run(game, 1, UP, w.each);
      expect([...w.seen]).toEqual(['surface>diggingDown', 'diggingDown>underground', 'underground>comingUp', 'comingUp>surface']);
      // Exact, but for the hand-over to the crawl: the move's last step, eased to rest, is not drawn.
      expect(w.most.join).toBeLessThan(1e-5);
      expect(w.most.step).toBeLessThan(STEP_MAX);
      expect(w.most.crawl).toBeLessThan(0.07);
      expect(w.most.cam).toBeLessThan(1e-6);
      expect(w.most.wave).toBeLessThan(1e-5);
      expect(w.most.cut).toBeLessThan(1e-9);
      expect(w.most.frame).toBeLessThan(FRAME_STEP);
      expect(w.most.blend).toBeLessThan(DT / SWING_S + 1e-9);
    });
  }
});
