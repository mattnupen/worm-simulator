import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { MeshWriter } from '../surface/meshWriter';
import { PROP } from '../surface/propGeometry';
import { createPropMaterial } from '../render/propMaterial';
import { boundaryAt, B_TOP, B_F, type Slab } from './slab';
import { STONE_STRIDE, ROOT_STRIDE, ENTRY_LO, ENTRY_HI, type Solids } from './solids';
import { FACE_PAST } from './cutFrame';
import { createPen, writeBlob, writeTube, type Pen } from './cutShapes';
import { writeSections } from './cutSections';
import { writeBeetle, writeMoss, writePuffball, writeSnail, writeSpider } from './cutLife';

/** Room for the biggest slab's stones, roots, sections, life and moss (tests/unit/slabProps.test.ts checks a sweep fits). */
export const MAX_VERTS = 22000;
export const MAX_INDEX = 96000;

export interface SlabProps {
  readonly mesh: THREE.Mesh;
  /** Rewrites the mesh for a new slab (once per dig: built through a MeshWriter, then copied in place). */
  setSlab(s: Slab, o: Solids): void;
}

/**
 * Everything solid or alive in the cut, in one draw on the forest's prop material (so no new
 * shader, V2 spec 5.2, 10): stones, big roots, the rocks and log the cut passes through, moss with
 * red-stalked capsules at the surface line, and the static hints of V2's vote: a snail shell in
 * the litter, a beetle, a spider on the litter's top and puffballs at the surface line. Its
 * buffers are made once at their biggest; a new slab rewrites them in place.
 */
export function createSlabProps(): SlabProps {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 3), 3);
  const nor = new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 3), 3);
  const prop = new THREE.BufferAttribute(new Float32Array(MAX_VERTS * 4), 4);
  const index = new THREE.BufferAttribute(new Uint16Array(MAX_INDEX), 1);
  for (const a of [pos, nor, prop, index]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setAttribute('normal', nor);
  geo.setAttribute('aProp', prop);
  geo.setIndex(index);
  geo.setDrawRange(0, 0);
  const mesh = new THREE.Mesh(geo, createPropMaterial());
  mesh.name = 'slabProps';
  mesh.frustumCulled = false;

  return {
    mesh,
    setSlab(s, o) {
      const w = writeSlabProps(s, o);
      const nv = Math.min(MAX_VERTS, w.vertexCount);
      const pa = pos.array as Float32Array;
      const na = nor.array as Float32Array;
      const xa = prop.array as Float32Array;
      for (let i = 0; i < nv * 3; i++) { pa[i] = w.pos[i]; na[i] = w.nor[i]; }
      for (let i = 0; i < nv * 4; i++) xa[i] = w.extra[i];
      // Whole triangles only, and only those whose vertices fit.
      const idx = index.array as Uint16Array;
      let ni = 0;
      for (let t = 0; t + 2 < w.idx.length && ni + 3 <= MAX_INDEX; t += 3) {
        if (w.idx[t] >= nv || w.idx[t + 1] >= nv || w.idx[t + 2] >= nv) continue;
        idx[ni++] = w.idx[t]; idx[ni++] = w.idx[t + 1]; idx[ni++] = w.idx[t + 2];
      }
      for (const a of [pos, nor, prop]) { a.clearUpdateRanges(); a.addUpdateRange(0, nv * a.itemSize); a.needsUpdate = true; }
      index.clearUpdateRanges();
      index.addUpdateRange(0, ni);
      index.needsUpdate = true;
      geo.setDrawRange(0, ni);
    },
  };
}

/** Everything the slab shows, written into a fresh MeshWriter (once per dig). */
export function writeSlabProps(s: Slab, o: Solids): MeshWriter {
  const w = new MeshWriter('aProp', 4);
  const p = createPen(w, s);
  writeStones(p, o);
  writeRoots(p, o);
  writeSections(p, o);
  writeLife(p, o);
  return w;
}

/** Glacial-till stones, from pale granite to dark greenstone; damp, so a little dark. */
const STONE_HEX = ['#9a9286', '#ab9d8e', '#7e7a72', '#a39484', '#6e7068'];

function writeStones(p: Pen, o: Solids): void {
  for (let i = 0; i < o.stoneCount; i++) {
    const k = i * STONE_STRIDE;
    const r = o.stones[k + 2];
    const hex = STONE_HEX[Math.floor(o.stones[k + 6] * STONE_HEX.length) % STONE_HEX.length];
    const sr = Math.sin(o.stones[k + 5]);
    const cr = Math.cos(o.stones[k + 5]);
    // Half sunk in the face, as wide as the stone the worm slides along: lit from above, damp and
    // dark underneath, speckled.
    writeBlob(p, o.stones[k], o.stones[k + 1], 0, r * o.stones[k + 3], r * o.stones[k + 4], Math.min(0.55 * r, 0.25), o.stones[k + 5], {
      hex: () => hex,
      mul: (x, y, z) => (0.86 + 0.28 * Math.sin(x * 23 + i) * Math.sin(y * 19 - z * 17)) * (0.75 + 0.5 * Math.max(-0.5, x * sr + y * cr)),
      code: PROP.plain, face: 0.6, lump: 0.09, seed: i, fine: true,
    });
  }
}

/** Big roots: a knobbly, gently winding tube along each chain of segments, with thin rootlets. */
function writeRoots(p: Pen, o: Solids): void {
  const rand = mulberry32(p.s.seed ^ 0x68e31da4);
  let us: number[] = [];
  let vs: number[] = [];
  let rs: number[] = [];
  const flush = () => {
    if (us.length > 1) writeRoot(p, us, vs, rs, rand);
    us = []; vs = []; rs = [];
  };
  for (let i = 0; i < o.rootCount; i++) {
    const k = i * ROOT_STRIDE;
    const joined = us.length > 0 && Math.hypot(o.roots[k] - us[us.length - 1], o.roots[k + 1] - vs[vs.length - 1]) < 1e-6;
    if (!joined) {
      flush();
      us.push(o.roots[k]); vs.push(o.roots[k + 1]); rs.push(o.roots[k + 2]);
    }
    us.push(o.roots[k + 3]); vs.push(o.roots[k + 4]); rs.push(o.roots[k + 5]);
  }
  flush();
}

const ROOT_BARK = (i: number, a: number) => (Math.cos(a * 5 + i * 0.9) > 0.72 ? '#2e1e12' : i % 5 === 0 ? '#5e4028' : '#503521');

/**
 * One root through the chain (us, vs, rs): run on past an end of the slab into the face beyond it,
 * or tapered to a tip inside; resampled with a slow wind and knobs (the worm slides along the
 * chain's capsules, which these stay within a few hundredths of).
 */
function writeRoot(p: Pen, us: number[], vs: number[], rs: number[], rand: () => number): void {
  const s = p.s;
  const mid = (s.playLo + s.playHi) / 2;
  for (const first of [true, false]) {
    const e = first ? 0 : us.length - 1;
    const nb = first ? 1 : us.length - 2;
    let nu = us[e] + (us[e] - us[nb]) * 0.4;
    let nv = vs[e] + (vs[e] - vs[nb]) * 0.4;
    let nr = 0.012;
    if (us[e] < s.playLo + 0.5 || us[e] > s.playHi - 0.5) {
      nu = us[e] < mid ? s.faceLo - FACE_PAST * 0.75 : s.faceHi + FACE_PAST * 0.75;
      nv = vs[e] + ((vs[e] - vs[nb]) / (us[e] - us[nb] || 1)) * (nu - us[e]) * 0.3;
      nr = rs[e] * 1.15;
    }
    if (first) { us.unshift(nu); vs.unshift(nv); rs.unshift(nr); } else { us.push(nu); vs.push(nv); rs.push(nr); }
  }
  const U: number[] = [];
  const V: number[] = [];
  const R: number[] = [];
  const phase = rand() * 6;
  let run = 0;
  for (let j = 0; j + 1 < us.length; j++) {
    const du = us[j + 1] - us[j];
    const dv = vs[j + 1] - vs[j];
    const len = Math.hypot(du, dv) || 1;
    const steps = Math.max(1, Math.round(len / 0.2));
    for (let t = 0; t < steps || (j + 2 === us.length && t === steps); t++) {
      const f = t / steps;
      const r = rs[j] + (rs[j + 1] - rs[j]) * f;
      const at = run + len * f;
      const wob = Math.sin(at * 1.7 + phase) * 0.18 * r + Math.sin(at * 4.3 + phase * 2) * 0.06 * r;
      U.push(us[j] + du * f - (dv / len) * wob);
      V.push(vs[j] + dv * f + (du / len) * wob);
      R.push(r * (1 + 0.1 * Math.sin(at * 5.1 + phase)));
      // Thin rootlets off the underside now and then, inside the playable slab.
      if (r > 0.08 && rand() < 0.12 && U[U.length - 1] > s.playLo && U[U.length - 1] < s.playHi) {
        const ru = U[U.length - 1];
        const rv = V[V.length - 1] - r * 0.8;
        let dir = (rand() - 0.5) * 1.8;
        const curl = (rand() - 0.5) * 0.9;
        const step = (0.3 + rand() * 0.4) / 4;
        const lu = [ru];
        const lv = [rv];
        for (let q = 0; q < 4; q++, dir += curl) {
          lu.push(lu[q] + Math.sin(dir) * step);
          lv.push(lv[q] - Math.cos(dir) * step);
        }
        writeTube(p, lu, lv, [0, 0, 0, 0, 0], [0.026, 0.018, 0.012, 0.007, 0.003], () => '#7a5a3e', PROP.plain, 4, 0.6, 0.3);
      }
    }
    run += len;
  }
  writeTube(p, U, V, U.map(() => 0), R, ROOT_BARK, PROP.plain, 9, 0.6, 0.45);
}

/** Spots taken along the cut (u ranges), so the life hints never overlap each other, a section or the entry. */
type Taken = [number, number][];
const free = (t: Taken, lo: number, hi: number) => t.every(([a, b]) => hi < a || lo > b);

/** A free u for something `half` wide, between the playable ends, or NaN. */
function claim(s: Slab, t: Taken, half: number, rand: () => number): number {
  for (let tries = 0; tries < 40; tries++) {
    const u = s.playLo + 0.8 + half + rand() * (s.playHi - s.playLo - 1.6 - 2 * half);
    if (free(t, u - half, u + half)) {
      t.push([u - half - 0.2, u + half + 0.2]);
      return u;
    }
  }
  return NaN;
}

/** The static life hints and the moss carpets, placed per slab (deterministic per seed). */
function writeLife(p: Pen, o: Solids): void {
  const s = p.s;
  const rand = mulberry32(s.seed ^ 0x2545f491);
  const top = (u: number) => boundaryAt(s, B_TOP, u);
  const floor = (u: number) => boundaryAt(s, B_F, u);
  // What stands on the surface line and what lies in the litter keep apart from their own kind,
  // and all of it from the entry (the worm sinks there) and the sections.
  const onTop: Taken = [[ENTRY_LO - 0.6, ENTRY_HI + 0.4]];
  for (let i = 0; i < o.sectionCount; i++) onTop.push([o.sections[i].uLo - 0.4, o.sections[i].uHi + 0.4]);
  const inLitter: Taken = onTop.slice();
  // Moss carpets along the surface line, the first with puffballs in it, and the spider.
  const carpets = 2 + Math.floor(rand() * 2);
  for (let c = 0; c < carpets; c++) {
    const half = 0.45 + rand() * 0.4;
    const u = claim(s, onTop, half, rand);
    if (!Number.isNaN(u)) {
      writeMoss(p, u - half, u + half, top, rand);
      if (c === 0) {
        writePuffball(p, u - 0.1, top(u - 0.1), 0.27, 1);
        writePuffball(p, u + 0.3, top(u + 0.3), 0.16, 2);
      }
    }
    if (c === 0) {
      const at = claim(s, onTop, 0.35, rand);
      if (!Number.isNaN(at)) writeSpider(p, at, top(at), 0.36, rand() < 0.5 ? 1 : -1);
    }
  }
  // In the litter: the snail shell midway down, the beetle low.
  let u = claim(s, inLitter, 0.25, rand);
  if (!Number.isNaN(u)) writeSnail(p, u, Math.max(floor(u) + 0.3, Math.min(top(u) - 0.3, (top(u) + floor(u)) / 2)), 0.19, rand() * 6.28);
  u = claim(s, inLitter, 0.3, rand);
  if (!Number.isNaN(u)) writeBeetle(p, u, floor(u) + 0.2, 0.54, (rand() < 0.5 ? 0 : Math.PI) + (rand() - 0.5) * 0.5);
}
