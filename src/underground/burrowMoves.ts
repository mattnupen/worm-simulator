import { hypot3, hypot2, vec3s } from '../core/vec';
import { WORM_SEGMENTS, type Crawl } from '../game/crawl';
import { advanceWave } from '../worm/wormShape';
import { slabX, slabZ, type Slab } from './slab';
import { digDiscAt, fillSoilGrid, type Eaten, type SoilGrid } from './soilGrid';
import { markSolids, placeSolids, type Solids } from './solids';
import { placeBurrower, BREATH_HZ, TUNNEL_R, WAVES_PER_UNIT, type Burrower } from './burrowMotion';
import { poseAt, smootherstep, wrap, AXIS_UP, type BodyPath } from './bodyPath';
import { buildSink } from './sinkPath';
import { buildEmerge } from './emergePath';
import { mapEmerge, type EmergeMap } from './emergeMap';
import { bodyProgress, DIP_IN, type ModeMachine, type ModeState, type UndergroundView } from './modeMachine';
import { frameTarget, snapCutCam, type CutCam, type CutFrame } from './cutCamera';
import { addOpening, type Openings } from './openings';
import { restoreBurrow, saveBurrow, type Burrows } from './burrows';
import { slabForDig } from './burrowReuse';

/**
 * The game's moves (V2 spec 4.1, 4.2): digging down (a new slab through the head, along the cut
 * digSpot.ts chooses, or an old burrow's slab with its tunnels put back (V4 spec 4.1: burrows.ts),
 * its work spread over the first steps) and coming up (the crawl moved to the end pose at once,
 * the burrow's tunnels kept as the worm comes out). Between them the worm is posed along the move's path (bodyPath.ts) every step.
 * Allocates only once per dig and once per coming up.
 */
const N = WORM_SEGMENTS;
/** A body point this close to the cut's plane (u) is in it: it opens the tunnel as it sinks. */
const IN_PLANE = 0.05;
/** The neck's direction is trusted from this length in the plane (a body square to the cut has none). */
const NECK_SEEN = 0.1;
/** Coming up, the peristalsis runs up to about this activity mid-move (crawling out). */
const OUT_ACTIVITY = 0.8;

/** What the moves read and write: BurrowGame's state. */
export interface MoveState {
  readonly machine: ModeMachine;
  readonly mode: ModeState;
  readonly crawl: Crawl;
  slab: Slab | null;
  slabVersion: number;
  visits: number;
  readonly grid: SoilGrid;
  readonly solids: Solids;
  readonly emerge: EmergeMap;
  readonly worm: Burrower;
  readonly offW: Float64Array;
  readonly prevW: Float64Array;
  readonly cam: CutCam;
  readonly camPrev: CutFrame;
  readonly frame: CutFrame;
  readonly openings: Openings;
  /** The burrows dug this play; the one the worm is in (or last was), -1 none; "your burrow" (the last gone down). */
  readonly burrows: Burrows;
  burrow: number;
  home: number;
  /** The burrow the next dig goes back into (the dig spot found it, burrowReuse.ts), or -1: a new one. */
  reuse: number;
  /** The way along u the head dives going down (sinkPath.ts buildSink's `sign`). */
  digSign: number;
  readonly path: BodyPath;
  /** Coming up: the wave's phase and activity at the start, and the phase it gains (to a whole number of waves). */
  readonly waveOut: { from: number; act: number; span: number };
  view: UndergroundView;
  aspect: number;
  nearTop: boolean;
  stage: number;
}

const us = new Float64Array(N);
const vs = new Float64Array(N);
const ws = new Float64Array(N);
const endBody = vec3s(N);
const ate: Eaten = { cells: 0, organic: 0 };
const pt = { u: 0, v: 0 };
/** Opens the tunnel at body point `i` (its point goes in an object: no number crosses the call to box). */
function digPoint(grid: SoilGrid, w: Burrower, i: number): void {
  pt.u = w.u[i];
  pt.v = w.v[i];
  digDiscAt(grid, pt, TUNNEL_R, ate);
}

/** The head's way in the plane from the neck (unwrapped from `was`), or `was` where the neck lies across the cut. */
function neckDir(w: Burrower, was: number): number {
  const du = w.u[0] - w.u[1];
  const dv = w.v[0] - w.v[1];
  return hypot2(du, dv) > NECK_SEEN ? was + wrap(Math.atan2(dv, du) - was) : was;
}

/** The cut camera at once on its frame for the worm as it lies (and the last step's frame the same). */
function snapCam(g: MoveState): void {
  const w = g.worm;
  frameTarget(g.view, g.slab!, w.u[0], w.v[0], Math.cos(w.dir), Math.sin(w.dir), g.aspect, g.frame, w);
  snapCutCam(g.cam, g.frame, w.dir, g.view);
  const p = g.camPrev;
  p.cu = g.cam.cu.value; p.cv = g.cam.cv.value; p.h = g.cam.h.value; p.pitch = g.cam.pitch.value;
}

/**
 * Action on the surface where the worm may dig: a new slab through the head along `cutHeading`
 * (never the raw heading), the camera on `chooseSide`'s side, seeded by the spot; or, back at an
 * old burrow (`reuse`), that burrow's own slab, the camera on its side as before. The worm in the
 * cut starts as the crawl lies, exactly (frame 0 of the sink). The rest of the work (the sink path,
 * the soil, the blockers, the old tunnels, the ways up) follows one part a step (`buildStage`).
 */
export function startDig(g: MoveState): void {
  const c = g.crawl;
  const s = slabForDig(g);
  g.slab = s;
  g.visits++;
  for (let i = 0; i < N; i++) {
    const x = c.body[i].x - s.ox;
    const z = c.body[i].z - s.oz;
    us[i] = x * s.tx + z * s.tz;
    vs[i] = c.body[i].y + AXIS_UP;
    ws[i] = x * s.nx + z * s.nz;
  }
  const w = g.worm;
  placeBurrower(w, us, vs, 0, c.wave);
  // Facing -u (mirrored), unwrapped from -PI: its dive turns down to -PI/2, as the burrower takes it.
  w.dir = w.prevDir = neckDir(w, g.digSign > 0 ? 0 : -Math.PI);
  g.offW.set(ws);
  g.prevW.set(ws);
  g.nearTop = false;
  g.stage = 1;
  snapCam(g);
}

/**
 * The dig-down's next part (one a step, while the camera still holds behind the worm): the sink
 * path (and the move's length), the soil, the blockers and an old burrow's tunnels (burrows.ts
 * restoreBurrow), then the ways up, when the slab is ready
 * (`slabVersion` bumped: the renderer rebuilds then).
 */
export function buildStage(g: MoveState): void {
  const s = g.slab!;
  switch (g.stage) {
    case 1:
      buildSink(g.path, s, g.crawl.body, g.digSign);
      g.machine.setMoveTime(g.path.seconds);
      break;
    case 2:
      fillSoilGrid(g.grid, s);
      break;
    case 3:
      placeSolids(s, g.solids);
      markSolids(g.grid, g.solids);
      restoreBurrow(g.burrows, g.burrow, g.grid);
      break;
    default:
      mapEmerge(g.emerge, s);
      g.slabVersion++;
      g.stage = 0;
      return;
  }
  g.stage++;
}

/** Keeps this step's pose as the last step's (the renderer interpolates from it). */
function keepPrev(g: MoveState): void {
  const w = g.worm;
  w.prevU.set(w.u);
  w.prevV.set(w.v);
  g.prevW.set(g.offW);
  w.prevDir = w.dir;
  w.prevWave.phase = w.wave.phase;
  w.prevWave.activity = w.wave.activity;
}

/**
 * One step of digging down or coming up: the worm along the move's path; the machine times it.
 * With reduced motion the worm cuts to the move's end in the dark (modeMachine.ts), and going down
 * the cut camera is put on it at once there (nothing slides in as the dip clears).
 */
export function stepMove(g: MoveState, dt: number, action: boolean, reduced: boolean): void {
  const down = g.mode.mode === 'diggingDown';
  const cut = g.mode.reduced && g.mode.t < DIP_IN;
  const ev = g.machine.step(action, false, false, reduced, dt);
  if (down && g.stage) buildStage(g);
  while (ev === 'arrive' && g.stage) buildStage(g);
  const w = g.worm;
  keepPrev(g);
  const hu = w.u[0];
  const hv = w.v[0];
  const hw = g.offW[0];
  // The step that ends the move poses its last frame (the machine has already left the move).
  const t = ev === 'none' ? bodyProgress(g.mode) : 1;
  poseAt(g.path, t, w.u, w.v, g.offW);
  w.dir = neckDir(w, w.dir);
  if (down) {
    advanceWave(w.wave, hypot3(w.u[0] - hu, w.v[0] - hv, g.offW[0] - hw), dt, 1, WAVES_PER_UNIT, BREATH_HZ);
    if (!g.stage) {
      for (let i = 0; i < N; i++) if (Math.abs(g.offW[i]) < IN_PLANE) digPoint(g.grid, w, i);
    }
    if (ev === 'arrive') arriveBelow(g, false);
    else if (cut && g.mode.t >= DIP_IN) snapCam(g);
    return;
  }
  const out = g.waveOut;
  const e = smootherstep(t);
  w.wave.phase = out.from + out.span * e;
  w.wave.activity = out.act * (1 - e) + OUT_ACTIVITY * Math.sin(Math.PI * t) ** 2;
  for (let i = 0; i < 4; i++) digPoint(g.grid, w, i);
  if (ev === 'emerge') {
    saveBurrow(g.burrows, g.burrow, g.grid);
    addOpening(g.openings, g.path, g.slab!, g.burrow);
  }
}

/**
 * Sunk: the burrower takes over from the sink's last pose, facing straight down, its tunnel open.
 * `snap` (the speed test's start): posed there at once, the camera framed at once.
 */
export function arriveBelow(g: MoveState, snap: boolean): void {
  const w = g.worm;
  if (snap) poseAt(g.path, 1, w.u, w.v, g.offW);
  us.set(w.prevU);
  vs.set(w.prevV);
  const dir = w.prevDir;
  const phase = w.prevWave.phase;
  const act = w.prevWave.activity;
  placeBurrower(w, w.u, w.v, -Math.PI / 2, w.wave);
  g.offW.fill(0);
  for (let i = 0; i < N; i++) digPoint(g.grid, w, i);
  if (snap) {
    g.prevW.fill(0);
    snapCam(g);
    return;
  }
  // This step still moved from the last pose: the renderer interpolates from there.
  w.prevU.set(us);
  w.prevV.set(vs);
  w.prevDir = dir;
  w.prevWave.phase = phase;
  w.prevWave.activity = act;
}

/**
 * Action near the top where the body can lie out: the path up and out along the cut, and the crawl
 * moved at once to where the worm will lie (its camera settled behind it), so the camera's swing
 * back ends exactly on the follow camera the crawl then steps from. The worm holds still this step.
 */
export function startUp(g: MoveState): void {
  const s = g.slab!;
  const w = g.worm;
  const p = g.path;
  keepPrev(g);
  g.offW.fill(0);
  g.prevW.fill(0);
  buildEmerge(p, s, g.emerge, w.u, w.v, w.dir);
  g.machine.setMoveTime(p.seconds);
  poseAt(p, 1, us, vs, ws);
  for (let i = 0; i < N; i++) {
    endBody[i].x = slabX(s, us[i]) + s.nx * ws[i];
    endBody[i].y = vs[i] - AXIS_UP;
    endBody[i].z = slabZ(s, us[i]) + s.nz * ws[i];
  }
  const sign = p.exitSign;
  g.crawl.reset(g.crawl.hero.count, endBody, Math.atan2(sign * s.tx, sign * s.tz));
  // The wave ends a whole number of waves on and at rest, as the crawl starts again (Crawl.reset).
  const out = g.waveOut;
  out.from = w.wave.phase;
  out.act = w.wave.activity;
  out.span = Math.ceil(out.from + (p.headTo - p.headFrom) * WAVES_PER_UNIT) - out.from;
  g.nearTop = false;
}
