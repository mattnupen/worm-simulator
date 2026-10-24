import type * as THREE from 'three';

/**
 * Feeding the carried worm to a nestling (V4 nest scene, Matt's revision 4: "make sure the worm
 * goes directly into a mouth"). The robin brings one end of the worm to the open gape (`reach`),
 * the nestling takes it in (`take`: up to the bill while it still holds), the robin lets go
 * (`held` false) and the nestling gulps the rest (`rest`); what is in
 * the mouth goes straight down the throat, so the end never shows behind the head. WormCarry
 * (wormCarry.ts) applies it to its rope; nestScript.ts feedAt says how far along it is. The end
 * that goes in first is the one nearer the camera, so the worm goes in from the side we see.
 * Allocates nothing per frame.
 */
export class WormFeed {
  /**
   * How far the first end has come to the mouth, how much of the part up to the bill is in, how much
   * of the rest is in (each 0..1), and whether the bill still holds it.
   */
  reach = 0;
  take = 0;
  rest = 0;
  held = true;
  /** How much can go in while the bill holds the worm (cm, from the end in to the bill). */
  private upToBill = 0;
  /** The rope's point that goes in first (0 the front, the last the tail); -1: not chosen yet. */
  private end = -1;
  /** The gape, the way down the throat (unit) and how deep the worm goes before it is out of sight (nest frame, cm). */
  private readonly mouth = new Float32Array(3);
  private readonly dir = new Float32Array(3);
  private depth = 0;
  /** Where the first end was when it started for the mouth. */
  private readonly from = new Float32Array(3);
  private readonly eye = new Float32Array(3);

  reset(): void {
    this.reach = 0;
    this.take = 0;
    this.rest = 0;
    this.held = true;
    this.end = -1;
  }

  /** Being fed now (the end has started for the mouth). */
  get active(): boolean {
    return this.reach > 0;
  }

  /** This frame's gape and a point inside the head behind it (nest frame), and the camera (nest frame). */
  aim(mouth: THREE.Vector3, inner: THREE.Vector3, eye: THREE.Vector3): void {
    this.mouth[0] = mouth.x; this.mouth[1] = mouth.y; this.mouth[2] = mouth.z;
    const dx = inner.x - mouth.x, dy = inner.y - mouth.y, dz = inner.z - mouth.z;
    this.depth = Math.hypot(dx, dy, dz) || 1e-6;
    this.dir[0] = dx / this.depth; this.dir[1] = dy / this.depth; this.dir[2] = dz / this.depth;
    this.eye[0] = eye.x; this.eye[1] = eye.y; this.eye[2] = eye.z;
  }

  /**
   * Puts the fed part of rope `p` (its last positions `q`; `n` points `seg` cm apart, the bill
   * holding the three round point `hold`) where it goes: the first end on its way to the gape, the
   * swallowed part down the throat.
   */
  apply(p: Float32Array, q: Float32Array, n: number, seg: number, hold: number): void {
    if (this.reach <= 0) return;
    const last = n - 1;
    if (this.end < 0) {
      // The end nearer the camera goes in first.
      this.end = dist2(p, 0, this.eye) <= dist2(p, last * 3, this.eye) ? 0 : last;
      this.from.set(p.subarray(this.end * 3, this.end * 3 + 3));
      // Up to a little short of the bill's nearer edge: the rope between stays slack.
      this.upToBill = ((this.end === 0 ? hold - 1 : last - hold - 1) - 0.5) * seg;
    }
    const len = this.take * this.upToBill + this.rest * (n * seg - this.upToBill);
    const m = this.mouth;
    const d = this.dir;
    for (let k = 0; k < n; k++) {
      const i = (this.end === 0 ? k : last - k) * 3;
      const inside = len - k * seg;
      if (k > 0 && inside <= 0) return;
      for (let c = 0; c < 3; c++) {
        // The first end comes on a smooth path to the gape; what is in lies down the throat.
        p[i + c] = inside <= 0
          ? this.from[c] + (m[c] - this.from[c]) * this.reach
          : m[c] + d[c] * Math.min(inside, this.depth);
        q[i + c] = p[i + c];
      }
      if (inside <= 0) return;
    }
  }
}

function dist2(p: Float32Array, i: number, e: Float32Array): number {
  return (p[i] - e[0]) ** 2 + (p[i + 1] - e[1]) ** 2 + (p[i + 2] - e[2]) ** 2;
}
