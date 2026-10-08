import type { Vec2 } from '../core/vec';
import type { Crawl } from '../game/crawl';
import type { ActionKind } from '../ui/actionPrompt';
import type { Slab } from './slab';
import { createSoilGrid } from './soilGrid';
import { createSolids } from './solids';
import { canDigAt } from './digSpot';
import { createBurrower, stepBurrower } from './burrowMotion';
import { canEmergeAt, createEmergeMap } from './emergeMap';
import { createBodyPath } from './bodyPath';
import { createModeMachine, cameraProgress, promptKind, type Mode, type UndergroundView } from './modeMachine';
import { createCutCam, frameTarget, stepCutCam, stepCutFacing, type CutFrame } from './cutCamera';
import { clearOpenings, createOpenings } from './openings';
import { arriveBelow, buildStage, startDig, startUp, stepMove, type MoveState } from './burrowMoves';

/** What the game asks of the page. */
export interface BurrowHost {
  /** prefers-reduced-motion, read as each move starts. */
  reducedMotion(): boolean;
  /** The player switched the underground view: store it (the V1 save rule: stored only when picked). */
  saveView(v: UndergroundView): void;
}

/** The first visit's hint card shows for this long underground (then the cut is left clear). */
export const HINT_S = 12;
/**
 * canDigAt (up to about 160 us) is asked again only once the head has moved this far or turned
 * this much since it was last asked, or as Action goes down (a press acts on a fresh answer).
 */
export const DIG_RECHECK = 0.05;
export const DIG_RETURN = (2 * Math.PI) / 180;
const wrap = (a: number): number => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

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
  readonly offW = new Float64Array(16);
  readonly prevW = new Float64Array(16);
  readonly cam = createCutCam();
  /** The cut camera's frame at the last step (the renderer interpolates from it to `cam`). */
  readonly camPrev: CutFrame = { cu: 0, cv: 0, h: 10, pitch: 0.2 };
  readonly frame: CutFrame = { cu: 0, cv: 0, h: 10, pitch: 0.2 };
  readonly openings = createOpenings();
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
  private canDig = false;
  private digX = NaN;
  private digZ = NaN;
  private digH = NaN;
  private wasAction = false;
  /** Seconds below on the session's first visit (the hint card's clock). */
  private firstVisitT = 0;
  /** The speed test's own clock for its scripted pointing. */
  private autoT = 0;

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
      if ((m.mode as Mode) === 'surface') this.digSpot(true);
      else this.frameCut(dt);
    }
    this.prompt = promptKind(m, this.canDig, this.nearTop, this.view);
  }

  /** A step that must not act (paused, another screen): Action is still watched, so a held press stays spent. */
  hold(action: boolean): void {
    this.machine.hold(action);
    this.wasAction = action;
  }

  private stepSurface(dt: number, move: Vec2, action: boolean, fresh: boolean, reduced: boolean): void {
    // A press acts on what the prompt showed, asked afresh as Action goes down.
    if (this.machine.step(action, this.digSpot(fresh), false, reduced, dt) === 'startDig') {
      startDig(this);
      return;
    }
    this.crawl.step(dt, move);
    this.digSpot(false);
  }

  /** Whether the worm may dig here (canDigAt), asked again only when the head has moved or turned enough. */
  private digSpot(force: boolean): boolean {
    const c = this.crawl;
    const h = c.motion.head;
    const a = c.motion.heading;
    if (force || !(Math.hypot(h.x - this.digX, h.z - this.digZ) <= DIG_RECHECK) || Math.abs(wrap(a - this.digH)) > DIG_RETURN) {
      this.canDig = canDigAt(h.x, h.z, a, c.body);
      this.digX = h.x;
      this.digZ = h.z;
      this.digH = a;
    }
    return this.canDig;
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
    let du = move.x * this.rightSign;
    let dv = move.y;
    if (auto) {
      this.autoT += dt;
      du = Math.cos(0.37 * this.autoT + 0.5);
      dv = Math.sin(0.61 * this.autoT) - 0.15;
    }
    const w = this.worm;
    stepBurrower(w, this.slab!, this.grid, this.solids, du, dv, dt);
    this.prevW.set(this.offW);
    this.nearTop = w.nearTop && canEmergeAt(this.emerge, w.u[0]);
  }

  /** The cut camera's frame for the current view, eased (it follows the worm through the moves too). */
  private frameCut(dt: number): void {
    const c = this.cam;
    const p = this.camPrev;
    const w = this.worm;
    p.cu = c.cu.value; p.cv = c.cv.value; p.h = c.h.value; p.pitch = c.pitch.value;
    stepCutFacing(c, w.dir, dt);
    frameTarget(this.view, this.slab!, w.u[0], w.v[0], c.au.value, c.av.value, this.aspect, this.frame, w);
    stepCutCam(c, this.frame, this.view, dt);
  }

  /** Underground at once where the worm is, in the current view: the speed test's dig run. */
  enterNow(): void {
    this.reset();
    const m = this.machine;
    m.hold(false);
    if (m.step(true, true, false, true, 0) !== 'startDig') return;
    startDig(this);
    this.visits--; // not the player's visit: their first still shows the hint card
    while (this.stage) buildStage(this);
    m.step(false, false, false, true, 1e6);
    arriveBelow(this, true);
    this.wasAction = false;
    this.autoT = 0;
  }

  /** Back on the surface with no openings (the speed test's fresh start; the crawl's own reset is the caller's). */
  reset(): void {
    this.machine.reset();
    this.stage = 0;
    this.prompt = null;
    this.nearTop = false;
    this.digX = NaN;
    this.autoT = 0;
    clearOpenings(this.openings);
  }
}
