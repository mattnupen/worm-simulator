import { BurrowGame } from '../../src/underground/burrowGame';
import { canDigAt } from '../../src/underground/digSpot';
import { Mounds } from '../../src/underground/mounds';
import { setWormRise, wormSurface } from '../../src/worm/surfaceHeight';
import { stepBurrowing, type Pointing } from '../../src/underground/burrowMotion';
import { Crawl } from '../../src/game/crawl';
import type { Vec2, Vec3 } from '../../src/core/vec';

// Run by stepAllocation.test.ts, bundled as the game is and under `node --expose-gc`: the heap's
// growth per step of each per-step path, in bytes, printed as JSON. (V8 boxes a number on the heap
// wherever one crosses a call it does not inline, and how far it inlines depends on the bundle: so
// this measures the bundle, not vitest's module runner.)

const gc = (globalThis as unknown as { gc?: () => void }).gc!;
if (typeof gc !== 'function') {
  console.log(JSON.stringify({ skipped: 'node did not expose its garbage collector (--expose-gc)' }));
  process.exit(0);
}

const DT = 1 / 60;
const STILL: Vec2 = { x: 0, y: 0 };
const TURNING: Vec2 = { x: 0.3, y: 1 };
/** Warm-up calls: V8's optimizing compiler takes over in the background some thousands in. */
const WARM = 20000;

/**
 * Bytes the heap grows per call of `fn` (less an empty call's), over 5000 calls in chunks of 100,
 * each after a collection: the median chunk. After the warm-up it measures up to `tries` times
 * and keeps the least (the compiler may still be finishing).
 */
function bytesPerCall(fn: () => void, tries = 4): number {
  const chunk = 100;
  const median = (f: () => void): number => {
    const per: number[] = [];
    for (let c = 0; c < 50; c++) {
      gc();
      const before = process.memoryUsage().heapUsed;
      for (let i = 0; i < chunk; i++) f();
      per.push((process.memoryUsage().heapUsed - before) / chunk);
    }
    per.sort((a, b) => a - b);
    return per[per.length >> 1];
  };
  const empty = (): void => {};
  for (let i = 0; i < WARM; i++) fn();
  let least = Infinity;
  for (let k = 0; k < tries && least > 0; k++) least = Math.min(least, median(fn) - median(empty));
  return least;
}

const game = (): BurrowGame => new BurrowGame(new Crawl(), { reducedMotion: () => false, saveView: () => {} }, 'wide');

// Underground: the speed test's scripted dig (the worm, its tunnel and castings, the cut camera, the prompt).
const under = game();
under.enterNow();
const underground = bytesPerCall(() => under.step(DT, STILL, false, true));

// Backing up (burrowBack.ts): a worm that dug about a while backs along its trail (bodyTrail.ts
// backAlong), the stick pointing back along its body. Each time its tail reaches the trail's start
// (backing ends) it takes one step forward (the trail cut at the head's place: bodyTrail.ts
// followHead), then is put back where it began: only typed arrays are copied, which allocates nothing.
const rev = game();
rev.enterNow();
for (let i = 0; i < 3000; i++) rev.step(DT, STILL, false, true);
const w = rev.worm;
const tr = w.trail;
const kept = {
  u: Float64Array.from(w.u), v: Float64Array.from(w.v), tu: Float64Array.from(tr.u), tv: Float64Array.from(tr.v),
  arc: Float64Array.from(tr.arc), at: Float64Array.from(tr.at), len: Float64Array.from(tr.len), n: tr.n, dir: w.dir,
};
const backWay: Pointing = { du: 0.5, dv: 0.5 };
const onWay: Pointing = { du: 0.5, dv: 0.5 };
let backs = 0;
let cuts = 0;
const backing = bytesPerCall(() => {
  if (!w.backing) {
    backs++;
    if (tr.backed) {
      onWay.du = Math.cos(w.dir);
      onWay.dv = Math.sin(w.dir);
      stepBurrowing(w, rev.slab!, rev.grid, rev.solids, onWay, DT);
      if (!tr.backed) cuts++;
    }
    w.u.set(kept.u); w.v.set(kept.v); w.prevU.set(kept.u); w.prevV.set(kept.v);
    tr.u.set(kept.tu); tr.v.set(kept.tv); tr.arc.set(kept.arc); tr.at.set(kept.at); tr.len.set(kept.len);
    tr.n = kept.n;
    tr.backed = false;
    w.dir = w.prevDir = kept.dir;
    w.speed = w.want = 0;
    w.backing = true;
    w.backSpent = false;
  }
  const du = w.u[2] - w.u[0];
  const dv = w.v[2] - w.v[0];
  const l = Math.sqrt(du * du + dv * dv) || 1;
  backWay.du = du / l;
  backWay.dv = dv / l;
  stepBurrowing(w, rev.slab!, rev.grid, rev.solids, backWay, DT);
});

// canDigAt over bodies as the crawl leaves them, turning as it goes.
const c = new Crawl();
const spots: { x: number; z: number; heading: number; body: Vec3[] }[] = [];
for (let i = 0; i < 3000; i++) {
  c.step(DT, { x: 0.6 * Math.sin(i * 0.01), y: 1 });
  if (i % 5 === 0) spots.push({ x: c.motion.head.x, z: c.motion.head.z, heading: c.motion.heading, body: c.body.map((p) => ({ ...p })) });
}
let k = 0;
let digs = 0;
const dig = bytesPerCall(() => {
  const s = spots[k++ % spots.length];
  if (canDigAt(s.x, s.z, s.heading, s.body)) digs++;
});

// The surface: what the game adds to the crawl (the mode machine, the dig spot it asks every few
// steps, the prompt), over a crawl replayed from a recording; and the crawl's own step.
class Replayed extends Crawl {
  override step(): void {}
}
const REC = 2048;
const N = c.body.length;
const rec = new Crawl();
const heads = new Float64Array(REC * 3);
const bodies = new Float64Array(REC * N * 3);
for (let j = 0; j < REC; j++) {
  rec.step(DT, TURNING);
  heads[j * 3] = rec.motion.head.x;
  heads[j * 3 + 1] = rec.motion.head.z;
  heads[j * 3 + 2] = rec.motion.heading;
  for (let i = 0; i < N; i++) {
    bodies[(j * N + i) * 3] = rec.body[i].x;
    bodies[(j * N + i) * 3 + 1] = rec.body[i].y;
    bodies[(j * N + i) * 3 + 2] = rec.body[i].z;
  }
}
const replayed = new Replayed();
let at = 0;
const replay = (): void => {
  const j = at++ % REC;
  replayed.motion.head.x = heads[j * 3];
  replayed.motion.head.z = heads[j * 3 + 1];
  replayed.motion.heading = heads[j * 3 + 2];
  for (let i = 0; i < N; i++) {
    const p = replayed.body[i];
    p.x = bodies[(j * N + i) * 3];
    p.y = bodies[(j * N + i) * 3 + 1];
    p.z = bodies[(j * N + i) * 3 + 2];
  }
};
const top = new BurrowGame(replayed, { reducedMotion: () => false, saveView: () => {} }, 'wide');
let offered = 0;
const surface = bytesPerCall(() => {
  replay();
  top.step(DT, TURNING, false);
  if (top.prompt === 'digDown') offered++;
}) - bytesPerCall(replay);
// The casting mounds (mounds.ts) over the same crawl: the worm's surface with their lift at every
// body point, and the check against the openings (one opening on a mound, its version bumped now
// and then so the check runs).
const mounds = new Mounds();
const moundOpenings = new BurrowGame(new Crawl(), { reducedMotion: () => false, saveView: () => {} }, 'wide').openings;
moundOpenings.data.set([mounds.x[0], 0, mounds.z[0], 0]);
moundOpenings.count = 1;
const surf = { y: 0 };
let rode = 0;
let calls = 0;
/** The worm's surface at every body point, as the crawl asks it, and the openings check. */
const overMounds = (): void => {
  replay();
  for (let i = 0; i < N; i++) {
    const p = replayed.body[i];
    if (wormSurface(p.x, p.z, surf).y > p.y + 0.05) rode++;
  }
  if (++calls % 50 === 0) moundOpenings.version++;
  mounds.sync(moundOpenings);
};
/** The same, every body point drawn in onto mound 1 (all of the worm on its castings). */
const onMound = (): void => {
  replay();
  for (let i = 0; i < N; i++) {
    const p = replayed.body[i];
    if (wormSurface(mounds.x[1] + p.x * 0.03, mounds.z[1] + p.z * 0.03, surf).y > p.y + 0.05) rode++;
  }
};
// What the mounds add: the same calls with no mounds set are the baseline.
const noMounds = bytesPerCall(overMounds);
const noMound = bytesPerCall(onMound);
setWormRise(mounds);
const marks = Math.max(bytesPerCall(overMounds) - noMounds, bytesPerCall(onMound) - noMound);
// The lift was really looked up (the replayed crawl may pass no mound): a mound's centre.
if (mounds.rise(mounds.x[1], mounds.z[1]) > 0) rode++;
setWormRise(null);
const marked = rode;
const alone = new Crawl();
const crawl = bytesPerCall(() => alone.step(DT, TURNING), 1);

console.log(JSON.stringify({
  underground, backing, backs, cuts, canDigAt: dig, surface, marks, marked, crawl,
  modes: [under.mode.mode, top.mode.mode], digs, offered,
}));
