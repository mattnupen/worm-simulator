import * as THREE from 'three';

// The draw calls three r186's WebGLRenderer would issue, counted headlessly (drawBudget.test.ts,
// drawBudgetUnder.test.ts): its projectObject's rules, then each render item's.

/** The draw-call budget (visual-quality-brief.md: up to 40 per frame on every preset). */
export const BUDGET = 40;

const frustum = new THREE.Frustum();
const viewProj = new THREE.Matrix4();

/** Draws one render item issues (renderBufferDirect): none for an empty range or no instances. */
function itemDraws(o: THREE.Object3D, g: THREE.BufferGeometry, m: THREE.Material, group: { start: number; count: number } | null): number {
  let start = g.drawRange.start;
  let end = start + g.drawRange.count;
  if (group) {
    start = Math.max(start, group.start);
    end = Math.min(end, group.start + group.count);
  }
  const pos = g.getAttribute('position');
  if (g.index || pos) {
    start = Math.max(start, 0);
    end = Math.min(end, g.index ? g.index.count : pos.count);
  }
  const count = end - start;
  if (!(count > 0) || count === Infinity) return 0;
  if ((o as THREE.InstancedMesh).isInstancedMesh && (o as THREE.InstancedMesh).count === 0) return 0;
  const ig = g as THREE.InstancedBufferGeometry & { _maxInstanceCount?: number };
  if (ig.isInstancedBufferGeometry && Math.min(ig.instanceCount, ig._maxInstanceCount ?? Infinity) === 0) return 0;
  // A transparent double-sided material draws its back faces, then its front faces.
  return m.transparent && m.side === THREE.DoubleSide && !m.forceSinglePass ? 2 : 1;
}

/** The draw calls renderer.render(scene, camera) makes: three r186's projectObject, then each item. */
export function countDraws(scene: THREE.Scene, camera: THREE.Camera): number {
  scene.updateMatrixWorld();
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  let n = 0;
  scene.traverseVisible((o) => {
    const r = o as THREE.Mesh;
    if (!o.layers.test(camera.layers) || !(r.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine)) return;
    if (r.frustumCulled && !frustum.intersectsObject(r)) return;
    if (Array.isArray(r.material)) {
      for (const group of r.geometry.groups) {
        const m = r.material[group.materialIndex ?? 0];
        if (m && m.visible) n += itemDraws(o, r.geometry, m, group);
      }
    } else if (r.material.visible) {
      n += itemDraws(o, r.geometry, r.material, null);
    }
  });
  return n;
}
