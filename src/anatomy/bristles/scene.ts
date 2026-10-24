import * as THREE from 'three';
import {
  BRISTLE, FLOOR, LAYERS, PERIOD, PIECE, RADIUS, REACH, SEG, WALL, bristleGeometry, bristleOut, capScale, groove,
  segLength, segRadius, squeeze,
} from './shapes';

/** Rings per segment and points round the far half of the body. */
const RINGS = 6;
const AROUND = 24;
/** The soil repeats every this many mm, so it can slide past for ever. */
const TILE = 14;
/** The segment the close-up looks at. */
export const HERO = 10;

const COLORS = {
  back: new THREE.Color('#5e2a32'),
  belly: new THREE.Color('#e2bf9f'),
  circular: new THREE.Color('#b9474f'),
  longitudinal: new THREE.Color('#d98a84'),
  lining: new THREE.Color('#d6a49a'),
};

/**
 * The bristle close-up (Matt, 2026-10-24): the front 20 segments of a nightcrawler, cut open along its
 * middle, crawling through a tunnel in the soil. A squeeze passes from head to tail; a segment
 * squeezed short and fat pushes its bristles out into the soil and holds still, while long, thin
 * segments pull theirs in and slide forward. The soil slides back past a worm that stays in view.
 * Only plain materials and one small dynamic mesh: cheap to draw, built once when first opened.
 */
export class BristleScene {
  readonly group = new THREE.Group();
  /** Seconds of the animation shown. */
  time = 0;
  private readonly body: THREE.Mesh;
  private readonly pos: THREE.BufferAttribute;
  /** The near half's skin: closed for the crawl, left off for the cut-open close-up. */
  private readonly near: THREE.Mesh;
  private readonly nearPos: THREE.BufferAttribute;
  private readonly soil = new THREE.Group();
  private readonly bristles: { near: THREE.Mesh; far: THREE.Mesh; sac: THREE.Mesh; muscles: THREE.Mesh[] }[] = [];
  /** Where each segment's front end and middle are, along the body (mm), and its squeeze. */
  private readonly front = new Float64Array(PIECE);
  private readonly squeezes = new Float64Array(PIECE);
  /** How far the worm has crawled (mm): the soil slides back by this. */
  private travelled = 0;
  private anchor = -1;
  private anchorAt = 0;
  private readonly tmp = new THREE.Vector3();

  constructor() {
    this.group.name = 'bristles';
    const verts = PIECE * RINGS * (AROUND + 1) * 2 + PIECE * RINGS * 2 * 3 * 2;
    this.pos = new THREE.BufferAttribute(new Float32Array(verts * 3), 3);
    this.pos.setUsage(THREE.DynamicDrawUsage);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', this.pos);
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    geo.setIndex(this.indices(geo.getAttribute('color') as THREE.BufferAttribute));
    this.body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, side: THREE.DoubleSide }));
    this.body.frustumCulled = false;
    const nverts = PIECE * RINGS * (AROUND + 1);
    this.nearPos = new THREE.BufferAttribute(new Float32Array(nverts * 3), 3);
    this.nearPos.setUsage(THREE.DynamicDrawUsage);
    const ngeo = new THREE.BufferGeometry();
    ngeo.setAttribute('position', this.nearPos);
    const ncol = new THREE.BufferAttribute(new Float32Array(nverts * 3), 3);
    ngeo.setAttribute('color', ncol);
    ngeo.setIndex(nearIndices(ncol));
    this.near = new THREE.Mesh(ngeo, this.body.material);
    this.near.frustumCulled = false;
    this.near.visible = false;
    this.group.add(this.body, this.near, this.soil);

    const rod = bristleGeometry();
    const amber = new THREE.MeshStandardMaterial({ color: '#b07a32', roughness: 0.3, metalness: 0.05 });
    const sacMat = new THREE.MeshStandardMaterial({ color: '#f3d6c8', roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false });
    const muscleMat = new THREE.MeshStandardMaterial({ color: '#a83a44', roughness: 0.65 });
    const unit = new THREE.CylinderGeometry(1, 1, 1, 8);
    for (let i = 0; i < PIECE; i++) {
      // The two belly bristles of a pair: one just in front of the cut, one just behind it.
      const near = new THREE.Mesh(rod, amber);
      const far = new THREE.Mesh(rod, amber);
      const sac = new THREE.Mesh(unit, sacMat);
      const muscles = [0, 1, 2].map(() => new THREE.Mesh(unit, muscleMat));
      this.group.add(near, far, sac, ...muscles);
      this.bristles.push({ near, far, sac, muscles });
    }
    this.buildSoil();
    this.update(0);
  }

  /** The close-up shows the body cut open, its pockets and muscles; the crawl shows it whole. */
  setMode(mode: 'close' | 'crawl'): void {
    this.near.visible = mode === 'crawl';
    this.whole = mode === 'crawl';
    this.update(0);
  }

  private whole = false;

  /** Steps the animation by `dt` seconds and poses everything. */
  update(dt: number): void {
    this.time += dt;
    const phase = this.time / PERIOD;
    let total = 0;
    for (let i = PIECE - 1; i >= 0; i--) {
      this.squeezes[i] = squeeze(i, phase);
      total += segLength(this.squeezes[i]);
      this.front[i] = total;
    }
    // The most squeezed segment grips: it holds still against the soil while the rest moves.
    let grip = 0;
    for (let i = 1; i < PIECE; i++) if (this.squeezes[i] > this.squeezes[grip]) grip = i;
    const mid = this.front[grip] - segLength(this.squeezes[grip]) / 2;
    if (grip === this.anchor) this.travelled += mid - this.anchorAt;
    this.anchor = grip;
    this.anchorAt = mid;
    const shift = (PIECE * SEG) / 2;
    this.soil.position.x = ((this.travelled % TILE) + TILE) % TILE - TILE / 2;
    this.writeBody(shift);
    for (let i = 0; i < PIECE; i++) this.poseBristles(i, this.front[i] - segLength(this.squeezes[i]) / 2 - shift);
  }

  /** How squeezed the close-up's segment is now (0 long and thin, 1 short and fat). */
  heroSqueeze(): number {
    return this.squeezes[HERO];
  }

  /** The tip of the close-up's front bristle, in the group's space. */
  heroTip(out: THREE.Vector3): THREE.Vector3 {
    const b = this.bristles[HERO].near;
    return out.set(-0.07, -BRISTLE, 0).applyQuaternion(b.quaternion).add(b.position);
  }

  /** The front of the head, in the group's space. */
  headEnd(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.front[0] - (PIECE * SEG) / 2 - 0.4, 0.4, 0);
  }

  private poseBristles(i: number, x: number): void {
    const s = this.squeezes[i];
    const e = bristleOut(s);
    const r = segRadius(s);
    const { near, far, sac, muscles } = this.bristles[i];
    const visible = i > 0;
    for (const m of [near, far]) m.visible = visible;
    for (const m of [sac, ...muscles]) m.visible = visible && !this.whole;
    if (!visible) return;
    // Pulled in, the tip sits just under the skin; pushed out, it reaches into the soil, leaning back.
    const baseY = -(r - BRISTLE + 0.04) - e * REACH;
    for (const [m, z] of [[near, 0.24], [far, -0.24]] as const) {
      m.position.set(x, baseY, z);
      m.rotation.set(0, 0, -0.5 * e);
    }
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

  /** The far half of the body (outside skin and inside lining), and the cut faces top and bottom. */
  private writeBody(shift: number): void {
    const p = this.pos.array as Float32Array;
    let o = 0;
    for (let i = 0; i < PIECE; i++) {
      const s = this.squeezes[i];
      const len = segLength(s);
      for (let k = 0; k < RINGS; k++) {
        const u = k / (RINGS - 1);
        const x = this.front[i] - u * len - shift;
        const outer = segRadius(s) * capScale(i, u) * groove(u);
        const inner = Math.max(0, outer - WALL);
        for (const r of [outer, inner]) {
          for (let j = 0; j <= AROUND; j++) {
            const th = (j / AROUND) * Math.PI;
            p[o++] = x; p[o++] = r * Math.cos(th); p[o++] = -r * Math.sin(th);
          }
        }
        // The cut faces: three layers each, top (y > 0) and bottom.
        for (const sign of [1, -1]) {
          let at = outer;
          for (const t of LAYERS) {
            const next = Math.max(0, at - t);
            p[o++] = x; p[o++] = sign * at; p[o++] = 0;
            p[o++] = x; p[o++] = sign * next; p[o++] = 0;
            at = next;
          }
        }
      }
    }
    this.pos.needsUpdate = true;
    this.body.geometry.computeVertexNormals();
    if (!this.whole) return;
    const q = this.nearPos.array as Float32Array;
    let w = 0;
    for (let i = 0; i < PIECE; i++) {
      const s = this.squeezes[i];
      const len = segLength(s);
      for (let k = 0; k < RINGS; k++) {
        const u = k / (RINGS - 1);
        const x = this.front[i] - u * len - shift;
        const r = segRadius(s) * capScale(i, u) * groove(u);
        for (let j = 0; j <= AROUND; j++) {
          const th = (j / AROUND) * Math.PI;
          q[w++] = x; q[w++] = r * Math.cos(th); q[w++] = r * Math.sin(th);
        }
      }
    }
    this.nearPos.needsUpdate = true;
    this.near.geometry.computeVertexNormals();
  }

  /** Triangles for the body and its colours, which never change. */
  private indices(color: THREE.BufferAttribute): number[] {
    const idx: number[] = [];
    const c = color.array as Float32Array;
    const per = (AROUND + 1) * 2 + 12;
    const tmp = new THREE.Color();
    for (let ring = 0; ring < PIECE * RINGS; ring++) {
      const base = ring * per;
      for (let side = 0; side < 2; side++) {
        for (let j = 0; j <= AROUND; j++) {
          const v = base + side * (AROUND + 1) + j;
          if (side === 0) tmp.copy(COLORS.belly).lerp(COLORS.back, (1 + Math.cos((j / AROUND) * Math.PI)) / 2);
          else tmp.copy(COLORS.lining);
          tmp.toArray(c, v * 3);
          if (ring === PIECE * RINGS - 1 || j === AROUND) continue;
          const n = v + per;
          idx.push(v, n, v + 1, v + 1, n, n + 1);
        }
      }
      for (let f = 0; f < 6; f++) {
        const v = base + (AROUND + 1) * 2 + f * 2;
        const layer = f % 3;
        const skin = f < 3 ? COLORS.back : COLORS.belly;
        const col = layer === 0 ? skin : layer === 1 ? COLORS.circular : COLORS.longitudinal;
        col.toArray(c, v * 3);
        col.toArray(c, (v + 1) * 3);
        if (ring === PIECE * RINGS - 1) continue;
        idx.push(v, v + per, v + 1, v + 1, v + per, v + 1 + per);
      }
    }
    return idx;
  }

  /** Soil grains under the tunnel and over it, in three tiles so it can slide; a dark bank behind. */
  private buildSoil(): void {
    const rand = mulberry(7);
    const grain = new THREE.IcosahedronGeometry(1, 1);
    const per = 420;
    const mesh = new THREE.InstancedMesh(grain, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), per * 3);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    const tones = ['#6b4a32', '#7d5a3c', '#5a3d2a', '#8e6c4c', '#4a3324', '#a08a6a'];
    let n = 0;
    for (let i = 0; i < per; i++) {
      const size = 0.12 + rand() ** 2 * 0.45;
      const roof = rand() < 0.4;
      const x = rand() * TILE;
      // Clear of the cut, so the near bristles show in front of the soil.
      const z = -6 + rand() * 5.6;
      const y = roof ? RADIUS * 1.14 + 0.1 + size + rand() * 1.6 : FLOOR - size * 0.7 - rand() * 2.2;
      e.set(rand() * 6, rand() * 6, rand() * 6);
      col.set(tones[Math.floor(rand() * tones.length)]);
      for (let t = -1; t <= 1; t++) {
        m.compose(this.tmp.set(x + t * TILE, y, z), q.setFromEuler(e), new THREE.Vector3(size, size * (0.7 + rand() * 0.4), size));
        mesh.setMatrixAt(n, m);
        mesh.setColorAt(n++, col);
      }
    }
    mesh.frustumCulled = false;
    const bank = new THREE.MeshStandardMaterial({ color: '#4a3426', roughness: 1 });
    const back = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), bank);
    back.position.set(0, 0, -6.4);
    this.soil.add(mesh);
    this.group.add(back);
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/** The near skin's triangles and colours: dark back, pale belly. */
function nearIndices(color: THREE.BufferAttribute): number[] {
  const idx: number[] = [];
  const c = color.array as Float32Array;
  const tmp = new THREE.Color();
  const per = AROUND + 1;
  for (let ring = 0; ring < PIECE * RINGS; ring++) {
    for (let j = 0; j <= AROUND; j++) {
      const v = ring * per + j;
      tmp.copy(COLORS.belly).lerp(COLORS.back, (1 + Math.cos((j / AROUND) * Math.PI)) / 2).toArray(c, v * 3);
      if (ring === PIECE * RINGS - 1 || j === AROUND) continue;
      idx.push(v, v + per, v + 1, v + 1, v + per, v + per + 1);
    }
  }
  return idx;
}

/** A small seeded random generator, so the soil is the same every time. */
function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
