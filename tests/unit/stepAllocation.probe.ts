import { BurrowGame } from '../../src/underground/burrowGame';
import { canDigAt } from '../../src/underground/digSpot';
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
const alone = new Crawl();
const crawl = bytesPerCall(() => alone.step(DT, TURNING), 1);

console.log(JSON.stringify({
  underground, canDigAt: dig, surface, crawl,
  modes: [under.mode.mode, top.mode.mode], digs, offered,
}));
