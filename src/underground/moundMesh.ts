import * as THREE from 'three';
import { litterTopHeight } from '../surface/litterDepth';
import { createPropMaterial } from '../render/propMaterial';
import { cameraProgress, type ModeState } from './modeMachine';
import type { Openings } from './openings';
import type { Mounds } from './mounds';
import { markShape } from './digMarkShape';

/**
 * The casting mounds drawn (mounds.ts; V4 spec, revision 1 item 3): one mesh, one draw call, on the
 * plain props material (its program is already compiled for the ground props: nothing new
 * compiles). Each mound gets a copy of the mound's shape (digMarkShape.ts: castings round an open
 * hole), laid on the drawn top of the leaves, written once at load. A mound with an opening on it
 * collapses to a point (its midden, middens.ts, stands there instead) and is written back when the
 * openings are cleared. Nothing is allocated per frame.
 */

export interface MoundView {
  readonly mounds: Mounds;
  readonly mesh: THREE.Mesh;
  /**
   * Each step or frame: mounds under an opening hide (and stop lifting the worm), and the mesh is
   * shown as the middens are (middens.ts show: on the surface, and down to halfway through the
   * camera's move below). `shown` false hides it whatever the mode.
   */
  sync(o: Openings, s: ModeState, shown?: boolean): void;
}

export function createMoundView(mounds: Mounds): MoundView {
  const shape = markShape();
  const per = shape.pos.length / 3;
  const n = mounds.count;
  if (per * n > 0xffff) throw new Error('moundMesh: too many mounds for 16-bit indices');
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(per * n * 3), 3);
  const nor = new THREE.BufferAttribute(new Float32Array(per * n * 3), 3);
  const prop = new THREE.BufferAttribute(new Float32Array(per * n * 4), 4);
  const index = new THREE.BufferAttribute(new Uint16Array(shape.index.length * n), 1);
  /** The drawn top of the leaves under each point of each mound (the ground does not change). */
  const ground = new Float32Array(per * n);
  const ia = index.array as Uint16Array;
  for (let s = 0; s < n; s++) {
    (nor.array as Float32Array).set(shape.nor, s * per * 3);
    (prop.array as Float32Array).set(shape.prop, s * per * 4);
    for (let i = 0; i < shape.index.length; i++) ia[s * shape.index.length + i] = shape.index[i] + s * per;
    for (let i = 0; i < per; i++) {
      ground[s * per + i] = litterTopHeight(mounds.x[s] + shape.pos[i * 3], mounds.z[s] + shape.pos[i * 3 + 2]);
    }
  }
  geo.setAttribute('position', pos);
  geo.setAttribute('normal', nor);
  geo.setAttribute('aProp', prop);
  geo.setIndex(index);
  const mesh = new THREE.Mesh(geo, createPropMaterial());
  mesh.name = 'mounds';
  // Spread over the whole play area: some are always in view, so culling the mesh never pays.
  mesh.frustumCulled = false;

  /** Whether each mound's points are written as shown (-1: not yet written). */
  const written = new Int8Array(n).fill(-1);
  let version = -1;

  /** Writes mound s's points: its shape on the ground when shown, else collapsed to its centre. */
  function write(s: number, on: number): void {
    written[s] = on;
    const p = pos.array as Float32Array;
    const x = mounds.x[s];
    const z = mounds.z[s];
    const o = s * per * 3;
    for (let i = 0; i < per; i++) {
      const j = i * 3;
      p[o + j] = x + shape.pos[j] * on;
      p[o + j + 1] = ground[s * per + i] + shape.pos[j + 1] * on;
      p[o + j + 2] = z + shape.pos[j + 2] * on;
    }
  }

  function update(): void {
    if (mounds.version === version) return;
    version = mounds.version;
    let changed = false;
    for (let s = 0; s < n; s++) {
      if (written[s] === mounds.shown[s]) continue;
      write(s, mounds.shown[s]);
      changed = true;
    }
    if (changed) {
      pos.clearUpdateRanges();
      pos.addUpdateRange(0, per * n * 3);
      pos.needsUpdate = true;
    }
  }
  update();

  return {
    mounds,
    mesh,
    sync(o, s, shown = true) {
      mounds.sync(o);
      update();
      mesh.visible = shown && n > 0 && (s.mode === 'surface' || (s.mode !== 'underground' && cameraProgress(s) < 0.5));
    },
  };
}
