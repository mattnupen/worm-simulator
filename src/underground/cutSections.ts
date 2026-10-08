import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { PROP } from '../surface/propGeometry';
import { rockSeed } from '../surface/rockShape';
import { boundaryAt, B_TOP } from './slab';
import { dot, writeBlob, type Pen } from './cutShapes';
import { writeMoss } from './cutLife';
import type { LogCut, Section } from './sections';
import type { Solids } from './solidShapes';

/**
 * The rocks and the log the cut passes through, drawn in section inside their real outlines
 * (sections.ts, cut from the drawn meshes): fresh granite inside a weathered rind, or the fallen
 * birch's rotting wood in rings inside its white bark; moss, lichen and bracket fungi on top where
 * they stand out of the litter (V2 spec 5.2; IMG_2435, IMG_2437). Damp and dark underneath (the
 * soil grid's damp darkens the face below them too, solids.ts markSolids). Build-time only.
 */
export function writeSections(p: Pen, o: Solids): void {
  for (let i = 0; i < o.sectionCount; i++) {
    const sec = o.sections[i];
    if (sec.rock >= 0) writeRockSection(p, sec);
    else writeLogSection(p, sec, o.log);
  }
}

/** The drawn rocks' colours (propGeometry's writeRock), by rockSeed. */
const ROCK_HEX = ['#948a7e', '#9c8e80', '#857d72'];
const col = new THREE.Color();
const TAU = Math.PI * 2;
const hash = (a: number, b: number) => {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Top of the convex outline at u (its highest crossing), or NaN outside it. */
function outlineTop(sec: Section, u: number): number {
  let best = NaN;
  for (let k = 0; k < sec.count; k++) {
    const j = (k + 1) % sec.count;
    const u0 = sec.pts[k * 2];
    const u1 = sec.pts[j * 2];
    if ((u < u0) === (u < u1)) continue;
    const v = sec.pts[k * 2 + 1] + ((sec.pts[j * 2 + 1] - sec.pts[k * 2 + 1]) * (u - u0)) / (u1 - u0);
    if (!(v <= best)) best = v;
  }
  return best;
}

/**
 * Moss along the outline's top where it stands out of the litter and is not too steep, and (for
 * the log) a few shelf fungi low on a flank; lichen rosettes on the flanks above the litter.
 */
function writeTopLife(p: Pen, sec: Section, rand: () => number, fungi: boolean): void {
  const s = p.s;
  const top = (u: number) => outlineTop(sec, u) - 0.03;
  let run = NaN;
  // At most this much moss along one top (a long log's top runs past any frame).
  let mossLeft = 3;
  for (let u = sec.uLo + 0.05; u <= sec.uHi; u += 0.05) {
    const ok = top(u) > boundaryAt(s, B_TOP, u) + 0.04 && Math.abs(top(u + 0.05) - top(u - 0.05)) < 0.12 && u < sec.uHi - 0.05;
    if (ok && Number.isNaN(run)) run = u;
    if (!ok && !Number.isNaN(run)) {
      // Patches of moss along a long top, with bare rock or bark between them.
      for (let a = run; u - a > 0.25 && mossLeft > 0; a += 0.3 + rand() * 0.9) {
        const b = Math.min(u, a + 0.6 + rand() * 1.2, a + mossLeft);
        writeMoss(p, a, b, top, rand);
        mossLeft -= b - a;
        a = b;
      }
      run = NaN;
    }
  }
  // Lichen rosettes (grey-green, now and then orange) on the flanks below the moss, above the litter.
  for (let k = 0; k < sec.count; k++) {
    const u = sec.pts[k * 2];
    const v = sec.pts[k * 2 + 1];
    if (v < boundaryAt(s, B_TOP, u) + 0.05 || hash(k, sec.uLo) > (fungi ? 0.3 : 0.55)) continue;
    const r = 0.04 + 0.05 * hash(sec.vLo, k);
    const cu = (sec.uLo + sec.uHi) / 2;
    const cv = (sec.vLo + sec.vHi) / 2;
    const l = Math.hypot(u - cu, v - cv) || 1;
    const hex = hash(k, 7) < 0.2 ? '#c88a30' : '#a9ae8a';
    writeBlob(p, u - ((u - cu) / l) * r, v - ((v - cv) / l) * r, 0.03, r, r * 0.8, 0.012, hash(k, 3) * 3, {
      hex: (x, y) => (Math.hypot(x, y) > 0.6 ? hex : '#8c9172'), code: PROP.plain, face: 0.5, lump: 0.2, seed: k,
    });
  }
  if (!fungi) return;
  // Turkey-tail brackets low on a flank, just above the litter (where the Wide view shows them):
  // fans in brown, tan and cream bands, the biggest lowest.
  const side = rand() < 0.5 ? -1 : 1;
  const v0 = boundaryAt(s, B_TOP, side < 0 ? sec.uLo : sec.uHi) + 0.25;
  for (let n = 0; n < 3; n++) {
    const v = v0 + n * 0.16;
    if (v > sec.vHi - 0.2) break;
    const u = edgeAt(sec, v, side);
    const r = 0.2 - n * 0.045;
    // A fan facing the camera, half a disc out from the bark, banded round where it grows from.
    writeBlob(p, u, v, 0.04, r, r * 0.7, 0.035, side * 0.2, {
      shape: (x) => (x * side < 0 ? 0.12 : 1),
      hex: (x, y) => {
        const d = Math.hypot(x, y);
        return d > 0.86 ? '#e2d6b2' : d > 0.7 ? '#6a4a30' : d > 0.52 ? '#b08c5c' : d > 0.34 ? '#4e3828' : '#8a6a46';
      },
      code: PROP.plain, face: 0.4, lump: 0.08, seed: n + 3,
    });
  }
}

/** The outline's u on its left (side -1) or right (+1) edge at height v. */
function edgeAt(sec: Section, v: number, side: number): number {
  let best = side < 0 ? Infinity : -Infinity;
  for (let k = 0; k < sec.count; k++) {
    const j = (k + 1) % sec.count;
    const v0 = sec.pts[k * 2 + 1];
    const v1 = sec.pts[j * 2 + 1];
    if ((v < v0) === (v < v1)) continue;
    const u = sec.pts[k * 2] + ((sec.pts[j * 2] - sec.pts[k * 2]) * (v - v0)) / (v1 - v0);
    best = side < 0 ? Math.min(best, u) : Math.max(best, u);
  }
  return Number.isFinite(best) ? best : side < 0 ? sec.uLo : sec.uHi;
}

/** The outline's centroid (its points' mean). */
function centre(sec: Section): [number, number] {
  let u = 0;
  let v = 0;
  for (let k = 0; k < sec.count; k++) { u += sec.pts[k * 2]; v += sec.pts[k * 2 + 1]; }
  return [u / sec.count, v / sec.count];
}

/** A rock cut through: fresh granite (no lichen inside) in a darker weathered rind, damp and dark low down. */
function writeRockSection(p: Pen, sec: Section): void {
  const seed = rockSeed(sec.rock);
  const [cu, cv] = centre(sec);
  // The drawn rock's own grey for the rind; the fresh inside a little pinker and lighter.
  const rind = col.set(ROCK_HEX[Math.floor(seed * 3) % 3]).multiplyScalar(0.62).clone();
  const grey = new THREE.Color('#8e8882');
  const pink = new THREE.Color('#a48e84');
  const dark = new THREE.Color('#5e5a56');
  const tall = sec.vHi - sec.vLo;
  const z = seed * 10;
  writeFill(p, sec.pts, sec.count, cu, cv, 0.015, [0.25, 0.5, 0.7, 0.86, 0.95, 1], (f, _k, u, v) => {
    if (f > 0.9) return rind;
    // Broad, smooth patches of grey, pink feldspar and dark mica.
    const a = Math.sin(u * 2.3 + z) * Math.sin(v * 2.9 - u * 1.1 + z) + 0.4 * Math.sin(u * 6.1 + v * 5.3);
    return col.copy(grey).lerp(a > 0 ? pink : dark, Math.min(1, Math.abs(a)) * (a > 0 ? 0.8 : 0.5));
  }, PROP.plain, (_u, v) => 0.7 + 0.3 * Math.min(1, (v - sec.vLo) / (0.35 * tall)), 0.12);
  writeTopLife(p, sec, mulberry32(Math.floor(seed * 1e6)), false);
}

/** Ring lines of the log's wood: each a dark line between two light edges, so it stays sharp. */
const LOG_RINGS: number[] = [];
for (let j = 0; j < 7; j++) {
  const f = 0.14 + j * 0.105;
  LOG_RINGS.push(f - 0.018, f, f + 0.018);
}
LOG_RINGS.push(0.86, 0.885, 0.91, 0.95, 1);
/** The pith: one colour out to here, so the middle has no spokes. */
LOG_RINGS.unshift(0.04);

/**
 * The fallen birch cut through: punky brown heartwood and pale rotting rings with dark ring lines,
 * a dark cambium and its white bark (which outlasts the wood), mossy where it faces up.
 */
function writeLogSection(p: Pen, sec: Section, log: LogCut): void {
  writeFill(p, sec.pts, sec.count, log.u, log.v, 0.015, LOG_RINGS, (f, k, u, v) => {
    if (f > 0.9) {
      // Bark: white with dark lenticel dashes; moss patches on its upper half.
      const up = v > log.v + 0.2 * log.ry;
      if (f > 0.93 && up && hash(k, 5) < 0.55) return hash(k, 9) < 0.5 ? '#4e7a22' : '#6a9a2a';
      return hash(k, f) < 0.2 ? '#2c2622' : '#ddd6c8';
    }
    if (f > 0.87) return '#4a3424';
    if (f < 0.1) return '#5e3e24';
    // Rot spreads from the heart in soft patches (smooth in u, v: no spokes), fewer outward.
    const patch = Math.sin(u * 3.1 + 1) * Math.sin(v * 2.7 - u * 0.8) + 0.5 * Math.sin(u * 5.3 - v * 4.1);
    const rot = patch > 0.2 + f * 1.3;
    const line = (LOG_RINGS.indexOf(f) - 1) % 3 === 1;
    return line ? (rot ? '#6a4228' : '#7a5634') : rot ? '#9a6a3e' : patch < -0.6 ? '#b08c5a' : '#c09a68';
  }, PROP.plain, (_u, v) => 0.8 + 0.2 * Math.min(1, (v - sec.vLo) / (0.3 * (sec.vHi - sec.vLo))), 0.08, 64, { rx: log.rx, ry: log.ry });
  writeTopLife(p, sec, mulberry32(77), true);
}

/**
 * A flat patch filling the convex outline pts (u, v pairs, `count` of them) at depth d, in `rings`
 * rings about (cu, cv) out to the outline, which is walked at even steps (so rings come out round
 * even where the outline has few corners); `hex(f, k, u, v)` colours ring fraction f (0 centre,
 * 1 outline) at step k, point (u, v); inner rings wander by up to `wobble` of their size. `steps`
 * fixes how many steps round; with `round`, rings inside f 0.75 are the ellipse (rx, ry) instead,
 * blending to the outline by f 0.87. Faces the camera.
 */
export function writeFill(
  p: Pen, pts: ArrayLike<number>, count: number, cu: number, cv: number, d: number, rings: readonly number[],
  hex: (f: number, k: number, u: number, v: number) => string | THREE.Color, code: number, mul: (u: number, v: number) => number,
  wobble = 0, steps = 0, round?: { rx: number; ry: number },
): void {
  const w = p.w;
  let perim = 0;
  for (let k = 0; k < count; k++) {
    const j = (k + 1) % count;
    perim += Math.hypot(pts[j * 2] - pts[k * 2], pts[j * 2 + 1] - pts[k * 2 + 1]);
  }
  const m = steps || Math.max(24, Math.min(48, Math.round(perim / 0.25)));
  const ou: number[] = [];
  const ov: number[] = [];
  for (let k = 0, along = 0; k < count; k++) {
    const j = (k + 1) % count;
    const len = Math.hypot(pts[j * 2] - pts[k * 2], pts[j * 2 + 1] - pts[k * 2 + 1]);
    if (len < 1e-9) continue;
    for (; ou.length < m && along <= len; along += perim / m) {
      ou.push(pts[k * 2] + ((pts[j * 2] - pts[k * 2]) * along) / len);
      ov.push(pts[k * 2 + 1] + ((pts[j * 2 + 1] - pts[k * 2 + 1]) * along) / len);
    }
    along -= len;
  }
  const n = ou.length;
  // The ellipse shrunk to fit inside the outline everywhere (rings inside it are drawn on it).
  let fit = 1;
  if (round) {
    for (let k = 0; k < n; k++) {
      const du = ou[k] - cu;
      const dv = ov[k] - cv;
      const ro = Math.hypot(du, dv) || 1;
      fit = Math.min(fit, ro * Math.hypot(du / ro / round.rx, dv / ro / round.ry));
    }
  }
  const first = dot(p, cu, cv, d, p.fx, p.fy, p.fz, 1, hex(0, 0, cu, cv), mul(cu, cv), code);
  for (const f of rings) {
    for (let k = 0; k < n; k++) {
      // Inner rings wander a little (smoothly in f, so close rings keep together); the outline does not.
      const th = (k / n) * TAU;
      let g = f * (1 + wobble * (1 - f) * (Math.sin(th * 3 + f * 2) * 0.6 + Math.sin(th * 5 + 1.3 + f * 3) * 0.4));
      if (round) {
        // Inner rings follow the ellipse (rx, ry) about the centre, never past the outline; the outer ones the outline.
        const du = ou[k] - cu;
        const dv = ov[k] - cv;
        const ro = Math.hypot(du, dv) || 1;
        const re = fit / Math.hypot(du / ro / round.rx, dv / ro / round.ry);
        const t = Math.min(1, Math.max(0, (f - 0.75) / 0.12));
        g *= re / ro + (1 - re / ro) * t * t * (3 - 2 * t);
      }
      const u = cu + (ou[k] - cu) * g;
      const v = cv + (ov[k] - cv) * g;
      dot(p, u, v, d, p.fx, p.fy, p.fz, 1, hex(f, k, u, v), mul(u, v), code);
    }
  }
  const nx = p.s.nx;
  const nz = p.s.nz;
  for (let k = 0; k < n; k++) w.triFacing(first, first + 1 + k, first + 1 + ((k + 1) % n), nx, 0, nz);
  for (let r = 0; r + 1 < rings.length; r++) {
    for (let k = 0; k < n; k++) {
      const a = first + 1 + r * n + k;
      const b = first + 1 + r * n + ((k + 1) % n);
      w.triFacing(a, a + n, b, nx, 0, nz);
      w.triFacing(b, a + n, b + n, nx, 0, nz);
    }
  }
}
