import * as THREE from 'three';
import { WIDEST } from './shapes';
import type { WormBody } from './body';

/** The stretch of soil drawn (mm, along the worm), and how finely the tunnel is remembered. */
const XMIN = -24;
const XMAX = 26;
const SPAN = XMAX - XMIN;
const CELL = 0.2;
/** Grains fill a slab just behind the cut, out to this far above and below the worm. */
const REACH_Y = WIDEST + 3.5;
const SLAB = [-1.7, -0.05] as const;
/** The dark soil behind the grains, with the tunnel's hole through it. */
const BANK_Z = -1.8;
const GRAINS = 1500;
const STEP = 0.25;

/**
 * The soil the worm digs through, cut open like the worm. Grains sit in a slab just behind the
 * cut, over dark soil. Every grain the body reaches is pushed straight out of its way and stays
 * there, so the tunnel is the widest the body has been at each place (worms make burrows mostly by
 * pushing soil aside: Ruiz, Or and Schymanski 2015). Ahead of the head the soil is still solid.
 * The soil is fixed to the world; the worm stays in view, so the soil slides back past it, and
 * grains that leave behind come round again ahead as fresh, undug soil.
 */
export class Soil {
  readonly group = new THREE.Group();
  /** Tunnel radius by cell of world x: it only ever grows. */
  private readonly tunnel = new Map<number, number>();
  private readonly x0 = new Float32Array(GRAINS);
  private readonly y0 = new Float32Array(GRAINS);
  private readonly z0 = new Float32Array(GRAINS);
  private readonly y = new Float32Array(GRAINS);
  private readonly z = new Float32Array(GRAINS);
  private readonly size = new Float32Array(GRAINS);
  private readonly turn: THREE.Quaternion[] = [];
  private readonly grains: THREE.InstancedMesh;
  private readonly bank: THREE.Mesh;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly sc = new THREE.Vector3();

  constructor(headX: number) {
    const rand = mulberry(7);
    const tones = ['#6b4a32', '#7d5a3c', '#5a3d2a', '#8e6c4c', '#4a3324', '#a08a6a', '#b39b78'];
    this.grains = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), GRAINS);
    const col = new THREE.Color();
    for (let i = 0; i < GRAINS; i++) {
      this.x0[i] = XMIN + rand() * SPAN;
      this.y[i] = this.y0[i] = (rand() * 2 - 1) * REACH_Y;
      this.z[i] = this.z0[i] = SLAB[0] + rand() * (SLAB[1] - SLAB[0]);
      this.size[i] = 0.16 + rand() ** 2 * 0.5;
      this.turn.push(new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6, rand() * 6, rand() * 6)));
      this.grains.setColorAt(i, col.set(tones[Math.floor(rand() * tones.length)]));
    }
    this.grains.frustumCulled = false;
    // Behind the head the tunnel is already dug.
    for (let c = Math.floor(XMIN / CELL) - 1; c * CELL < headX - 2; c++) this.tunnel.set(c, WIDEST);
    const n = Math.round(SPAN / STEP) + 1;
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3);
    pos.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', pos);
    const normals = new Float32Array(n * 4 * 3);
    for (let i = 2; i < normals.length; i += 3) normals[i] = 1;
    geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      for (const b of [0, 2]) {
        const v = i * 4 + b;
        idx.push(v, v + 4, v + 1, v + 1, v + 4, v + 5);
      }
    }
    geo.setIndex(idx);
    this.bank = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#4a3426', roughness: 1, side: THREE.DoubleSide }));
    this.bank.frustumCulled = false;
    // Far back, behind the whole tunnel: dark soil wherever the hole shows through.
    const back = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), this.bank.material);
    back.position.z = -WIDEST - 1.2;
    this.group.add(this.grains, this.bank, back);
  }

  /** Remembers how wide the body is now at each place, then moves every grain out of its way. */
  update(body: WormBody, travelled: number): void {
    for (let k = 0; k < body.x.length; k++) {
      const c = Math.floor((body.x[k] - travelled) / CELL);
      const r = body.r[k] + Math.max(0, body.lift[k]) * 0.5;
      if (r > (this.tunnel.get(c) ?? 0)) this.tunnel.set(c, r);
    }
    for (const c of this.tunnel.keys()) if (c * CELL + travelled < XMIN - 2) this.tunnel.delete(c);
    for (let i = 0; i < GRAINS; i++) {
      let x = this.x0[i] + travelled;
      if (x < XMIN) {
        // Gone behind: it comes round again ahead, as fresh soil.
        this.x0[i] += SPAN;
        x += SPAN;
        this.y[i] = this.y0[i];
        this.z[i] = this.z0[i];
      }
      const need = this.at(x - travelled) + this.size[i] * 0.85;
      const d = Math.hypot(this.y[i], this.z[i]);
      if (d < need) {
        if (d < 1e-4) this.y[i] = need;
        else {
          this.y[i] *= need / d;
          this.z[i] *= need / d;
        }
      }
      const s = this.size[i];
      this.m.compose(this.p.set(x, this.y[i], this.z[i]), this.turn[i], this.sc.set(s, s * 0.8, s));
      this.grains.setMatrixAt(i, this.m);
    }
    this.grains.instanceMatrix.needsUpdate = true;
    this.writeBank(travelled);
  }

  /** The tunnel's radius at world x (0 where the worm has not been). */
  private at(xw: number): number {
    return this.tunnel.get(Math.floor(xw / CELL)) ?? 0;
  }

  /** The dark soil behind the grains: above and below the tunnel's hole through it. */
  private writeBank(travelled: number): void {
    const attr = this.bank.geometry.getAttribute('position') as THREE.BufferAttribute;
    const p = attr.array as Float32Array;
    const far = REACH_Y + 30;
    let o = 0;
    const n = Math.round(SPAN / STEP) + 1;
    for (let i = 0; i < n; i++) {
      const x = XMIN + i * STEP;
      const t = this.at(x - travelled);
      const h = t > -BANK_Z ? Math.sqrt(t * t - BANK_Z * BANK_Z) : 0;
      for (const [a, b] of [[h, far], [-h, -far]]) {
        p[o++] = x; p[o++] = a; p[o++] = BANK_Z;
        p[o++] = x; p[o++] = b; p[o++] = BANK_Z;
      }
    }
    attr.needsUpdate = true;
  }
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
