import * as THREE from 'three';
import { valueNoise2 } from '../core/noise';
import { mulberry32 } from '../core/random';
import { band, blendChannel, createCanvas, crumb, fill, lens, smooth, thread, toBytes, type Canvas, type Rgb } from './soilPaint';

/**
 * The layers' patterns (V2 spec 5.3: pattern, not only colour), painted once at load into small
 * tiling textures with mipmaps, so the cut face reads one texel per pixel instead of computing
 * patterns (measured: computed patterns halved the frame rate in software GL). 128 texels per
 * unit; every tile wraps at its edges, so it repeats seamlessly.
 *  - litter, L (4 u x 2 u): this fall's leaves edge-on (red, orange, yellow, green, bleached tan,
 *    brown), some cut at a slant, twigs, grass and needles, dark air gaps between (rgb); and
 *    humus, H (a): black crumbs, dense fine roots, a few hyphae, as a value the face colours.
 *  - old leaves, F (4 u x 2 u): dark matted fragments, white hyphae, pale fine roots (rgb); moss
 *    stems (a), which the face shows at F's top.
 *  - grain (2 u x 2 u): sand grain (r), mottles (g), pebbles (b: 0 none, else lit 0.3..1),
 *    platy streaks (a). The face colours A, E and B from it, each using it its own way.
 */
export const TEXELS_PER_U = 128;
export const LITTER_TILE_U = [4, 2] as const;
export const SOIL_TILE_U = 2;
/** F is wider, so its root mats and hyphae patches do not visibly repeat across the face. */
export const OLD_TILE_U = [4, 2] as const;
const T = TEXELS_PER_U;

/** Periodic value noise over a canvas, `f` cells per unit (texel coordinates in). */
const vn = (c: Canvas, x: number, y: number, f: number, seed: number, fy = f): number =>
  valueNoise2((x / T) * f, (y / T) * fy, seed, Math.round((c.w / T) * f), Math.round((c.h / T) * fy));

/** This fall's leaves (sugar maple, aspen, basswood, oak) and last year's, by share. */
const LEAVES: readonly [number, Rgb][] = [
  [0.13, [0.64, 0.14, 0.06]], [0.05, [0.48, 0.08, 0.07]], [0.15, [0.84, 0.38, 0.08]], [0.08, [0.86, 0.56, 0.14]],
  [0.14, [0.88, 0.72, 0.22]], [0.05, [0.44, 0.52, 0.17]], [0.2, [0.78, 0.68, 0.5]], [0.2, [0.5, 0.32, 0.16]],
];
function leafColour(rand: () => number): Rgb {
  let k = rand();
  for (const [share, col] of LEAVES) {
    if ((k -= share) < 0) return col;
  }
  return LEAVES[LEAVES.length - 1][1];
}
const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

function paintLitter(): Canvas {
  const c = createCanvas(LITTER_TILE_U[0] * T, LITTER_TILE_U[1] * T);
  const rand = mulberry32(11);
  // The air gaps: dark, warm shadow, darker in deep pockets.
  fill(c, (x, y, o) => {
    const v = 0.55 + 0.45 * vn(c, x, y, 3, 41) + 0.25 * (vn(c, x, y, 14, 42) - 0.5);
    o[0] = 0.1 * v; o[1] = 0.064 * v; o[2] = 0.04 * v; o[3] = 1;
  });
  // A few leaves cut at a slant show a sliver of their face.
  for (let i = 0; i < 9; i++) {
    lens(c, rand() * c.w, rand() * c.h, 22 + rand() * 30, 4 + rand() * 5, (rand() - 0.5) * 8, scale(leafColour(rand), 0.85));
  }
  // Leaves edge-on, lying mostly flat, rippled, some cupped or curled; twigs, grass blades, needles.
  for (let i = 0; i < 230; i++) {
    const k = rand();
    const x0 = rand() * c.w;
    const y0 = rand() * c.h;
    if (k < 0.05) {
      // A twig: straight, round, grey-brown, lit along its top.
      band(c, { x0, y0, len: 70 + rand() * 120, half: 1.5 + rand() * 1.2, tilt: (rand() - 0.5) * 0.25, arch: 0, curl: 0,
        taper: 0.2, col: [0.36, 0.27, 0.19], relief: 0.6, seed: rand() });
    } else if (k < 0.14) {
      // A grass blade or pine needle: thin, straight, pale straw or rusty.
      band(c, { x0, y0, len: 60 + rand() * 110, half: 0.55 + rand() * 0.3, tilt: (rand() - 0.5) * 0.7, arch: (rand() - 0.5) * 6, curl: 0,
        taper: 0.8, col: rand() < 0.6 ? [0.74, 0.64, 0.38] : [0.62, 0.34, 0.14], relief: 0.3, seed: rand() });
    } else if (k < 0.4) {
      // Seen right on edge: a thin line.
      band(c, { x0, y0, len: 50 + rand() * 140, half: 0.6 + rand() * 0.5, tilt: (rand() - 0.5) * 0.15, arch: (rand() - 0.5) * 10,
        curl: 0, wave: 0.5 + rand(), waveLen: 70 + rand() * 90, taper: 0.6, col: leafColour(rand), relief: 0.4, seed: rand() });
    } else {
      // Seen a little from above: a cupped crescent, lit on top, pointed at both ends.
      band(c, { x0, y0, len: 50 + rand() * 120, half: 1.3 + rand() * 2, tilt: (rand() - 0.5) * 0.2, arch: (rand() < 0.7 ? 1 : -1) * (3 + rand() * 10),
        curl: rand() < 0.2 ? 0.3 + rand() * 0.6 : 0, wave: 0.3 + rand() * 0.5, waveLen: 90 + rand() * 90, taper: 1,
        col: leafColour(rand), relief: 0.55, seed: rand() });
    }
  }
  // Twigs cut across: bark round pale wood.
  for (let i = 0; i < 6; i++) {
    const x = rand() * c.w;
    const y = rand() * c.h;
    const r = 3 + rand() * 3.5;
    crumb(c, x, y, r, [0.3, 0.2, 0.13], 0.05, rand() * 6);
    crumb(c, x, y + 0.3, r * 0.7, [0.66, 0.55, 0.38], 0, 0);
  }
  const hum = paintHumus(c.w, c.h);
  for (let i = 0; i < c.w * c.h; i++) c.px[i * 4 + 3] = hum.px[i * 4];
  return c;
}

function paintOldLeaves(): Canvas {
  const c = createCanvas(OLD_TILE_U[0] * T, OLD_TILE_U[1] * T);
  const rand = mulberry32(61);
  fill(c, (x, y, o) => {
    const v = 0.6 + 0.4 * vn(c, x, y, 5, 63);
    o[0] = 0.06 * v; o[1] = 0.04 * v; o[2] = 0.026 * v; o[3] = 0;
  });
  // Matted fragments of last years' leaves: short, flat, dark browns, a few still reddish.
  for (let i = 0; i < 1240; i++) {
    const shade = 0.55 + rand() * 0.6;
    const col: Rgb = rand() < 0.15 ? [0.3 * shade, 0.12 * shade, 0.07 * shade] : [0.25 * shade, 0.15 * shade, 0.075 * shade];
    band(c, { x0: rand() * c.w, y0: rand() * c.h, len: 6 + rand() * 38, half: 0.8 + rand() * 1.2, tilt: (rand() - 0.5) * 0.5,
      arch: (rand() - 0.5) * 3, curl: 0, taper: 0.6, col, relief: 0.35, seed: rand() });
  }
  // Pale fine roots, wandering down and across.
  for (let i = 0; i < 40; i++) {
    thread(c, rand() * c.w, rand() * c.h, { steps: 50 + rand() * 130, r: 0.45 + rand() * 0.35, dir: -1.2 + (rand() - 0.5) * 1.5,
      wander: 0.4, aim: -1.1 + (rand() - 0.5), pull: 0.03, branch: 0.025, col: rand() < 0.5 ? [0.56, 0.43, 0.28] : [0.4, 0.27, 0.16], alpha: 0.8 }, rand);
  }
  // White fungal hyphae in patches: fine threads wandering sideways, branching often.
  for (let p = 0; p < 18; p++) {
    const px = rand() * c.w;
    const py = rand() * c.h;
    const n = 2 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) {
      const aim = (rand() < 0.5 ? 0 : Math.PI) + (rand() - 0.5) * 0.8;
      thread(c, px + (rand() - 0.5) * 60, py + (rand() - 0.5) * 30, { steps: 30 + rand() * 70, r: 0.42, dir: aim,
        wander: 0.4, aim, pull: 0.05, branch: 0.05, col: [0.92, 0.9, 0.82], alpha: 0.85 }, rand);
    }
  }
  // Moss (alpha): a carpet of feathery upright stems; the face shows it in patches at F's top.
  for (let i = 0; i < 900; i++) {
    const x = rand() * c.w;
    const y = rand() * c.h;
    const len = 8 + rand() * 16;
    const lean = (rand() - 0.5) * 0.9;
    const v = 0.5 + rand() * 0.5;
    for (let s = 0; s < len; s++) {
      const sx = x + lean * s;
      blendChannel(c, 3, Math.floor(sx), Math.floor(y + s), v, 0.9);
      if (s % 2 === 0 && s > 1) {
        const w = (len - s) * 0.2 + 1;
        for (let k = 1; k <= w; k++) {
          blendChannel(c, 3, Math.floor(sx + k), Math.floor(y + s + k * 0.6), v * 0.8, 0.7);
          blendChannel(c, 3, Math.floor(sx - k), Math.floor(y + s + k * 0.6), v * 0.8, 0.7);
        }
      }
    }
  }
  return c;
}

/**
 * Humus, H, as one value per texel, which the face turns into colour along a ramp: black (0),
 * crumbs (0.1 to 0.35, lit on top), fine roots (0.5 to 0.62), white hyphae (1). It rides in the
 * litter tile's alpha, so the face reads one texture fewer.
 */
function paintHumus(w: number, h: number): Canvas {
  const c = createCanvas(w, h);
  const rand = mulberry32(81);
  fill(c, (x, y, o) => {
    o[0] = 0.04 + 0.05 * vn(c, x, y, 8, 83);
  });
  // Black crumbs, nothing recognisable left.
  for (let i = 0; i < 2600; i++) {
    const k = 0.2 + rand() * 0.1;
    crumb(c, rand() * c.w, rand() * c.h, 1.4 + rand() * rand() * 4.5, [k, k, k], 0.25, rand() * 6.3);
  }
  // Dense fine roots and a few hyphae.
  for (let i = 0; i < 52; i++) {
    const v = rand() < 0.5 ? 0.62 : 0.5;
    thread(c, rand() * c.w, rand() * c.h, { steps: 50 + rand() * 120, r: 0.55 + rand() * 0.3, dir: (rand() - 0.5) * 3, wander: 0.45,
      aim: (rand() - 0.5) * 2, pull: 0.02, branch: 0.03, col: [v, v, v], alpha: 0.85 }, rand);
  }
  for (let i = 0; i < 16; i++) {
    thread(c, rand() * c.w, rand() * c.h, { steps: 30 + rand() * 50, r: 0.4, dir: rand() * 6.3, wander: 0.8, aim: 0, pull: 0,
      branch: 0.05, col: [1, 1, 1], alpha: 0.6 }, rand);
  }
  return c;
}

/** A fixed 0..1 per texel (the finest sand grain). */
function speck(x: number, y: number): number {
  let h = Math.imul(Math.floor(x) | 0, 374761393) ^ Math.imul(Math.floor(y) | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function paintGrain(): Canvas {
  const c = createCanvas(SOIL_TILE_U * T, SOIL_TILE_U * T);
  const rand = mulberry32(91);
  fill(c, (x, y, o) => {
    o[0] = 0.35 * speck(x, y) + 0.35 * vn(c, x, y, 40, 92) + 0.3 * vn(c, x, y, 9, 96);
    o[1] = 0.65 * vn(c, x, y, 1.5, 93) + 0.35 * vn(c, x, y, 5, 94);
    o[2] = 0;
    o[3] = smooth(0.25, 0.75, 0.7 * vn(c, x, y, 2, 95, 26) + 0.3 * vn(c, x, y, 7, 97, 40));
  });
  // Pebbles: pebble shading into b (crumb paints rgb, so it is painted aside and copied over).
  const peb = createCanvas(c.w, c.h);
  for (let i = 0; i < 18; i++) {
    const r = 2 + rand() * rand() * 13;
    crumb(peb, rand() * c.w, rand() * c.h, r, [1, 1, 1], 0.2, rand() * 6.3);
  }
  for (let i = 0; i < c.w * c.h; i++) {
    const v = peb.px[i * 4];
    c.px[i * 4 + 2] = v > 0.02 ? 0.3 + 0.7 * Math.min(1, v) : 0;
  }
  return c;
}

function toTexture(c: Canvas): THREE.DataTexture {
  const t = new THREE.DataTexture(toBytes(c), c.w, c.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  // Mipmaps: the far face is minified without sparkling. Nearest mip (no blend between levels) is
  // the cheaper filter in software GL.
  t.minFilter = THREE.LinearMipmapNearestFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export interface SoilTiles {
  /** L (rgb) and H (a). */
  readonly litter: THREE.DataTexture;
  readonly oldLeaves: THREE.DataTexture;
  readonly grain: THREE.DataTexture;
}

/** The four tiles' painters (exported for tests: each returns its painted canvas). */
export const PAINTERS = { litter: paintLitter, oldLeaves: paintOldLeaves, grain: paintGrain };

/** Paints the three tiles (once, at load). */
export function createSoilTiles(): SoilTiles {
  return {
    litter: toTexture(paintLitter()),
    oldLeaves: toTexture(paintOldLeaves()),
    grain: toTexture(paintGrain()),
  };
}
