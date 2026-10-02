import * as THREE from 'three';
import { sharedLighting } from '../render/paintedMaterial';
import { terrainHeight } from '../surface/terrain';
import { radiusProfile } from './wormShape';
import { createWormShadowMaterial } from './wormMaterial';

/** Height of a point of ground under the worm (m). */
export type GroundFn = (x: number, z: number) => number;

/** Height of the ribbon above the worm's surface: just over most of the leaf litter. */
const SHADOW_LIFT = 0.07;
/** How far the shadow slides away from the sun, per unit of sun height. */
const SUN_SHIFT = 0.05;

/**
 * Soft contact shadow under the worm, in one draw: a narrow ribbon three vertices wide
 * (dark centre, clear edges) draped on the terrain beneath the body rings and multiplied
 * over whatever is already drawn there (ground and leaves). No shadow maps.
 */
export class WormShadow {
  readonly mesh: THREE.Mesh;
  private readonly pos: THREE.BufferAttribute;
  private readonly rings: Int16Array;

  /**
   * `m`: the tube's ring body coordinates; one shadow station every `step` rings. `groundAt`:
   * the surface the worm rests on, so the shadow follows it over and under the litter.
   */
  constructor(m: Float32Array, step: number, private readonly groundAt: GroundFn = terrainHeight) {
    const stations = Math.floor((m.length - 1) / step) + 1;
    this.rings = new Int16Array(stations);
    this.pos = new THREE.BufferAttribute(new Float32Array(stations * 9), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    const shade = new Float32Array(stations * 6);
    const idx: number[] = [];
    for (let q = 0; q < stations; q++) {
      const ring = q * step;
      this.rings[q] = ring;
      const strength = Math.min(1, radiusProfile(m[ring]) * 1.4) * 0.8;
      for (let e = 0; e < 3; e++) {
        shade[(q * 3 + e) * 2] = e === 1 ? 1 : 0;
        shade[(q * 3 + e) * 2 + 1] = strength;
      }
      if (q > 0) {
        const a = (q - 1) * 3;
        const b = q * 3;
        idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.pos);
    geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 2));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, createWormShadowMaterial());
    this.mesh.frustumCulled = false;
    this.mesh.name = 'wormShadow';
  }

  /** Re-drapes the ribbon under ring centres `c` (xyz), tangents `T` and lateral radii `rB`. */
  update(c: Float32Array, T: Float32Array, rB: Float32Array): void {
    const out = this.pos.array as Float32Array;
    const L = sharedLighting.uLightDir.value;
    const ly = Math.max(0.2, L.y);
    const ox = (-L.x / ly) * SUN_SHIFT;
    const oz = (-L.z / ly) * SUN_SHIFT;
    for (let q = 0; q < this.rings.length; q++) {
      const i = this.rings[q];
      const o = i * 3;
      // Sideways on the ground: the tangent turned a quarter around the vertical.
      let sx = T[o + 2];
      let sz = -T[o];
      const half = (rB[i] * 1.6 + 0.04) / (Math.hypot(sx, sz) || 1);
      sx *= half;
      sz *= half;
      for (let e = 0; e < 3; e++) {
        const x = c[o] + ox + sx * (e - 1);
        const z = c[o + 2] + oz + sz * (e - 1);
        const v = (q * 3 + e) * 3;
        out[v] = x;
        out[v + 1] = this.groundAt(x, z) + SHADOW_LIFT;
        out[v + 2] = z;
      }
    }
    this.pos.needsUpdate = true;
  }
}
