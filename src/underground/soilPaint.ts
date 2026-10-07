/**
 * A small painting kit for the soil's pattern tiles (soilTiles.ts): strokes, threads and crumbs
 * painted into a float RGBA canvas that wraps at its edges, so every tile repeats seamlessly.
 * Each mark is antialiased by its coverage of the texel. Runs once, at load.
 */
export type Rgb = readonly [number, number, number];

export interface Canvas {
  readonly w: number;
  readonly h: number;
  /** RGBA, row 0 at the bottom (y up, as the face reads it). */
  readonly px: Float32Array;
}

export function createCanvas(w: number, h: number): Canvas {
  return { w, h, px: new Float32Array(w * h * 4) };
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Mixes (r, g, b) into the texel at (x, y), wrapped, by `a`. */
export function blend(c: Canvas, x: number, y: number, r: number, g: number, b: number, a: number): void {
  if (a <= 0) return;
  const xi = ((x % c.w) + c.w) % c.w;
  const yi = ((y % c.h) + c.h) % c.h;
  const i = (yi * c.w + xi) * 4;
  const p = c.px;
  const k = a > 1 ? 1 : a;
  p[i] += (r - p[i]) * k;
  p[i + 1] += (g - p[i + 1]) * k;
  p[i + 2] += (b - p[i + 2]) * k;
}

/** Raises channel `ch` at (x, y), wrapped, toward `v` by `a`. */
export function blendChannel(c: Canvas, ch: number, x: number, y: number, v: number, a: number): void {
  const xi = ((x % c.w) + c.w) % c.w;
  const yi = ((y % c.h) + c.h) % c.h;
  const i = (yi * c.w + xi) * 4 + ch;
  c.px[i] += (v - c.px[i]) * clamp01(a);
}

/** Every texel from `fn(x, y, out)` (x, y in texels at the texel's centre). */
export function fill(c: Canvas, fn: (x: number, y: number, out: number[]) => void): void {
  const o = [0, 0, 0, 1];
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      fn(x + 0.5, y + 0.5, o);
      const i = (y * c.w + x) * 4;
      c.px[i] = o[0]; c.px[i + 1] = o[1]; c.px[i + 2] = o[2]; c.px[i + 3] = o[3];
    }
  }
}

export interface Band {
  /** Start (texels), length, half thickness at the middle. */
  x0: number; y0: number; len: number; half: number;
  /** Rise per texel, arch at the middle (texels; negative sags), curl up over the last 15%. */
  tilt: number; arch: number; curl: number;
  /** A ripple along it: amplitude (texels) and wavelength (texels; 0 none). */
  wave?: number; waveLen?: number;
  /** How much the band tapers to its ends (0 square, 1 pointed). */
  taper: number;
  col: Rgb;
  /** Upper edge lit, lower edge shaded, by this much. */
  relief: number;
  /** A fixed 0..1 value: the band's own mottling. */
  seed: number;
}

/**
 * A leaf, twig or grass blade seen edge-on: a curved band, its upper edge catching the light
 * from the surface, its lower side in shade, mottled along its length.
 */
export function band(c: Canvas, s: Band): void {
  const n = Math.max(2, Math.ceil(s.len));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const tail = Math.max(0, t - 0.85);
    const ripple = s.waveLen ? (s.wave ?? 0) * Math.sin((i / s.waveLen) * 6.283 + s.seed * 30) : 0;
    const yc = s.y0 + s.tilt * i + s.arch * 4 * t * (1 - t) + s.curl * tail * tail * 44 + ripple;
    const end = Math.min(t, 1 - t);
    const half = s.half * (1 - s.taper + s.taper * Math.sqrt(smooth(0, 0.5, end))) * smooth(0, 0.04, end);
    if (half <= 0.05) continue;
    const mott = 0.88 + 0.24 * Math.abs(Math.sin(i * 0.11 + s.seed * 40) * Math.sin(i * 0.037 + s.seed * 17));
    const x = Math.floor(s.x0 + i);
    for (let y = Math.floor(yc - half - 1); y <= Math.ceil(yc + half + 1); y++) {
      const d = y + 0.5 - yc;
      const cov = clamp01(half + 0.5 - Math.abs(d));
      if (cov <= 0) continue;
      const up = d / Math.max(half, 0.5);
      const lit = mott * (1 + s.relief * (0.5 * up + (up > 0.45 ? 0.45 : 0)));
      blend(c, x, y, s.col[0] * lit, s.col[1] * lit, s.col[2] * lit, cov);
    }
  }
}

/** A leaf cut at a slant: a curved lens of its face with a midrib and faint veins. */
export function lens(c: Canvas, cx: number, cy: number, a: number, b: number, arch: number, col: Rgb): void {
  for (let x = Math.floor(cx - a); x <= Math.ceil(cx + a); x++) {
    const t = (x + 0.5 - cx) / a;
    if (Math.abs(t) >= 1) continue;
    const half = b * Math.sqrt(1 - t * t);
    const yc = cy + arch * (1 - t * t);
    for (let y = Math.floor(yc - half - 1); y <= Math.ceil(yc + half + 1); y++) {
      const d = y + 0.5 - yc;
      const cov = clamp01(half + 0.5 - Math.abs(d));
      if (cov <= 0) continue;
      const rib = Math.abs(d) < 0.8 ? 0.72 : 1;
      const vein = 1 - 0.1 * smooth(0.6, 0.95, Math.abs(Math.sin((t * a * 0.35) - Math.abs(d) * 0.5)));
      const lit = rib * vein * (0.92 + 0.16 * (d / half));
      blend(c, x, y, col[0] * lit, col[1] * lit, col[2] * lit, cov);
    }
  }
}

/** A soft round dot of radius r (texels). */
function dot(c: Canvas, x: number, y: number, r: number, col: Rgb, a: number): void {
  for (let yi = Math.floor(y - r - 1); yi <= Math.ceil(y + r); yi++) {
    for (let xi = Math.floor(x - r - 1); xi <= Math.ceil(x + r); xi++) {
      const d = Math.hypot(xi + 0.5 - x, yi + 0.5 - y);
      blend(c, xi, yi, col[0], col[1], col[2], clamp01(r + 0.5 - d) * a);
    }
  }
}

export interface Thread {
  /** Steps of one texel; its width (radius, texels) thins toward its tip. */
  steps: number; r: number;
  /** Heading (radians), how much it wanders a step, and the heading it drifts back toward (and how hard). */
  dir: number; wander: number; aim: number; pull: number;
  /** Chance per step of a side branch (a branch has none of its own). */
  branch: number;
  col: Rgb;
  alpha: number;
}

/** A root or fungal thread: a wandering line from (x, y), branching now and then. */
export function thread(c: Canvas, x: number, y: number, s: Thread, rand: () => number, depth = 0): void {
  let a = s.dir;
  for (let i = 0; i < s.steps; i++) {
    const r = s.r * (1 - 0.6 * (i / s.steps));
    dot(c, x, y, r, s.col, s.alpha);
    a += (rand() - 0.5) * s.wander + (s.aim - a) * s.pull;
    x += Math.cos(a);
    y += Math.sin(a);
    if (depth === 0 && rand() < s.branch) {
      const side = rand() < 0.5 ? -1 : 1;
      thread(c, x, y, { ...s, steps: Math.floor(s.steps * (0.2 + 0.3 * rand())), r: r * 0.7, dir: a + side * (0.5 + rand() * 0.6) }, rand, 1);
    }
  }
}

/**
 * A crumb or pebble: a lumpy disc of radius r, lit from above, darker at its rim. `lumps` makes
 * its outline irregular (0 round).
 */
export function crumb(c: Canvas, cx: number, cy: number, r: number, col: Rgb, lumps: number, phase: number): void {
  const R = r * (1 + lumps) + 1;
  for (let y = Math.floor(cy - R); y <= Math.ceil(cy + R); y++) {
    for (let x = Math.floor(cx - R); x <= Math.ceil(cx + R); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const edge = r * (1 + lumps * (0.6 * Math.sin(3 * ang + phase) + 0.4 * Math.sin(5 * ang + phase * 2.3)));
      const cov = clamp01(edge + 0.5 - d);
      if (cov <= 0) continue;
      const k = d / Math.max(edge, 0.5);
      const lit = (0.85 + 0.3 * (dy / Math.max(edge, 0.5))) * (1 - 0.4 * k * k * k);
      blend(c, x, y, col[0] * lit, col[1] * lit, col[2] * lit, cov);
    }
  }
}

/** The canvas as RGBA bytes. */
export function toBytes(c: Canvas): Uint8Array {
  const out = new Uint8Array(c.px.length);
  for (let i = 0; i < c.px.length; i++) out[i] = Math.round(clamp01(c.px[i]) * 255);
  return out;
}
