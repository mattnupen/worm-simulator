import * as THREE from 'three';
import { DIST_CELL, DIST_N, DIST_REACH, type DisturbanceMap } from '../surface/disturbance';
import { litterTopHeight } from '../surface/litterDepth';
import { createWormShadowMaterial } from '../worm/wormMaterial';

/**
 * Two of the robin's warnings (V4 spec 1), with nothing new to compile:
 * - HuntShadow: a soft dark patch on the litter, the worm's contact-shadow material (the same
 *   multiply program, so no new shader; one draw while it shows). It sweeps over the worm as the
 *   robin flies in, then lies small under the robin's body while it stands.
 * - shiver(): the leaves round the worm twitch up and down for a moment, through the leaf
 *   disturbance map's body channel (the same channel the worm's own body lifts leaves with). The
 *   camera never moves. Off with reduced motion and on Low (leaves don't react there).
 * Neither allocates per step or frame.
 */

/** Rim points of the shadow's disc (plus its centre). */
const RIM = 18;
/** Just over the litter's top, as the worm's contact shadow lies. */
const LIFT = 0.05;

export class HuntShadow {
  readonly mesh: THREE.Mesh;
  private readonly pos: THREE.BufferAttribute;
  private readonly tint: THREE.Vector3;
  private readonly base = new THREE.Vector3(0.38, 0.32, 0.33);

  constructor(scene: THREE.Scene) {
    this.pos = new THREE.BufferAttribute(new Float32Array((RIM + 1) * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    // x: 1 at the centre, 0 at the rim (a soft edge); y: full strength (the tint sets how dark).
    const shade = new Float32Array((RIM + 1) * 2);
    shade[0] = 1;
    for (let i = 0; i <= RIM; i++) shade[i * 2 + 1] = 1;
    const idx: number[] = [];
    for (let i = 0; i < RIM; i++) idx.push(0, 1 + i, 1 + ((i + 1) % RIM));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.pos);
    geo.setAttribute('aShade', new THREE.BufferAttribute(shade, 2));
    geo.setIndex(idx);
    const material = createWormShadowMaterial();
    this.tint = (material.uniforms.uTint as { value: THREE.Vector3 }).value;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.name = 'huntShadow';
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** Hidden. */
  hide(): void {
    this.mesh.visible = false;
  }

  /**
   * An ellipse centred at (x, z), `across` wide (world units, side to side of `yaw`) and `along`
   * long, draped on the litter, `dark` (0 none to 1 as dark as the worm's own) over what is drawn.
   */
  place(x: number, z: number, yaw: number, across: number, along: number, dark: number): void {
    if (dark <= 0.01) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const t = this.tint;
    const b = this.base;
    t.set(1 + (b.x - 1) * dark, 1 + (b.y - 1) * dark, 1 + (b.z - 1) * dark);
    const out = this.pos.array as Float32Array;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    out[0] = x; out[1] = litterTopHeight(x, z) + LIFT; out[2] = z;
    for (let i = 0; i < RIM; i++) {
      const a = (i / RIM) * Math.PI * 2;
      const s = Math.sin(a) * across * 0.5;
      const f = Math.cos(a) * along * 0.5;
      const px = x + fz * s + fx * f;
      const pz = z - fx * s + fz * f;
      const k = (i + 1) * 3;
      out[k] = px; out[k + 1] = litterTopHeight(px, pz) + LIFT; out[k + 2] = pz;
    }
    this.pos.needsUpdate = true;
  }
}

/** The shiver: this long (s), twitching this many times a second (at most 3: never a flicker). */
export const SHIVER_S = 1.1;
const SHIVER_HZ = 3;
/** Twitch spots in rings round the worm's head (world units), each on its own beat. */
const RINGS = [1.4, 2.8] as const;
const PER_RING = 7;

/**
 * Stamps the shiver at `t` seconds into it round (hx, hz) into the map's body channel (re-stamped
 * by the crawl every step, so this lasts one step and the next stamp moves it). `limit`, `onTop`:
 * the crawl's reach (leafScale.ts), so it lifts leaves exactly as the worm's body would there.
 * Values only rise, as the body's own stamps do.
 */
export function shiver(m: DisturbanceMap, hx: number, hz: number, t: number, limit: number, onTop: number): void {
  if (t < 0 || t >= SHIVER_S) return;
  const env = Math.sin((Math.PI * t) / SHIVER_S);
  for (let r = 0; r < RINGS.length; r++) {
    for (let i = 0; i < PER_RING; i++) {
      const a = ((i + r * 0.5) / PER_RING) * Math.PI * 2;
      const beat = 0.5 + 0.5 * Math.sin(2 * Math.PI * SHIVER_HZ * t + i * 2.4 + r * 1.3);
      bodySpot(m, hx + Math.sin(a) * RINGS[r], hz + Math.cos(a) * RINGS[r], env * beat, limit, onTop);
    }
  }
}

/**
 * One spot in the body channel as a body point `under` the litter (1 under, 0 on top) would stamp
 * it (disturbance.ts stampSegment's nearness), leaving the path and trail alone: no furrow is left.
 */
function bodySpot(m: DisturbanceMap, x: number, z: number, under: number, limit: number, onTop: number): void {
  const off = (1 - under) * onTop;
  const range = Math.min(limit, DIST_REACH) - off;
  if (range <= 0) return;
  const d = m.data;
  const i0 = Math.max(0, Math.floor((x - range) / DIST_CELL) - m.ci);
  const i1 = Math.min(DIST_N - 1, Math.floor((x + range) / DIST_CELL) - m.ci);
  const j0 = Math.max(0, Math.floor((z - range) / DIST_CELL) - m.cj);
  const j1 = Math.min(DIST_N - 1, Math.floor((z + range) / DIST_CELL) - m.cj);
  for (let j = j0; j <= j1; j++) {
    const cz = (m.cj + j + 0.5) * DIST_CELL - z;
    for (let i = i0; i <= i1; i++) {
      const cx = (m.ci + i + 0.5) * DIST_CELL - x;
      const dist = Math.sqrt(cx * cx + cz * cz);
      if (dist >= range) continue;
      const near = 1 - (dist + off) / DIST_REACH;
      const k = (j * DIST_N + i) * 4 + 2;
      if (near > d[k]) d[k] = near;
    }
  }
}
