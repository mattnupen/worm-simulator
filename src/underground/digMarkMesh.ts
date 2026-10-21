import * as THREE from 'three';
import { hypot2 } from '../core/vec';
import { litterTopHeight } from '../surface/litterDepth';
import { createPropMaterial } from '../render/propMaterial';
import type { WormMotion } from '../worm/locomotion';
import { DigMarks, MARK_NONE, MARK_OPENING, MAX_MARKS, type MarkWorld } from './digMarks';
import { markShape } from './digMarkShape';

/**
 * The dig markers drawn (V4 spec 4.2): one mesh, one draw call, on the plain props material (its
 * program is already compiled for the ground props: nothing new compiles). Each slot of the
 * sampler (digMarks.ts) gets a copy of the marker's shape: a mound of loose soil and a down-arrow
 * over it. An old opening's marker is the arrow alone (its midden is the mound). A marker grows in
 * where a spot is found and shrinks away where one is dropped (a quarter second, never a pop or a
 * flash); the arrow bobs gently (not with reduced motion). When the head is on a spot (the Action
 * prompt says "Dig down"), the arrow of the marker under it sinks away: the button takes over.
 * The points are rewritten each frame it shows (about 700 of them); nothing is allocated per frame.
 */

/** Grow and shrink this much a second (0..1). */
const GROW_RATE = 4;
/** The arrow's bob: up and down this far (u), this often (Hz). */
const BOB = 0.05;
const BOB_HZ = 0.45;
/** The marker under the head is the one within this of it. */
const UNDER_HEAD = 0.7;

export interface DigMarkView {
  readonly marks: DigMarks;
  readonly mesh: THREE.Mesh;
  /** One game step on the surface: the sampler looks for spots round the worm. */
  step(m: WormMotion, w: MarkWorld): void;
  /**
   * Each frame: the markers drawn when `shown` (the crawl screen, on the surface, not in a cut
   * scene or the speed test), the one under `head` without its arrow while `onSpot`.
   */
  frame(shown: boolean, head: { readonly x: number; readonly z: number }, onSpot: boolean, timeSec: number, dt: number): void;
}

const ease = (t: number): number => t * t * (3 - 2 * t);

export function createDigMarkView(marks = new DigMarks()): DigMarkView {
  const shape = markShape();
  const per = shape.pos.length / 3;
  const mv = shape.moundVerts;
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
  // A few small markers round the worm: never worth culling (and the points move each frame).
  mesh.frustumCulled = false;
  mesh.visible = false;

  /** What each slot draws: where, whether its mound shows, how grown, its arrow, its ground. */
  const at = new Float64Array(MAX_MARKS * 2);
  const mound = new Uint8Array(MAX_MARKS);
  const grow = new Float64Array(MAX_MARKS);
  const arrow = new Float64Array(MAX_MARKS).fill(1);
  const ground = new Float32Array(MAX_MARKS * mv);
  const base = new Float64Array(MAX_MARKS);
  const drawn = new Uint8Array(MAX_MARKS);
  const reduce = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

  /** Slot s takes the sampler's marker s: its place and the ground under each mound point. */
  function adopt(s: number): void {
    const x = marks.x[s];
    const z = marks.z[s];
    at[s * 2] = x;
    at[s * 2 + 1] = z;
    mound[s] = marks.kind[s] === MARK_OPENING ? 0 : 1;
    base[s] = litterTopHeight(x, z);
    for (let i = 0; i < mv; i++) ground[s * mv + i] = litterTopHeight(x + shape.pos[i * 3], z + shape.pos[i * 3 + 2]);
    drawn[s] = 1;
  }

  /** Writes slot s's points: its mound and arrow scaled by how grown they are. */
  function write(s: number, bob: number): void {
    const p = pos.array as Float32Array;
    const x = at[s * 2];
    const z = at[s * 2 + 1];
    const g = ease(grow[s]);
    const km = g * mound[s];
    const ka = g * ease(arrow[s]);
    const o = s * per * 3;
    for (let i = 0; i < per; i++) {
      const k = i * 3;
      if (i < mv) {
        p[o + k] = x + shape.pos[k] * km;
        p[o + k + 1] = ground[s * mv + i] + shape.pos[k + 1] * km;
        p[o + k + 2] = z + shape.pos[k + 2] * km;
      } else {
        // The arrow grows from its tip down by the mound, and sinks away into it.
        p[o + k] = x + shape.pos[k] * ka;
        p[o + k + 1] = base[s] + (shape.pos[k + 1] + bob) * ka;
        p[o + k + 2] = z + shape.pos[k + 2] * ka;
      }
    }
  }

  return {
    marks,
    mesh,
    step(m, w) {
      marks.step(m, w);
    },
    frame(shown, head, onSpot, timeSec, dt) {
      if (!shown) {
        // Grown in afresh when shown again (back up from below, after a cut scene).
        mesh.visible = false;
        grow.fill(0);
        drawn.fill(0);
        return;
      }
      const step = Math.min(0.1, Math.max(0, dt)) * GROW_RATE;
      // The marker under the head, while the prompt shows: its arrow sinks away.
      let under = -1;
      if (onSpot) {
        let near = UNDER_HEAD;
        for (let s = 0; s < MAX_MARKS; s++) {
          const d = hypot2(at[s * 2] - head.x, at[s * 2 + 1] - head.z);
          if (drawn[s] && d < near) {
            near = d;
            under = s;
          }
        }
      }
      const bob = reduce?.matches ? 0 : BOB * Math.sin(timeSec * Math.PI * 2 * BOB_HZ);
      let any = false;
      for (let s = 0; s < MAX_MARKS; s++) {
        const same = drawn[s] && marks.kind[s] !== MARK_NONE && marks.x[s] === at[s * 2] && marks.z[s] === at[s * 2 + 1];
        if (same) grow[s] = Math.min(1, grow[s] + step);
        else if (drawn[s] && grow[s] > 0) grow[s] = Math.max(0, grow[s] - step);
        else if (marks.kind[s] !== MARK_NONE) {
          // Shrunk away (or never drawn): the slot moves to its new marker and grows there.
          adopt(s);
          arrow[s] = 1;
          grow[s] = 0;
        } else drawn[s] = 0;
        arrow[s] = s === under ? Math.max(0, arrow[s] - step) : Math.min(1, arrow[s] + step);
        // Every slot, every frame: a free one's points lie collapsed where it last was.
        write(s, bob);
        any ||= drawn[s] === 1 && grow[s] > 0;
      }
      mesh.visible = any;
      if (any) {
        pos.clearUpdateRanges();
        pos.addUpdateRange(0, per * MAX_MARKS * 3);
        pos.needsUpdate = true;
      }
    },
  };
}
