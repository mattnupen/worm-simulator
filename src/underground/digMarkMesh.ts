import * as THREE from 'three';
import { litterTopHeight } from '../surface/litterDepth';
import { createPropMaterial } from '../render/propMaterial';
import type { WormMotion } from '../worm/locomotion';
import { DigMarks, MARK_NONE, MARK_OPENING, MAX_MARKS, type MarkWorld } from './digMarks';
import { markShape } from './digMarkShape';

/**
 * The dig markers drawn (V4 spec, revision 1 item 3): one mesh, one draw call, on the plain props
 * material (its program is already compiled for the ground props: nothing new compiles). Each slot
 * of the sampler (digMarks.ts) gets a copy of the marker's shape: a mound of worm castings with an
 * open hole in the middle. An old opening's marker draws nothing: its midden (middens.ts) is the
 * same kind of mound with the same open hole, so it is not drawn twice. A marker grows in where a
 * spot is found and shrinks away where one is dropped (a quarter second, never a pop or a flash),
 * and stays put while the head is on it (the Action prompt says "Dig down"). A slot's points are
 * rewritten only while it grows or shrinks; nothing is allocated per frame.
 */

/** Grow and shrink this much a second (0..1). */
const GROW_RATE = 4;

export interface DigMarkView {
  readonly marks: DigMarks;
  readonly mesh: THREE.Mesh;
  /** One game step on the surface: the sampler looks for spots round the worm. */
  step(m: WormMotion, w: MarkWorld): void;
  /** Each frame: the markers drawn when `shown` (the crawl screen, on the surface, not in a cut scene or the speed test). */
  frame(shown: boolean, dt: number): void;
}

const ease = (t: number): number => t * t * (3 - 2 * t);

export function createDigMarkView(marks = new DigMarks()): DigMarkView {
  const shape = markShape();
  const per = shape.pos.length / 3;
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(per * MAX_MARKS * 3), 3);
  const nor = new THREE.BufferAttribute(new Float32Array(per * MAX_MARKS * 3), 3);
  const prop = new THREE.BufferAttribute(new Float32Array(per * MAX_MARKS * 4), 4);
  const index = new THREE.BufferAttribute(new Uint16Array(shape.index.length * MAX_MARKS), 1);
  pos.setUsage(THREE.DynamicDrawUsage);
  for (let s = 0; s < MAX_MARKS; s++) {
    (nor.array as Float32Array).set(shape.nor, s * per * 3);
    (prop.array as Float32Array).set(shape.prop, s * per * 4);
    const ia = index.array as Uint16Array;
    for (let i = 0; i < shape.index.length; i++) ia[s * shape.index.length + i] = shape.index[i] + s * per;
  }
  geo.setAttribute('position', pos);
  geo.setAttribute('normal', nor);
  geo.setAttribute('aProp', prop);
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, createPropMaterial());
  mesh.name = 'digMarks';
  // A few small markers round the worm: never worth culling (and the points move as they grow).
  mesh.frustumCulled = false;
  mesh.visible = false;

  /** What each slot draws: where, whether its mound shows, how grown, the ground under each point. */
  const at = new Float64Array(MAX_MARKS * 2);
  const mound = new Uint8Array(MAX_MARKS);
  const grow = new Float64Array(MAX_MARKS);
  const ground = new Float32Array(MAX_MARKS * per);
  const drawn = new Uint8Array(MAX_MARKS);
  /** The scale each slot's points were last written at (-1: not yet). */
  const written = new Float64Array(MAX_MARKS).fill(-1);

  /** Slot s takes the sampler's marker s: its place and the ground under each of its points. */
  function adopt(s: number): void {
    const x = marks.x[s];
    const z = marks.z[s];
    at[s * 2] = x;
    at[s * 2 + 1] = z;
    mound[s] = marks.kind[s] === MARK_OPENING ? 0 : 1;
    for (let i = 0; i < per; i++) ground[s * per + i] = litterTopHeight(x + shape.pos[i * 3], z + shape.pos[i * 3 + 2]);
    drawn[s] = 1;
    written[s] = -1;
  }

  /** Writes slot s's points scaled by `k` about its centre on the ground; true if they changed. */
  function write(s: number, k: number): boolean {
    if (written[s] === k) return false;
    written[s] = k;
    const p = pos.array as Float32Array;
    const x = at[s * 2];
    const z = at[s * 2 + 1];
    const o = s * per * 3;
    for (let i = 0; i < per; i++) {
      const j = i * 3;
      p[o + j] = x + shape.pos[j] * k;
      p[o + j + 1] = ground[s * per + i] + shape.pos[j + 1] * k;
      p[o + j + 2] = z + shape.pos[j + 2] * k;
    }
    return true;
  }

  return {
    marks,
    mesh,
    step(m, w) {
      marks.step(m, w);
    },
    frame(shown, dt) {
      if (!shown) {
        // Grown in afresh when shown again (back up from below, after a cut scene).
        mesh.visible = false;
        grow.fill(0);
        drawn.fill(0);
        return;
      }
      const step = Math.min(0.1, Math.max(0, dt)) * GROW_RATE;
      let any = false;
      let changed = false;
      for (let s = 0; s < MAX_MARKS; s++) {
        const same = drawn[s] && marks.kind[s] !== MARK_NONE && marks.x[s] === at[s * 2] && marks.z[s] === at[s * 2 + 1];
        if (same) grow[s] = Math.min(1, grow[s] + step);
        else if (drawn[s] && grow[s] > 0) grow[s] = Math.max(0, grow[s] - step);
        else if (marks.kind[s] !== MARK_NONE) {
          // Shrunk away (or never drawn): the slot moves to its new marker and grows there.
          adopt(s);
          grow[s] = 0;
        } else drawn[s] = 0;
        // A free slot's points lie collapsed where it last was.
        const k = ease(grow[s]) * mound[s];
        if (write(s, k)) changed = true;
        any ||= drawn[s] === 1 && k > 0;
      }
      mesh.visible = any;
      if (changed) {
        pos.clearUpdateRanges();
        pos.addUpdateRange(0, per * MAX_MARKS * 3);
        pos.needsUpdate = true;
      }
    },
  };
}
