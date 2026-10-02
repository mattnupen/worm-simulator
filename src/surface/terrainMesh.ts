import * as THREE from 'three';
import { fbm2, valueNoise2 } from '../core/noise';
import { createPaintedMaterial, sharedLighting } from '../render/paintedMaterial';
import { makeShadeAt } from './treeShadows';
import { terrainHeight, WORLD_HALF } from './terrain';
import { groundHeight, groundNormal, litterDepth } from './litterDepth';

/** Uniform grid spacing covers +-INNER; a few wide rings reach out to +-OUTER under the fog. */
const INNER = WORLD_HALF + 2;
const OUTER = 50;
const INNER_SEGS = 88;
const OUTER_SEGS = 8;

/** Grid line coordinates: dense and uniform over the play area, coarse beyond it. */
function gridLines(): number[] {
  const out: number[] = [];
  for (let i = OUTER_SEGS; i > 0; i--) {
    const t = i / OUTER_SEGS;
    out.push(-(INNER + (OUTER - INNER) * t * t));
  }
  for (let i = 0; i <= INNER_SEGS; i++) out.push(-INNER + (2 * INNER * i) / INNER_SEGS);
  for (let i = 1; i <= OUTER_SEGS; i++) {
    const t = i / OUTER_SEGS;
    out.push(INNER + (OUTER - INNER) * t * t);
  }
  return out;
}

// Painted forest-floor palette (sRGB hex; converted to linear by THREE.Color).
const SOIL = new THREE.Color('#6e4a2c');
const DAMP = new THREE.Color('#3d2a1b');
const MOSS = new THREE.Color('#5f6a2e');
const DRY = new THREE.Color('#a8804e');
const LOAM = new THREE.Color('#87582f');
const FAR = new THREE.Color('#5a4630');
/** Packed, half-rotted leaves: the colour of a deep pile's body. */
const LITTER = new THREE.Color('#8a5a2e');

const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Bakes soil, damp hollows, moss and dry litter into one colour (linear RGB). */
export function groundColor(x: number, z: number, h: number, out: THREE.Color): THREE.Color {
  const broad = fbm2(x * 0.09, z * 0.09, 3, 11);
  const mid = fbm2(x * 0.35, z * 0.35, 3, 23);
  // ~1.25 m features: comfortably above the 0.5 m vertex grid's Nyquist limit.
  const fleck = valueNoise2(x * 0.8, z * 0.8, 37);
  out.copy(SOIL).lerp(LOAM, smooth(0.35, 0.7, mid) * 0.7);
  // Hollows hold water: darker, damper soil and more moss.
  const hollow = smooth(0.05, -0.25, h);
  const damp = Math.max(smooth(0.52, 0.72, broad), hollow * 0.8);
  out.lerp(DAMP, damp * 0.75);
  const moss = smooth(0.6, 0.8, fbm2(x * 0.22 + 5, z * 0.22, 3, 51)) * (0.45 + 0.55 * damp);
  out.lerp(MOSS, moss * 0.7);
  // Rises dry out: pale, sun-bleached litter.
  const dry = smooth(0.5, 0.75, 1 - broad) * smooth(-0.05, 0.3, h) + smooth(0.78, 0.95, fleck) * 0.35;
  out.lerp(DRY, Math.min(1, dry) * 0.6);
  // Beyond the world edge, settle into a quieter, darker tone that the fog will soften.
  const edge = smooth(WORLD_HALF, WORLD_HALF + 6, Math.max(Math.abs(x), Math.abs(z)));
  out.lerp(FAR, edge * 0.6);
  return out;
}

export function buildTerrainGeometry(): THREE.BufferGeometry {
  const lines = gridLines();
  const n = lines.length;
  const pos = new Float32Array(n * n * 3);
  const nor = new Float32Array(n * n * 3);
  const col = new Float32Array(n * n * 3);
  const c = new THREE.Color();
  const shadeAt = makeShadeAt(sharedLighting.uLightDir.value);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = (j * n + i) * 3;
      const x = lines[i];
      const z = lines[j];
      // The soil plus the solid litter mound, so deep piles are real mounds under their leaves.
      const h = groundHeight(x, z);
      const nn = groundNormal(x, z);
      pos[k] = x;
      pos[k + 1] = h;
      pos[k + 2] = z;
      nor[k] = nn.x;
      nor[k + 1] = nn.y;
      nor[k + 2] = nn.z;
      groundColor(x, z, terrainHeight(x, z), c).lerp(LITTER, smooth(0.05, 0.2, litterDepth(x, z)) * 0.6);
      c.multiplyScalar(shadeAt(x, z));
      col[k] = c.r;
      col[k + 1] = c.g;
      col[k + 2] = c.b;
    }
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let p = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      const b = a + 1;
      const d = a + n;
      const e = d + 1;
      // Counter-clockwise seen from above (+y), so the front face points up.
      idx[p++] = a; idx[p++] = d; idx[p++] = b;
      idx[p++] = b; idx[p++] = d; idx[p++] = e;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

export function buildTerrain(): THREE.Mesh {
  const mesh = new THREE.Mesh(
    buildTerrainGeometry(),
    createPaintedMaterial({ color: '#ffffff', brush: 1, vertexColors: true }),
  );
  mesh.name = 'terrain';
  return mesh;
}
