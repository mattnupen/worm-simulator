import * as THREE from 'three';
import { mulberry32 } from '../core/random';
import { MeshWriter } from '../surface/meshWriter';
import { createPropMaterial } from '../render/propMaterial';
import { boundaryAt, B_TOP, type Slab } from './slab';
import { ENTRY_LO, ENTRY_HI, type Solids } from './solids';
import { createPen, type Pen } from './cutShapes';
import { writeDots, writeRootlets, writeRoots, writeStones } from './cutSolids';
import { writeSections } from './cutSections';
import { writeBeetle, writeMoss, writePuffball, writeSnail, writeSpider } from './cutLife';

/** Room for the biggest slab's stones, roots, sections, life and moss (tests/unit/slabProps.test.ts checks a sweep fits). */
export const MAX_VERTS = 22000;
export const MAX_INDEX = 96000;

export interface SlabProps {
  readonly mesh: THREE.Mesh;
  /** Rewrites the mesh for a new slab (once per dig: built through a MeshWriter, then copied in place). */
  setSlab(s: Slab, o: Solids): void;
  /**
   * The same rewrite, staged (about 4-6 ms warm in all, far more on a slow Chromebook): startSlab
   * begins it and each buildStep does the next of BUILD_STEPS parts, the last one copying the new
   * shapes in, and returns true once the mesh shows the new slab (and while nothing is pending).
   * Until then the mesh still shows the last slab. FOR TASK 17: on a new `BurrowGame.slabVersion`
   * call startSlab, then buildStep once a frame while `game.slabHidden`, and loop it to the end as
   * soon as it is not. `s` and `o` must stay unchanged until it ends (the game's own do: a new
   * slab comes only with the next dig).
   */
  startSlab(s: Slab, o: Solids): void;
  buildStep(): boolean;
}

/** The parts a staged rewrite takes, one a frame (each about 1-2 ms warm on this Mac). */
const PARTS: readonly ((p: Pen, o: Solids) => void)[] = [
  (p, o) => { writeStones(p, o); writeRoots(p, o); writeRootlets(p, o); writeDots(p, o); },
  (p, o) => writeSections(p, o),
  (p, o) => writeLife(p, o),
];
export const BUILD_STEPS = PARTS.length;

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

  /** Copies a written slab into the buffers, in place. */
  function fill(w: MeshWriter): void {
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
  }

  let pen: Pen | null = null;
  let solids: Solids | null = null;
  let part = 0;
  const api: SlabProps = {
    mesh,
    setSlab(s, o) {
      api.startSlab(s, o);
      while (!api.buildStep());
    },
    startSlab(s, o) {
      pen = createPen(new MeshWriter('aProp', 4), s);
      solids = o;
      part = 0;
    },
    buildStep() {
      if (!pen || !solids) return true;
      PARTS[part++](pen, solids);
      if (part < PARTS.length) return false;
      fill(pen.w);
      pen = solids = null;
      return true;
    },
  };
  return api;
}

/** Everything the slab shows, written into a fresh MeshWriter (once per dig). */
export function writeSlabProps(s: Slab, o: Solids): MeshWriter {
  const w = new MeshWriter('aProp', 4);
  const p = createPen(w, s);
  for (const write of PARTS) write(p, o);
  return w;
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
  const rand = mulberry32(s.seed ^ 0x1b873593);
  const top = (u: number) => boundaryAt(s, B_TOP, u);
  // What stands on the surface line keeps apart from its own kind, the entry (the worm sinks
  // there) and the sections. The snail shell and beetle lie where placeSolids put them (they block).
  const onTop: Taken = [[ENTRY_LO - 0.6, ENTRY_HI + 0.4]];
  for (let i = 0; i < o.sectionCount; i++) onTop.push([o.sections[i].uLo - 0.4, o.sections[i].uHi + 0.4]);
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
  const h = o.hints;
  if (!Number.isNaN(h.snailU)) writeSnail(p, h.snailU, h.snailV, h.snailSize, h.snailTurn);
  if (!Number.isNaN(h.beetleU)) writeBeetle(p, h.beetleU, h.beetleV, h.beetleLen, h.beetleDir);
}
