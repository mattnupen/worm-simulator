import type * as THREE from 'three';

/**
 * The camera's wobble (V4 spec revision 1, Matt 2026-10-22: "more of a screen wobble shake"; the
 * visual brief's one exception to a still camera): a short, gentle sway when the robin lands and on
 * each of its tugs. Under 3 shakes a second, so it never reads as flashing, and none with reduced
 * motion. Turned onto the camera after the game has set it each frame (only its turn changes: the
 * same on the surface and in the side view, whatever the scale). Allocates nothing.
 */
export const WOBBLE = {
  /** It lasts this long (s)... */
  time: 0.4,
  /** ...swaying this many times a second (under 3: never a flicker)... */
  hz: 2.5,
  /** ...this far at most (radians): a roll, and a smaller nod. */
  roll: 0.03,
  nod: 0.012,
} as const;

export class Wobble {
  /** Seconds into the wobble (Infinity: none). */
  t = Infinity;

  /** A new wobble, from the start (unless `reduced`: prefers-reduced-motion). */
  kick(reduced: boolean): void {
    if (!reduced) this.t = 0;
  }

  step(dt: number): void {
    if (this.t < WOBBLE.time) this.t += dt;
  }

  /** None now. */
  stop(): void {
    this.t = Infinity;
  }

  /** The sway now: 0 when still. Fades out as it ends. */
  amount(): number {
    const t = this.t;
    if (!(t < WOBBLE.time)) return 0;
    const fade = 1 - t / WOBBLE.time;
    return fade * fade * Math.sin(2 * Math.PI * WOBBLE.hz * t);
  }

  /** Turns `camera` by the sway now (after the game has posed it this frame). */
  apply(camera: THREE.Camera): void {
    const k = this.amount();
    if (k === 0) return;
    camera.rotateZ(WOBBLE.roll * k);
    camera.rotateX(WOBBLE.nod * k);
  }
}
