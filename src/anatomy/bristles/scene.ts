import * as THREE from 'three';
import { BRISTLE, PERIOD, PIECE, REACH, WALL, bristleGeometry, bristleOut } from './shapes';
import { WormBody } from './body';
import { Soil } from './soil';

/** The segment the close-up looks at. */
export const HERO = 10;

/**
 * The bristle close-up (Matt, 2026-10-24): the front 20 segments of a nightcrawler, cut open along
 * its middle, digging through soil. A squeeze passes from head to tail as one smooth wave. Where
 * the body is squeezed short and fat its bristles push out and grip, so it holds still against the
 * soil, while the long, thin stretches pull theirs in and slide forward. The pointed head pushes
 * into solid soil like a wedge, then swells and shoves the grains aside (soil.ts). The worm stays
 * in view and the soil slides back past it. Plain materials and a few small dynamic meshes: cheap
 * to draw, built once when first opened.
 */
export class BristleScene {
  readonly group = new THREE.Group();
  /** Seconds of the animation shown. */
  time = 0;
  private readonly body = new WormBody();
  private readonly soil: Soil;
  private readonly bristles: { k: number; near: THREE.Mesh; far: THREE.Mesh; sac: THREE.Mesh; muscles: THREE.Mesh[] }[] = [];
  /** How far the worm has crawled (mm, negative as it goes forward): the soil slides back by this. */
  private travelled = 0;
  private readonly before = new Float64Array(PIECE);
  private whole = false;
  private readonly tmp = new THREE.Vector3();

  constructor() {
    this.group.name = 'bristles';
    this.body.pose(0);
    this.soil = new Soil(this.body.x[0]);
    this.group.add(this.body.far, this.body.near, this.soil.group);
    const rod = bristleGeometry();
    const amber = new THREE.MeshStandardMaterial({ color: '#b07a32', roughness: 0.3, metalness: 0.05 });
    const sacMat = new THREE.MeshStandardMaterial({ color: '#f3d6c8', roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false });
    const muscleMat = new THREE.MeshStandardMaterial({ color: '#a83a44', roughness: 0.65 });
    const unit = new THREE.CylinderGeometry(1, 1, 1, 8);
    // Every segment but the first has bristles: the belly pair, one either side of the cut.
    for (let i = 1; i < PIECE; i++) {
      const near = new THREE.Mesh(rod, amber);
      const far = new THREE.Mesh(rod, amber);
      const sac = new THREE.Mesh(unit, sacMat);
      const muscles = [0, 1, 2].map(() => new THREE.Mesh(unit, muscleMat));
      this.group.add(near, far, sac, ...muscles);
      this.bristles.push({ k: this.body.ringAt(i + 0.5), near, far, sac, muscles });
    }
    this.update(0);
  }

  /** The close-up shows the body cut open, its pockets and muscles; the crawl shows it whole. */
  setMode(mode: 'close' | 'crawl'): void {
    this.whole = mode === 'crawl';
    this.body.near.visible = this.whole;
    this.update(0);
  }

  /** Steps the animation by `dt` seconds and poses everything. */
  update(dt: number): void {
    this.time += dt;
    const { body } = this;
    this.bristles.forEach((b, i) => { this.before[i] = body.x[b.k]; });
    body.pose(this.time / PERIOD);
    // Whatever grips holds still against the soil: the soil moves with the gripping places,
    // weighted by how far their bristles are out, so the motion is smooth.
    let moved = 0;
    let weight = 0;
    this.bristles.forEach((b, i) => {
      const w = bristleOut(body.s[b.k]);
      moved += w * (body.x[b.k] - this.before[i]);
      weight += w;
    });
    if (dt > 0 && weight > 0.01) this.travelled += moved / weight;
    this.soil.update(body, this.travelled);
    for (const b of this.bristles) this.poseBristles(b);
  }

  /** How squeezed the close-up's segment is now (0 long and thin, 1 short and fat). */
  heroSqueeze(): number {
    return this.body.s[this.bristles[HERO - 1].k];
  }

  /** How squeezed the head is now: long and pointed (0) or swollen (1). */
  headSqueeze(): number {
    return this.body.s[this.body.ringAt(0.5)];
  }

  /** The tip of the close-up's front bristle, in the group's space. */
  heroTip(out: THREE.Vector3): THREE.Vector3 {
    const b = this.bristles[HERO - 1].near;
    return out.set(-0.07, -BRISTLE, 0).applyQuaternion(b.quaternion).add(b.position);
  }

  /** The tip of the head, in the group's space. */
  headEnd(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.body.x[0], this.body.lift[0], 0);
  }

  private poseBristles(b: (typeof this.bristles)[number]): void {
    const x = this.body.x[b.k];
    const r = this.body.r[b.k];
    const e = bristleOut(this.body.s[b.k]);
    const { near, far, sac, muscles } = b;
    for (const m of [sac, ...muscles]) m.visible = !this.whole;
    // Pulled in, the tip sits just under the skin; pushed out, it reaches into the soil, leaning back.
    const baseY = -(r - BRISTLE + 0.04) - e * REACH;
    for (const [m, z] of [[near, 0.24], [far, -0.24]] as const) {
      m.position.set(x, baseY, z);
      m.rotation.set(0, 0, -0.5 * e);
    }
    if (this.whole) return;
    // Its pocket in the body wall, from just inside the inner end out to the skin.
    const sacTop = -(r - BRISTLE - 0.02) - e * REACH * 0.35;
    this.place(sac, x, sacTop, x, -r + 0.02, 0.24, 0.13);
    // Two muscles push the pocket out (they bunch up as it goes), one pulls it back in.
    const outer = -(r - 0.15);
    this.place(muscles[0], x, sacTop, x + 0.55, outer, 0.24, 0.026 * (1 + 0.6 * e));
    this.place(muscles[1], x, sacTop, x - 0.55, outer, 0.24, 0.026 * (1 + 0.6 * e));
    this.place(muscles[2], x, sacTop, x - 0.6, -(r - WALL - 0.05), 0.24, 0.026 * (1 + 0.6 * (1 - e)));
  }

  /** Stretches a unit cylinder from (x0, y0) to (x1, y1) at depth z, `radius` thick. */
  private place(m: THREE.Mesh, x0: number, y0: number, x1: number, y1: number, z: number, radius: number): void {
    const d = this.tmp.set(x1 - x0, y1 - y0, 0);
    const len = d.length();
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    m.scale.set(radius, len, radius);
  }
}

const UP = new THREE.Vector3(0, 1, 0);
