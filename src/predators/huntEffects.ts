import * as THREE from 'three';
import { litterTopHeight } from '../surface/litterDepth';
import type { HeroLeaves } from '../surface/heroLeaves';
import { UNITS_PER_CM } from '../surface/realScale';
import { createWormShadowMaterial } from '../worm/wormMaterial';
import { HUNT, type HuntState } from './hunt';
import type { RobinPose } from './robin';
import type { Crawl } from '../game/crawl';

/**
 * Two of the robin's warnings (V4 spec 1), with nothing new to compile:
 * - HuntShadow: a soft dark patch on the litter, the worm's contact-shadow material (the same
 *   multiply program, so no new shader; one draw while it shows). It sweeps over the worm as the
 *   robin flies in, then lies small under the robin's body while it stands.
 * - gust(): the loose leaves by the worm (the hero leaves, with their own physics) hop and turn
 *   with each wingbeat's puff for a moment, then settle by themselves. The camera never moves.
 *   Off with reduced motion. (The litter's own leaves only move through the disturbance map,
 *   which can lift leaves resting low or slide them along a trail: neither shivers the top
 *   leaves without leaving a furrow or flickering the ground's trail shading, so it isn't used.)
 * Neither allocates per step or frame.
 */

/** Rim points of the shadow's disc (plus its centre). */
const RIM = 18;
/** Just over the litter's top, as the worm's contact shadow lies. */
const LIFT = 0.05;
/** A robin's spread wings (about 38 cm), and its body standing (cm). */
const WINGS = 38 * UNITS_PER_CM;
const BODY = 9 * UNITS_PER_CM;

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

  /** Under robin `p` (hunt `h`): sweeping in under it as it flies in, then under its body, spreading and fading as it rises. */
  follow(h: Readonly<HuntState>, p: Readonly<RobinPose>): void {
    if (!p.visible) return this.hide();
    if (h.phase === 'arrive' && h.t < HUNT.flyIn) {
      const k = h.t / HUNT.flyIn;
      return this.place(p.x, p.z, h.away, WINGS, BODY * 1.6, 0.35 + 0.4 * k * k * (3 - 2 * k));
    }
    const up = Math.min(1, p.lift / 40);
    this.place(p.x, p.z, p.yaw, BODY + (WINGS - BODY) * up, (BODY + 4 * UNITS_PER_CM * up) * 1.3, 0.75 * (1 - up));
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

/**
 * The leaves' shiver (V4 spec 1 and 6.1): for this long (s) after the robin's warning, this many
 * puffs of air a second from its wings (at most 3: never a flicker). Each puff is a gust (below).
 */
export const SHIVER_S = 1.1;
export const GUSTS = 3;

/** The gust's hop (world units a second, up) and spin (radians a second) for a loose leaf. */
const GUST_HOP = 0.9;
const GUST_SPIN = 2.2;

/**
 * A puff of air from the robin's wings: every loose leaf near the worm (the hero leaves, with their
 * own physics) hops a little and turns, then settles back by itself. `n` varies which way each
 * turns, so successive puffs don't all spin one way.
 */
export function gust(p: HeroLeaves, n: number): void {
  for (let i = 0; i < p.count; i++) {
    const k = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
    const r = k - Math.floor(k);
    p.vy[i] += GUST_HOP * (0.6 + 0.4 * r);
    p.spin[i] += GUST_SPIN * (r * 2 - 1);
  }
}

/** The camera looks up while the robin stands within this many cm of the head, most at LOOK_FULL_CM. */
const LOOK_FROM_CM = 60;
const LOOK_FULL_CM = 18;
/** How fast the look-up eases in and out (1/s): gentle, never a snap. */
const LOOK_RATE = 1.6;
const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** Eases the crawl camera's look-up toward the robin (posed `p`) standing close to the head (`surface`: on the surface). */
export function lookUp(c: Crawl, h: HuntState, p: RobinPose, dt: number, surface: boolean): void {
  let want = 0;
  const grounded = h.phase === 'stare' || h.phase === 'dash' || h.phase === 'strike' || h.phase === 'grab'
    || h.phase === 'miss' || (h.phase === 'arrive' && h.t >= HUNT.flyIn);
  if (surface && grounded) {
    const head = c.motion.head;
    const d = Math.hypot(p.x - head.x, p.z - head.z) / UNITS_PER_CM;
    want = smooth((LOOK_FROM_CM - d) / (LOOK_FROM_CM - LOOK_FULL_CM));
  }
  c.lookUp += (want - c.lookUp) * (1 - Math.exp(-LOOK_RATE * dt));
}
