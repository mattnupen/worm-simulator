import type { Vec2 } from '../core/vec';
import type { Crawl } from '../game/crawl';
import type { ActionKind } from '../ui/actionPrompt';
import type { Slab } from './slab';
import { createSoilGrid } from './soilGrid';
import { createSolids } from './solids';
import { createBurrower, stepBurrowing, type Pointing } from './burrowMotion';
import { canEmergeAt, createEmergeMap } from './emergeMap';
import { createBodyPath } from './bodyPath';
import { createModeMachine, cameraProgress, promptKind, type Mode, type UndergroundView } from './modeMachine';
import { createCutCam, followCut, type CutFrame, type FrameAsk } from './cutCamera';
import { clearOpenings, createOpenings } from './openings';
import { clearBurrows, createBurrows } from './burrows';
import { enterHome, sinkAtOnce } from './burrowHome';
import { approachStep, createApproach, startApproach } from './burrowApproach';
import { DigAsk } from './digAsk';
import { startDig, startUp, stepMove, type MoveState } from './burrowMoves';
import { setBodyLength, wormBody, WORM_SEGMENTS } from '../worm/bodyLength';

/** What the game asks of the page. */
export interface BurrowHost {
  /** prefers-reduced-motion, read as each move starts. */
  reducedMotion(): boolean;
  /** The player switched the underground view: store it (the V1 save rule: stored only when picked). */
  saveView(v: UndergroundView): void;
}

/** The first visit's hint card shows for this long underground (then the cut is left clear). */
export const HINT_S = 12;
export { DIG_RECHECK, DIG_RETURN } from './digAsk';

/**
 * The surface-and-underground game (V2 spec 4, 6, 7): the mode machine, the slab and its soil, the
 * worm in the cut, its moves in and out (burrowMoves.ts), the cut camera's frame, the burrow
 * openings and what Action would do (`prompt`). On the surface it steps the crawl as before;
 * from a dig until the worm is back up the crawl stands still (no hero-leaf physics, no leaf-map
 * stamping). Pure (no three.js): the renderer (Task 17) reads it. Allocates nothing per step,
 * except once per dig and once per coming up.
 *
 * FOR TASK 17 (main.ts and the renderer):
 * - each game step: `step(dt, cmds.move, cmds.action)` with the HELD Action level (Space or the
 *   touch button: `cmds.action` already ORs `touchHeld`); on steps that must not act (paused,
 *   another screen): `hold(cmds.action)`. The prompt is `prompt`, unless `?prompt=` overrides it.
 * - a new `slabVersion`: rebuild the face (`setSlab(slab, grid)`) and the props, staged
 *   (`startSlab`, then `buildStep` once a frame while `slabHidden`, the rest at once when not).
 * - every frame: `middens.update(openings)` and `middens.show(mode)` (hidden underground; add its mesh
 *   to the scene before warmShaders: it is visible and empty from the start, so its fading program
 *   compiles at load); the worm drawn from `worm` (u, v: the axis height)
 *   and `offW` (off the plane), interpolated from `prevU`, `prevV`, `prevW`; the cut camera from
 *   `camPrev` to `cam`. Coming up, the crawl already lies at the end pose with its camera settled
 *   (`Crawl.reset`), so the swing back ends on it.
 */
export class BurrowGame implements MoveState {
  /** The mode machine (it owns the Action press edge; the moves set its move times). */
  readonly machine = createModeMachine();
  /** Surface, digging down, underground or coming up; the move's clock (read only: the machine owns it). */
  readonly mode = this.machine.state;
  view: UndergroundView;
  slab: Slab | null = null;
  /** Bumped once a new slab's soil, blockers and ways up are ready (a few steps into the dig): rebuild then. */
  slabVersion = 0;
  /** Digs this session (the first visit shows the hint card). */
  visits = 0;
  readonly grid = createSoilGrid();
  readonly solids = createSolids();
  /** Where the worm can come up out of this slab (mapped once per slab). */
  readonly emerge = createEmergeMap();
  /** The worm in the cut: u along it, v the axis height (also posed through the moves). */
  readonly worm = createBurrower();
  /** Each body point's distance off the cut toward the camera's side (0 in it), now and at the last step. */
  readonly offW = new Float64Array(WORM_SEGMENTS);
  readonly prevW = new Float64Array(WORM_SEGMENTS);
  readonly cam = createCutCam();
  /** The cut camera's frame at the last step (the renderer interpolates from it to `cam`). */
  readonly camPrev: CutFrame = { cu: 0, cv: 0, h: 10, pitch: 0.2 };
  readonly frame: CutFrame = { cu: 0, cv: 0, h: 10, pitch: 0.2 };
  /** What the cut camera frames for (followCut fills it; `aspect` is the screen's). */
  private readonly ask: FrameAsk = { hu: 0, hv: 0, au: 0, av: 1, aspect: 16 / 9 };
  readonly openings = createOpenings();
  /** The burrows dug this play with their tunnels (burrows.ts), and which is which (MoveState). */
  readonly burrows = createBurrows();
  burrow = -1; home = -1; reuse = -1; digSign = 1;
  /** Dig down pressed beside an old burrow's cut: the worm crawls onto it first (burrowApproach.ts). */
  readonly approach = createApproach();
  /** The move in progress: the sink or the way up and out (bodyPath.ts). */
  readonly path = createBodyPath();
  /** Coming up: the wave eased to a whole number of waves at rest, as the crawl starts (burrowMoves.ts). */
  readonly waveOut = { from: 0, act: 0, span: 0 };
  /** What Action would do now (the prompt), or null. */
  prompt: ActionKind | null = null;
  /** Width / height of the screen (set on resize): the cut camera frames for it. */
  aspect = 16 / 9;
  /** Near the top where the whole body can lie out on the surface: Action comes up. */
  nearTop = false;
  /** The dig-down's work left (burrowMoves.ts buildStage), one part a step; 0 when none. */
  stage = 0;
  /** Whether the worm may dig where it lies, and into what (digAsk.ts; asked every few steps). */
  private readonly dig = new DigAsk();
  private wasAction = false;
  /** Seconds below on the session's first visit (the hint card's clock). */
  private firstVisitT = 0;
  /** The speed test's own clock for its scripted pointing. */
  private autoT = 0;
  /** The way pointed underground, as stepBurrowing takes it. */
  private readonly way: Pointing = { du: 0, dv: 0 };

  constructor(readonly crawl: Crawl, private readonly host: BurrowHost, view: UndergroundView) {
    this.view = view;
  }

  /**
   * The hint card shows: the session's first visit, for its first HINT_S seconds underground (spec
   * 6), from the end of the camera's swing (never over the surface view or the moves).
   */
  get hintShowing(): boolean {
    return this.visits === 1 && this.firstVisitT < HINT_S && this.mode.mode === 'underground';
  }

  /** Nothing underground can show yet: digging down, the camera still behind the worm (stage work then). */
  get slabHidden(): boolean {
    return this.mode.mode === 'diggingDown' && cameraProgress(this.mode) === 0;
  }

  /** On screen, which way along the cut is "right": +1 when +u, -1 when -u (the camera's side decides). */
  get rightSign(): number {
    const s = this.slab;
    return s ? Math.sign(s.nz * s.tx - s.nx * s.tz) || 1 : 1;
  }

  /**
   * One fixed step. `move`: the stick or arrows (on the surface x turns and y crawls; underground they
   * point the way on screen); `action`: the HELD Action level. `auto` drives the speed test's dig.
   */
  step(dt: number, move: Vec2, action: boolean, auto = false): void {
    const fresh = action && !this.wasAction;
    this.wasAction = action;
    const m = this.mode;
    const reduced = this.host.reducedMotion();
    if (m.mode === 'surface') this.stepSurface(dt, move, action, fresh, reduced);
    else {
      if (m.mode === 'underground') {
        if (this.visits === 1) this.firstVisitT += dt;
        this.stepUnder(dt, move, action, reduced, auto);
      } else stepMove(this, dt, action, reduced);
      // Back up (the move just ended): the crawl takes over, and the dig spot is asked afresh.
      if ((m.mode as Mode) === 'surface') this.dig.ask(this, true);
      else this.frameCut(dt);
    }
    this.prompt = this.approach.burrow >= 0 ? null : promptKind(m, this.dig.canDig, this.nearTop, this.view);
  }

  /**
   * The worm's length, as a share of full length (V4 spec 3: 1, then about 0.8 and 0.6 as robins
   * break it; 1 for a new life). Safe at any moment, on the surface, underground or in a move: the
   * body eases to it (bodyLength.ts). For a new life at full length, set 1 before `crawl.reset()`
   * (the crawl is placed at the length at once).
   */
  setWormLength(f: number): void {
    setBodyLength(f);
  }

  get wormLength(): number {
    return wormBody.factor;
  }

  /** A step that must not act (paused, another screen): Action is still watched, so a held press stays spent. */
  hold(action: boolean): void {
    this.machine.hold(action);
    this.wasAction = action;
  }

  private stepSurface(dt: number, move: Vec2, action: boolean, fresh: boolean, reduced: boolean): void {
    const ap = this.approach;
    if (ap.burrow >= 0) return approachStep(this, ap, this.dig, move, dt, action, reduced);
    // A press acts on what the prompt showed, asked afresh as Action goes down (beside an old
    // burrow's cut, the worm first crawls onto it: burrowApproach.ts).
    const can = this.dig.ask(this, fresh);
    if (fresh && can && this.reuse >= 0 && startApproach(ap, this.reuse, this.burrows.slabs[this.reuse]!, this.crawl.motion)) {
      this.machine.hold(action);
      return;
    }
    if (this.machine.step(action, can, false, reduced, dt) === 'startDig') {
      startDig(this);
      return;
    }
    this.crawl.step(dt, move);
    this.dig.ask(this, false);
  }

  private stepUnder(dt: number, move: Vec2, action: boolean, reduced: boolean, auto: boolean): void {
    const ev = this.machine.step(action, false, this.nearTop, reduced, dt);
    if (ev === 'startUp') {
      startUp(this);
      return;
    }
    if (ev === 'switchView') {
      this.view = this.view === 'wide' ? 'close' : 'wide';
      this.host.saveView(this.view);
    }
    const way = this.way;
    way.du = move.x * this.rightSign;
    way.dv = move.y;
    if (auto) {
      this.autoT += dt;
      way.du = Math.cos(0.37 * this.autoT + 0.5);
      way.dv = Math.sin(0.61 * this.autoT) - 0.15;
    }
    const w = this.worm;
    stepBurrowing(w, this.slab!, this.grid, this.solids, way, dt);
    this.prevW.set(this.offW);
    this.nearTop = w.nearTop && canEmergeAt(this.emerge, w.u[0]);
  }

  /** The cut camera's frame for the current view, eased (it follows the worm through the moves too). */
  private frameCut(dt: number): void {
    const c = this.cam;
    const p = this.camPrev;
    const w = this.worm;
    p.cu = c.cu.value; p.cv = c.cv.value; p.h = c.h.value; p.pitch = c.pitch.value;
    this.ask.aspect = this.aspect;
    followCut(c, this.view, this.slab!, w, this.ask, this.frame, dt);
  }

  /**
   * Underground at once where the worm is: the speed test's dig run. Always in Wide (the default),
   * so the numbers never depend on the view the player picked; that pick stays stored.
   */
  enterNow(): void {
    this.reset();
    this.view = 'wide';
    if (!sinkAtOnce(this)) return;
    this.wasAction = false;
    this.autoT = 0;
  }

  /**
   * Underground at once in "your burrow" (`home`, the one last gone down), its tunnels put back: the
   * start again after the robin (V4 spec 3; burrowHome.ts enterHome). In the player's own view; not
   * a visit (the hint card waits for their own first dig). `action`: the held Action level now, so
   * a press held through it (the grip's Space) is not a new press after.
   */
  enterBurrow(action = false): void {
    this.approach.burrow = -1;
    enterHome(this);
    this.prompt = null;
    this.dig.forget();
    this.autoT = 0;
    this.machine.hold(action);
    this.wasAction = action;
  }

  /** Back on the surface with no openings or burrows (the speed test's fresh start; the crawl's own reset is the caller's). */
  reset(): void {
    this.machine.reset();
    this.stage = 0;
    this.prompt = null;
    this.nearTop = false;
    this.dig.forget();
    this.autoT = 0;
    clearOpenings(this.openings);
    clearBurrows(this.burrows);
    this.burrow = this.home = this.reuse = this.approach.burrow = -1;
  }
}
