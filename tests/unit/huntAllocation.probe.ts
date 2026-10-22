import { BurrowGame } from '../../src/underground/burrowGame';
import { createHold, holdFromSurface, poseHeld, setBill, snapHeld } from '../../src/underground/burrowGrab';
import { frameHunt } from '../../src/underground/huntFrame';
import { B_TOP, boundaryAt, slabX, slabZ } from '../../src/underground/slab';
import { Crawl } from '../../src/game/crawl';
import { HuntGrab } from '../../src/predators/huntGrab';
import { createGrip, startGrip, stepGrip } from '../../src/predators/grip';
import { Wobble } from '../../src/predators/wobble';

// Run by huntAllocation.test.ts, bundled as the game is and under `node --expose-gc` (as
// stepAllocation.probe.ts): the heap's growth per step of the robin grab's per-step paths, in bytes.

const gc = (globalThis as unknown as { gc?: () => void }).gc!;
if (typeof gc !== 'function') {
  console.log(JSON.stringify({ skipped: 'node did not expose its garbage collector (--expose-gc)' }));
  process.exit(0);
}

const DT = 1 / 60;
const WARM = 20000;

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

// Random numbers from a table made up front, so the probe's own rand makes no garbage.
const TABLE = Float64Array.from({ length: 997 }, () => Math.random());
let k = 0;
const rand = (): number => TABLE[(k = (k + 1) % TABLE.length)];

// The grip alone: taps now and then (in pulls and regrips), a new grab when one ends.
const r = createGrip();
let n = 0;
let calls = 0;
const grip = bytesPerCall(() => {
  if (r.result !== 'none') startGrip(r);
  if (stepGrip(r, DT, ++n % 11 === 0, rand) === 'pull') calls++;
});

// The grab in play: the press edge, the grip and the robin's look.
const grab = new HuntGrab();
grab.start();
let m = 0;
const look = bytesPerCall(() => {
  if (grab.grip.result !== 'none') grab.start();
  grab.step(DT, ++m % 14 < 4, true, rand);
});

// The worm held in the side view: the bill moving up and down, the body along its path, the camera.
const game = new BurrowGame(new Crawl(), { reducedMotion: () => false, saveView: () => {} }, 'wide');
const hold = createHold();
holdFromSurface(game, hold, 1);
const s = game.slab!;
const top = boundaryAt(s, B_TOP, hold.holeU);
snapHeld(game, hold);
let t = 0;
game.robinU = hold.holeU + 2.3;
const bill = { x: slabX(s, hold.holeU + 0.3), y: top, z: slabZ(s, hold.holeU + 0.3) };
const held = bytesPerCall(() => {
  t += DT;
  bill.y = top + 1.2 + Math.sin(t);
  setBill(hold, s, bill);
  poseHeld(game, hold, DT);
  frameHunt(game, DT, false);
});

const wobble = new Wobble();
const shake = bytesPerCall(() => {
  if (!(wobble.t < 0.4)) wobble.kick(false);
  wobble.step(DT);
  wobble.amount();
});

console.log(JSON.stringify({ grip, calls, look, held, shake, mode: game.mode.mode }));
