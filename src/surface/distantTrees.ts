import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/random';
import { createPaintedMaterial } from '../render/paintedMaterial';
import { terrainHeight, WORLD_HALF } from './terrain';
import { scaleSpec } from './worldScale';

/** The most trees the distant ring holds (Classic); each mode draws min(this, its distantCount). */
export const RING_COUNT = 72;

function colored(g: THREE.BufferGeometry, hex: string): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(hex);
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.deleteAttribute('uv');
  return geo;
}

const CROWN_CENTRE = new THREE.Vector3(0, 12.3, 0);

/**
 * A soft crown blob: smooth normals blended toward the whole crown's centre (so the three
 * blobs shade as one soft mass, not facets), lighter on top and darker underneath.
 */
function crownBlob(x: number, y: number, z: number, r: number, detail: number): THREE.BufferGeometry {
  const geo = colored(new THREE.IcosahedronGeometry(r, detail).translate(x, y, z), '#c9772f');
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  const col = geo.getAttribute('color');
  const p = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    a.set(p.x - x, p.y - y, p.z - z).normalize();
    b.copy(p).sub(CROWN_CENTRE).normalize();
    a.multiplyScalar(0.5).addScaledVector(b, 0.5).normalize();
    nor.setXYZ(i, a.x, a.y, a.z);
    const shade = 0.78 + 0.3 * (a.y * 0.5 + 0.5);
    col.setXYZ(i, col.getX(i) * shade, col.getY(i) * shade, col.getZ(i) * shade);
  }
  return geo;
}

/** One low-detail tree: a tapered trunk and three soft crown blobs (~130 triangles). */
function treeGeometry(): THREE.BufferGeometry {
  const trunk = colored(new THREE.CylinderGeometry(0.28, 0.45, 13, 5, 1, true).translate(0, 6.5, 0), '#6d6458');
  const crowns = [
    crownBlob(0, 12.5, 0, 2.8, 1),
    crownBlob(1.3, 10.5, 0.6, 2.1, 0),
    crownBlob(-1.1, 14.2, -0.5, 2.0, 0),
  ];
  const merged = mergeGeometries([trunk, ...crowns]);
  if (!merged) throw new Error('distant tree geometry merge failed');
  return merged;
}

const TINTS = ['#ffffff', '#f2d7a8', '#e6b98a', '#d9d0b8', '#c8a07a'];

/**
 * A ring of simple, fog-softened tree silhouettes on the berm beyond the playable area, sized
 * and spaced for the active scale mode (bigger trees, fewer of them). One instanced draw call.
 * They exist only for depth; the haze does most of the work.
 */
export function buildDistantTrees(): THREE.InstancedMesh {
  const { distantScale, distantCount } = scaleSpec();
  const count = Math.min(RING_COUNT, distantCount);
  const mesh = new THREE.InstancedMesh(
    treeGeometry(),
    createPaintedMaterial({ color: '#ffffff', brush: 0.5, vertexColors: true }),
    count,
  );
  const rng = mulberry32(99);
  const tmp = new THREE.Object3D();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rng() - 0.5) * 0.08;
    const r = WORLD_HALF + 5 + rng() * 14;
    // Push out along a rounded square so the ring follows the square world's edge.
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const sq = Math.sqrt(Math.sqrt(ca ** 4 + sa ** 4));
    const x = (ca / sq) * r;
    const z = (sa / sq) * r;
    tmp.position.set(x, terrainHeight(x, z) - 0.4, z);
    tmp.rotation.set(0, rng() * Math.PI * 2, 0);
    const s = (0.75 + rng() * 0.6) * distantScale;
    tmp.scale.set(s, s * (0.85 + rng() * 0.35), s);
    tmp.updateMatrix();
    mesh.setMatrixAt(i, tmp.matrix);
    mesh.setColorAt(i, c.set(TINTS[Math.floor(rng() * TINTS.length)]));
  }
  mesh.name = 'distantTrees';
  return mesh;
}
