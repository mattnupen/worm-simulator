import type * as THREE from 'three';
import type { MeshWriter } from '../surface/meshWriter';
import { lin, loft, mix, smooth } from './robinGeom';
import { WormFeed } from './wormFeed';

/**
 * The worm in the robin's bill on the way to the nest (V4 nest scene): a soft rope of points held
 * crosswise in the bill a third of the way from its front end, both ends hanging and swinging as
 * the robin flies. Robins carry worms this way to their nestlings (the Cornell Lab's robin nest cam:
 * "Adult robin flies in and lands on the nest with worms in its beak"). Everything is in the nest
 * frame (centimetres, y up). Its vertices are part of the nest's mesh (nest.ts), rewritten each frame
 * as a tube along the rope. Allocates nothing per frame.
 */

/** Points along the rope, the real length (cm, a 15 cm nightcrawler like the player) and where the bill holds it. */
export const WORM_POINTS = 18;
export const WORM_CM = 15;
export const HOLD = 6;
const SEG = WORM_CM / (WORM_POINTS - 1);
const SIDES = 8;
/** Gravity (cm/s²), air drag per substep, and the substep (s). */
const GRAVITY = 981;
const DRAG = 0.985;
const SUB = 1 / 120;
/** How hard it squirms (cm/s per point away from the bill). */
const WRIGGLE = 1.6;
/** Wiggling free (nestWiggle.ts): a press's flick (cm/s per cm from the bill) and the thrash's squirm. */
const FLICK = 9;
const THRASH = 14;

// The player's worm's colours (wormMaterial.ts): mauve-brown, redder at the front, a pale saddle.
const FRONT = lin(0x8e3f50);
const BODY = lin(0x7a4a4f);
const CLITELLUM = lin(0xb27c74);
const TAIL = lin(0x9c7a74);

/** The worm's radius (cm) along it, front (0) to tail (1): a rounded head, tapering to the tail. */
function radius(s: number): number {
  return 0.5 * (1 - 0.35 * smooth(0.5, 1, s));
}

export class WormCarry {
  readonly start: number;
  readonly count: number;
  /** Drawn: false collapses its vertices (before the catch, and once it is fed). */
  shown = false;
  /** How hard it thrashes now (0..1, set by the scene from nestWiggle.ts): a fast, big squirm. */
  thrash = 0;
  /** Let go of (it wiggled free, `drop`): no longer held, it falls, and slides little once down. */
  free = false;
  /** The ground's height (nest frame) under a nest-frame point: the rope lies on it, never under it. */
  floor: (x: number, z: number) => number = () => -1e9;
  /** Fed to a nestling at the end (wormFeed.ts; the scene sets how far along). */
  readonly feed = new WormFeed();
  private readonly p = new Float32Array(WORM_POINTS * 3);
  private readonly q = new Float32Array(WORM_POINTS * 3);
  /** The three held points, now and at the last step (they move smoothly across substeps). */
  private readonly pin = new Float32Array(9);
  private readonly pinWas = new Float32Array(9);
  private cleared = false;
  /** Seconds it has been carried: drives its wriggle. */
  private age = 0;
  private readonly t = new Float32Array(3);
  private readonly u = new Float32Array(3);

  constructor(w: MeshWriter) {
    this.start = w.vertexCount;
    // Rest vertices only fix the colours and the triangles; write() moves every one.
    loft(w, WORM_POINTS + 1, SIDES, (s) => {
      const k = Math.min(1, Math.max(0, (s * (WORM_POINTS + 1) - 1) / (WORM_POINTS - 1)));
      const band = smooth(0.2, 0.24, k) * smooth(0.33, 0.29, k);
      return { x: 0, y: 0, z: 0, c: mix(mix(mix(FRONT, BODY, smooth(0, 0.2, k)), TAIL, smooth(0.45, 1, k)), CLITELLUM, band) };
    });
    this.count = w.vertexCount - this.start;
  }

  /**
   * Holds it at `a`, `b`, `c` (the bill's edge, middle and other edge; nest frame) and lays the rest
   * hanging straight down from there, still: the moment it comes out of the ground.
   */
  hang(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
    this.setPins(a, b, c);
    this.pinWas.set(this.pin);
    for (let i = 0; i < WORM_POINTS; i++) {
      // The front end hangs from the bill's first edge, the tail end from the other; the middle is held.
      const j = Math.min(2, Math.max(0, i - HOLD + 1));
      const d = Math.abs(i - (HOLD - 1 + j)) * SEG;
      // A little sideways too, so the part lying on the ground lies along it, not in a heap.
      this.p[i * 3] = this.pin[j * 3] + (i - HOLD) * 0.35;
      this.p[i * 3 + 1] = this.pin[j * 3 + 1] - d;
      this.p[i * 3 + 2] = this.pin[j * 3 + 2];
    }
    this.q.set(this.p);
    this.age = 0;
    this.thrash = 0;
    this.free = false;
    this.feed.reset();
    this.ground();
  }

  /**
   * Let go: it falls from where it is. It wriggles out of the bill rather than being thrown, so it
   * keeps little of the robin's speed across the ground and comes down close to where it slipped.
   */
  drop(): void {
    this.free = true;
    for (let i = 0; i < this.p.length; i += 3) {
      this.q[i] = this.p[i] - (this.p[i] - this.q[i]) * 0.2;
      this.q[i + 2] = this.p[i + 2] - (this.p[i + 2] - this.q[i + 2]) * 0.2;
    }
  }

  /**
   * A press's flick (nestWiggle.ts): both ends whip one way (`side`, 1 or -1) and up, the farther
   * from the bill the more, `strength` 0..1 (smaller with reduced motion).
   */
  flick(side: number, strength: number): void {
    const v = FLICK * strength * SUB;
    for (let k = 0; k < WORM_POINTS; k++) {
      const d = Math.abs(k - HOLD) * SEG * v;
      const i = k * 3;
      // The two ends go opposite ways, as a body bends.
      const s = k < HOLD ? side : -side;
      this.q[i] -= s * d;
      this.q[i + 1] -= d * 0.5;
      this.q[i + 2] -= s * d * 0.4;
    }
  }

  /** Moves on `dt` seconds with the bill now at `a`, `b`, `c` (as in hang). */
  step(dt: number, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
    this.pinWas.set(this.pin);
    this.setPins(a, b, c);
    const n = Math.min(12, Math.ceil(dt / SUB - 1e-6));
    if (n <= 0) return;
    const h = dt / n;
    const g = GRAVITY * h * h;
    const p = this.p;
    const q = this.q;
    for (let s = 1; s <= n; s++) {
      this.age += h;
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i], y = p[i + 1], z = p[i + 2];
        // A slow wriggle along it, the ends most: a caught worm squirms.
        const k = i / 3;
        // (Let go, only a little of it: in the air a squirm would push it sideways.)
        const wr = this.free
          ? h * Math.abs(k - HOLD) * WRIGGLE * 0.3 * Math.sin(this.age * 5 - k * 0.9)
          : h * Math.abs(k - HOLD) * (WRIGGLE * Math.sin(this.age * 5 - k * 0.9) + THRASH * this.thrash * Math.sin(this.age * 17 - k * 1.3));
        p[i] += (x - q[i]) * DRAG + wr;
        p[i + 1] += (y - q[i + 1]) * DRAG - g;
        p[i + 2] += (z - q[i + 2]) * DRAG + wr * 0.6;
        q[i] = x; q[i + 1] = y; q[i + 2] = z;
      }
      const k = s / n;
      for (let it = 0; it < 10; it++) {
        this.holdPins(k);
        this.feed.apply(p, q, WORM_POINTS, SEG, HOLD);
        for (let i = 0; i < WORM_POINTS - 1; i++) this.link(i, i + 1, SEG, 0.5);
        // A little stiffness: a worm bends, but not like a string.
        // (Not across the bill: the ends hang straight down from its edges.)
        // Let go, it is one body again, held a little straighter (no kinks where the bill was).
        const loose = this.free || !this.feed.held;
        for (let i = 0; i < WORM_POINTS - 2; i++) if (loose || i + 2 < HOLD - 1 || i > HOLD + 1) this.link(i, i + 2, SEG * 1.85, this.free ? 0.2 : 0.06);
      }
      this.holdPins(k);
      this.feed.apply(p, q, WORM_POINTS, SEG, HOLD);
      this.ground();
    }
  }

  /** Writes the tube along the rope into the nest mesh's arrays (or collapses it, hidden). */
  write(geometry: THREE.BufferGeometry): void {
    const pos = geometry.getAttribute('position').array as Float32Array;
    const nor = geometry.getAttribute('normal').array as Float32Array;
    const base = this.start * 3;
    if (!this.shown) {
      if (!this.cleared) pos.fill(0, base, base + this.count * 3);
      this.cleared = true;
      return;
    }
    this.cleared = false;
    const p = this.p;
    const t = this.t;
    const u = this.u;
    const rings = WORM_POINTS + 2;
    for (let r = 0; r < rings; r++) {
      // Ring 0 and the last are the rounded tips, a little past the end points.
      const i = Math.min(WORM_POINTS - 1, Math.max(0, r - 1));
      const a = Math.max(0, i - 1) * 3;
      const b = Math.min(WORM_POINTS - 1, i + 1) * 3;
      unit3(t, p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]);
      if (r === 0) {
        // A start direction across the rope; then carried along it, so the tube never twists.
        if (Math.abs(t[1]) < 0.9) unit3(u, -t[2], 0, t[0]);
        else unit3(u, 0, t[2], -t[1]);
      } else {
        const d = u[0] * t[0] + u[1] * t[1] + u[2] * t[2];
        unit3(u, u[0] - t[0] * d, u[1] - t[1] * d, u[2] - t[2] * d);
      }
      const vx = t[1] * u[2] - t[2] * u[1];
      const vy = t[2] * u[0] - t[0] * u[2];
      const vz = t[0] * u[1] - t[1] * u[0];
      const tip = r === 0 ? -1 : r === rings - 1 ? 1 : 0;
      const rr = tip ? 0.12 : radius(i / (WORM_POINTS - 1));
      const off = tip * 0.4;
      const cx = p[i * 3] + t[0] * off, cy = p[i * 3 + 1] + t[1] * off, cz = p[i * 3 + 2] + t[2] * off;
      for (let k = 0; k <= SIDES; k++) {
        const ang = (k / SIDES) * Math.PI * 2;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        const nx = u[0] * ca + vx * sa, ny = u[1] * ca + vy * sa, nz = u[2] * ca + vz * sa;
        const o = base + (r * (SIDES + 1) + k) * 3;
        pos[o] = cx + nx * rr; pos[o + 1] = cy + ny * rr; pos[o + 2] = cz + nz * rr;
        // At the tips the surface faces mostly along the worm. Written inward, as the loft's
        // winding has it (its outside faces are back faces; the shader turns them to the viewer).
        const m = tip ? -0.5 : -1;
        unitInto(nor, o, nx * m - t[0] * tip, ny * m - t[1] * tip, nz * m - t[2] * tip);
      }
    }
  }

  /** A point of the rope (nest frame), for tests and the camera. */
  point(i: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.p[i * 3], this.p[i * 3 + 1], this.p[i * 3 + 2]);
  }

  private setPins(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): void {
    const s = this.pin;
    s[0] = a.x; s[1] = a.y; s[2] = a.z; s[3] = b.x; s[4] = b.y; s[5] = b.z; s[6] = c.x; s[7] = c.y; s[8] = c.z;
  }

  /** The held points, `k` (0..1) of the way from where the bill was to where it is. */
  private holdPins(k: number): void {
    if (this.free || !this.feed.held) return;
    for (let j = 0; j < 3; j++) {
      const i = (HOLD - 1 + j) * 3;
      for (let d = 0; d < 3; d++) {
        const v = this.pinWas[j * 3 + d] + (this.pin[j * 3 + d] - this.pinWas[j * 3 + d]) * k;
        this.p[i + d] = v;
        this.q[i + d] = v;
      }
    }
  }

  /** Pulls points i and j toward `rest` apart, by `stiff` of the error each. */
  private link(i: number, j: number, rest: number, stiff: number): void {
    const p = this.p;
    const a = i * 3, b = j * 3;
    const dx = p[b] - p[a], dy = p[b + 1] - p[a + 1], dz = p[b + 2] - p[a + 2];
    const d = Math.hypot(dx, dy, dz) || 1e-6;
    if (j === i + 2 && d > rest) return;
    const f = ((d - rest) / d) * stiff;
    p[a] += dx * f; p[a + 1] += dy * f; p[a + 2] += dz * f;
    p[b] -= dx * f; p[b + 1] -= dy * f; p[b + 2] -= dz * f;
  }

  /** Nothing goes under the litter: points below it rest on top. */
  private ground(): void {
    const p = this.p;
    for (let i = 0; i < p.length; i += 3) {
      const top = this.floor(p[i], p[i + 2]) + 0.45;
      if (p[i + 1] < top) {
        p[i + 1] = top;
        this.q[i + 1] = top;
        // Dropped on the litter it stops soon: no sliding off across the floor.
        if (this.free) {
          this.q[i] = p[i] - (p[i] - this.q[i]) * 0.6;
          this.q[i + 2] = p[i + 2] - (p[i + 2] - this.q[i + 2]) * 0.6;
        }
      }
    }
  }
}

function unit3(out: Float32Array, x: number, y: number, z: number): void {
  const l = Math.hypot(x, y, z) || 1;
  out[0] = x / l; out[1] = y / l; out[2] = z / l;
}

function unitInto(out: Float32Array, o: number, x: number, y: number, z: number): void {
  const l = Math.hypot(x, y, z) || 1;
  out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l;
}
