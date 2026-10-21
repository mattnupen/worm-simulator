import { mulberry32 } from '../core/random';
import type { MeshWriter } from '../surface/meshWriter';
import { lin, loft, mix, ripple, shade, smooth, type Rgb } from './robinGeom';

/**
 * The robin's nest on its sugar maple branch (V4 nest scene), built once at load like the robin.
 * Nest frame, in centimetres: the cup's inner floor at the origin, y up, the trunk behind it on -z
 * (TRUNK_GAP away) and the branch running out along +z. A robin's nest is a cup of dead grass and
 * twigs, made heavy with mud from worm castings (Cornell, All About Birds, "American Robin", Life
 * History: nesting): about 15 to 20 cm across outside and 8 to 10 cm tall, built here at 17 by 9.
 * The nestlings are in nestlingShape.ts. Build-time only.
 */

/** From the trunk's middle to the nest's (cm): a branch long enough that the cup sits out on it. */
export const TRUNK_GAP = 48;
/** The rim's top (the robin perches on it) and its radius at the middle of its thickness. */
export const RIM_Y = 6.2;
export const RIM_R = 6.6;

const STRAW = lin(0xb59a64);
const STRAW_DARK = lin(0x7c6844);
const GRASS_GREY = lin(0x9a9078);
const MUD = lin(0x4f3e2c);
const LINING = lin(0xc2ab78);
const BARK = lin(0x6b5d50);
const BARK_DARK = lin(0x4a3f36);
const MAPLE_LEAVES = [lin(0xd8541f), lin(0xe07a22), lin(0xc23a1c), lin(0xe8a030)];

type V3 = [number, number, number];

/**
 * A round strand along a curve: `at(s)` gives its middle at s (0..1), `r(s)` its radius. Each ring
 * is turned to the curve's direction, so it bends smoothly: a grass stem or a twig.
 */
export function strand(w: MeshWriter, rings: number, sides: number, at: (s: number) => V3, r: (s: number) => number, c: (s: number, a: number) => Rgb): void {
  const t: V3 = [0, 0, 0];
  const u: V3 = [0, 0, 0];
  const v: V3 = [0, 0, 0];
  loft(w, rings, sides, (s, a) => {
    const p = at(s);
    const e = 1 / (rings * 4);
    const p0 = at(Math.max(0, s - e));
    const p1 = at(Math.min(1, s + e));
    unit(t, p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    // Any direction not along the curve, then two at right angles to it.
    const hx = Math.abs(t[1]) < 0.9 ? 0 : 1;
    const hy = 1 - hx;
    unit(u, t[1] * 0 - t[2] * hy, t[2] * hx - t[0] * 0, t[0] * hy - t[1] * hx);
    v[0] = t[1] * u[2] - t[2] * u[1]; v[1] = t[2] * u[0] - t[0] * u[2]; v[2] = t[0] * u[1] - t[1] * u[0];
    const rr = r(s);
    const ca = Math.cos(a) * rr;
    const sa = Math.sin(a) * rr;
    return { x: p[0] + u[0] * ca + v[0] * sa, y: p[1] + u[1] * ca + v[1] * sa, z: p[2] + u[2] * ca + v[2] * sa, c: c(s, a) };
  });
}

function unit(out: V3, x: number, y: number, z: number): void {
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
}

/** The cup's outside radius at height y (cm): a rounded bowl, widest just under the rim. */
function outerR(y: number): number {
  const k = Math.min(1, Math.max(0, (y + 3) / (RIM_Y + 3)));
  return 4.6 + 4.0 * Math.sin(k * Math.PI * 0.62);
}

/** The cup: a woven outside, a mud layer under a rim of grass, and a soft grass lining inside. */
export function writeCup(w: MeshWriter): void {
  // The outside wall, from the base up to the rim, then over the rim and down the inside to the floor.
  loft(w, 30, 56, (s, a) => {
    let x: number, y: number, r: number;
    if (s < 0.55) {
      y = -3 + (s / 0.55) * (RIM_Y + 3);
      r = outerR(y);
    } else if (s < 0.72) {
      // Over the rim: a rounded lip.
      const k = ((s - 0.55) / 0.17) * Math.PI;
      y = RIM_Y + Math.sin(k) * 0.9;
      r = RIM_R + Math.cos(k) * 1.75;
    } else {
      // Down the inside: a deep, round bowl to the floor.
      const k = (s - 0.72) / 0.28;
      y = RIM_Y * Math.cos(k * Math.PI * 0.5);
      r = 4.85 * Math.sin((1 - k) * Math.PI * 0.5) + 0.01;
    }
    // Lumpy and uneven, as a nest is.
    const lump = 1 + 0.035 * Math.sin(a * 5 + y * 0.9) + 0.025 * Math.sin(a * 11 - y * 1.7);
    r *= lump;
    x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    let c: Rgb;
    if (s < 0.55) {
      // Diagonal grass bands, light and dark, and grey weathered stems.
      const band = Math.sin(a * 9 + y * 1.3) * 0.5 + 0.5;
      c = mix(STRAW_DARK, STRAW, smooth(0.25, 0.85, band + 0.25 * ripple(a * 3, y)));
      c = mix(c, GRASS_GREY, smooth(0.6, 0.95, ripple(a * 7 + 1, y * 0.5)) * 0.6);
      // Darker toward the base, where the mud shows through.
      c = mix(c, MUD, smooth(0.5, -2.5, y) * 0.55);
    } else if (s < 0.72) {
      c = mix(STRAW, LINING, 0.4 + 0.3 * ripple(a * 13, s * 20));
    } else {
      // Fine dry grass lining, darker deep in the cup.
      c = mix(LINING, STRAW_DARK, smooth(0.8, 1.0, s) * 0.6 + 0.2 * ripple(a * 17, s * 31));
    }
    return { x, y, z, c: shade(c, 1 + 0.08 * ripple(a * 23, y * 3)) };
  });
  // The base, closed underneath.
  loft(w, 4, 28, (s, a) => {
    const r = outerR(-3) * (1 - s);
    return { x: Math.sin(a) * r, y: -3 - 0.8 * s * (1 - s) * 4, z: Math.cos(a) * r, c: mix(MUD, STRAW_DARK, 0.4) };
  });
  writeLooseGrass(w);
}

/** Loose stems wrapped round the outside and a few hanging free: the woven look up close. */
function writeLooseGrass(w: MeshWriter): void {
  const rng = mulberry32(31);
  for (let i = 0; i < 46; i++) {
    const a0 = rng() * Math.PI * 2;
    const span = 0.6 + rng() * 1.3;
    const y0 = -2.2 + rng() * (RIM_Y + 2.2);
    const tilt = (rng() - 0.5) * 1.6;
    const lift = 0.15 + rng() * 0.25;
    const c = rng() < 0.3 ? GRASS_GREY : rng() < 0.5 ? STRAW_DARK : STRAW;
    strand(w, 10, 3, (s) => {
      const a = a0 + span * s;
      const y = Math.min(RIM_Y + 0.6, y0 + tilt * span * (s - 0.5) * 2);
      const r = (y > RIM_Y - 0.3 ? RIM_R + 1.6 : outerR(y)) + lift;
      return [Math.sin(a) * r, y, Math.cos(a) * r];
    }, () => 0.09, () => c);
  }
  // A few long stems trailing down from under the cup.
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2;
    const len = 4 + rng() * 6;
    const bend = (rng() - 0.5) * 3;
    strand(w, 8, 3, (s) => {
      const r = outerR(-1.5) * (1 - 0.3 * s) + 0.2;
      return [Math.sin(a) * r + bend * s * s, -1.5 - len * s, Math.cos(a) * r + bend * 0.5 * s];
    }, (s) => 0.1 * (1 - 0.6 * s), () => GRASS_GREY);
  }
}

/**
 * The maple branch the cup sits in: a limb from inside the trunk out along +z under the nest, a
 * fork rising past the cup's side (nests are often wedged in a fork), and thin twigs with a few
 * fall sugar maple leaves beyond.
 */
export function writeBranch(w: MeshWriter): void {
  const barkC = (s: number, a: number): Rgb => shade(mix(BARK, BARK_DARK, smooth(0.2, -0.9, Math.cos(a)) * 0.6), 1 + 0.1 * ripple(s * 40, a * 3));
  // The limb: thick at the trunk, rising a little and thinning out past the nest.
  const limb = (s: number): V3 => [0.6 * Math.sin(s * 3), -4.8 + 3.0 * s - 2.0 * s * s, -TRUNK_GAP + s * (TRUNK_GAP + 34)];
  strand(w, 30, 12, limb, (s) => 3.6 - 2.6 * s, barkC);
  // The fork: from the limb behind the nest, up past the cup's right side (-x: the camera is on +x).
  strand(w, 16, 9, (s) => [-5.2 * Math.sin(s * 1.6) - 2 * s, -4.4 + 13 * s, -14 + 22 * s], (s) => 1.6 - 1.0 * s, barkC);
  // A thinner twig on the same side, behind the cup.
  strand(w, 12, 7, (s) => [-6 * s - 1.5 * s * s, -4.2 + 9 * s, -9 + 6 * s], (s) => 1.0 - 0.65 * s, barkC);
  const leaves: [V3, number, number][] = [
    // Where the twig ends, which way the leaf points (yaw), and its tilt.
    [[-8.6, 8.6, 8.0], -0.5, 0.5],
    [[-7.0, 9.5, 10.5], -1.4, 0.8],
    [[-8.2, 4.8, -3.0], -1.1, 0.45],
    [[1.2, -1.0, 34], 0.1, 0.25],
    [[-2.5, -0.6, 32], -0.9, 0.6],
    [[3.6, 0.4, 30.5], 0.9, 0.9],
  ];
  leaves.forEach(([p, yaw, tilt], i) => {
    writeMapleLeaf(w, p, yaw, tilt, 6.5 + (i % 3) * 1.2, MAPLE_LEAVES[i % MAPLE_LEAVES.length]);
  });
}

/**
 * A sugar maple leaf in fall colour (five rounded lobes, about 11 cm across, real size like the
 * litter's maple leaves) on its stalk, starting at `p` and pointing out along `yaw`, tipped up by
 * `tilt`. Shaded as a thin plant: the sun glows through it.
 */
function writeMapleLeaf(w: MeshWriter, p: V3, yaw: number, tilt: number, size: number, c: Rgb): void {
  const dx = Math.sin(yaw);
  const dz = Math.cos(yaw);
  const stalk = 3;
  const base: V3 = [p[0] + dx * stalk, p[1] + stalk * 0.3, p[2] + dz * stalk];
  strand(w, 4, 3, (s) => [p[0] + dx * stalk * s, p[1] + stalk * 0.3 * s, p[2] + dz * stalk * s], () => 0.12, () => BARK);
  const first = w.vertexCount;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  loft(w, 6, 40, (s, v) => {
    // Five lobes over the upper side, with notches between them; the base is rounded.
    const ang = (v - 0.5) * Math.PI * 1.9;
    const lobes = 0.62 + 0.38 * Math.pow(Math.abs(Math.cos(ang * 2.5)), 0.7);
    const r = size * 0.55 * s * lobes;
    // Along the leaf (its midrib) and across it, then a gentle droop at the edge.
    const along = Math.cos(ang) * r;
    const across = Math.sin(ang) * r;
    const droop = -0.08 * r * r / size;
    const lx = along * ct - droop * st;
    const ly = along * st + droop * ct;
    const col = shade(mix(c, MAPLE_LEAVES[3], 0.25 * ripple(s * 5, v * 9) + 0.15), 1 + 0.08 * ripple(s * 11, v * 13));
    return {
      x: base[0] + dx * lx + dz * across,
      y: base[1] + ly,
      z: base[2] + dz * lx - dx * across,
      c: s < 0.08 ? BARK : col,
    };
  }, false);
  // Surface code 2 (a plant: light glows through it), with its strength.
  for (let i = first; i < w.vertexCount; i++) w.extra[i * 4 + 3] = 2.6;
}
