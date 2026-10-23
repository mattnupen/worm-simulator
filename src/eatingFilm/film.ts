import * as THREE from 'three';
import { sample } from '../opening/keys';
import { Inside } from './inside';
import { Outside } from './outside';
import {
  BEATS, FILM_END, INSIDE_FROM, IN_CAMERA, LABELS, LABEL_Y, OUT_CAMERA, beatAt, dipAt, insideAt, type Beat,
} from './script';

/** The two places' light: a cool dusk outside, warm light inside the worm. */
const LIGHT = {
  // Dusk, not dark night (Matt, 2026-10-23: "a little too dark overall").
  outside: { bg: 0x4a5a7c, sky: 0xd4dcf2, ground: 0x6a5440, hemi: 2.7, sun: 0xffe6c8, sunI: 2.4, sunDir: [-0.4, 1, 0.9] },
  inside: { bg: 0x3a2618, sky: 0xfff1e2, ground: 0x8a5a44, hemi: 1.7, sun: 0xfff2e0, sunI: 1.9, sunDir: [0.3, 0.8, 1] },
} as const;

/**
 * The eating film (V4 lesson, "Follow the leaf"): its own small scene, drawn by the game's
 * renderer in place of the forest while the step shows (main.ts). It is built once when the lesson
 * needs it (no shader compiles while it plays). `step` runs the clock (not while paused); `pose`
 * sets everything, the camera included, for the drawn frame. Allocates nothing per frame.
 */
export class EatingFilm {
  readonly scene = new THREE.Scene();
  /** Seconds into the film, at this and the last step. */
  t = 0;
  private prevT = 0;
  /** Started and not stopped: main.ts draws it instead of the forest. */
  shown = false;
  paused = false;
  /** Reduced motion: the camera holds still within each beat and cuts between them. */
  private reduced = false;
  private readonly outside = new Outside();
  private readonly inside = new Inside();
  private readonly hemi = new THREE.HemisphereLight();
  private readonly sun = new THREE.DirectionalLight();
  private readonly fog = new THREE.Fog(0, 6, 24);
  private readonly bg = new THREE.Color();
  private readonly cam = [0, 0, 0, 0, 0, 0];
  private readonly look = new THREE.Vector3();
  private place: 'outside' | 'inside' | null = null;
  private readonly v = new THREE.Vector3();
  /**
   * Where each part's label (script.ts LABELS) is on screen in the drawn frame, 5 numbers each:
   * the point it marks (x, y), the label's place (x, y), in CSS pixels, and 1 if it shows (inside,
   * with its point on the shot), else 0. Written by `pose`.
   */
  readonly labels = new Float32Array(LABELS.length * 5);

  constructor() {
    this.scene.background = this.bg;
    this.scene.fog = this.fog;
    this.scene.add(this.hemi, this.sun, this.sun.target, this.outside.group, this.inside.group);
  }

  /** Builds the worm inside (slow, once): see Inside.build. */
  build(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    this.inside.build(renderer, this.scene, camera);
  }

  get done(): boolean {
    return this.t >= FILM_END;
  }
  get beat(): Beat {
    return beatAt(this.t);
  }
  /** How dark the dip between places is now (0 to 1), for the black veil over the film. */
  get dark(): number {
    return dipAt(this.t);
  }

  start(reduced: boolean): void {
    this.t = this.prevT = 0;
    this.shown = true;
    this.paused = false;
    this.reduced = reduced;
  }

  /** Jumps to second `t` (the ?eatingAt= preview). */
  seek(t: number): void {
    this.t = this.prevT = Math.min(FILM_END, Math.max(0, t));
  }

  stop(): void {
    this.shown = false;
    this.paused = false;
  }

  step(dt: number): void {
    this.prevT = this.t;
    if (!this.shown || this.paused) return;
    this.t = Math.min(FILM_END, this.t + dt);
  }

  /**
   * Poses the frame `alpha` of the way from the last step to this one, into `camera`: `w` by `h`
   * pixels, with the bottom `inset` pixels under the lesson's card, so the shot centres above it.
   */
  pose(alpha: number, camera: THREE.PerspectiveCamera, w: number, h: number, inset: number): void {
    const t = this.prevT + (this.t - this.prevT) * alpha;
    const inside = insideAt(t);
    this.setPlace(inside ? 'inside' : 'outside');
    this.outside.group.visible = !inside;
    this.inside.group.visible = inside;
    if (inside) this.inside.pose(t);
    else this.outside.pose(t);

    // Reduced motion: each beat is one still shot, from a moment into it.
    const ct = this.reduced ? beatStart(t) + 1.5 : t;
    const c = this.cam;
    if (inside) {
      sample(IN_CAMERA, Math.max(ct, INSIDE_FROM), c);
      const [fx, dist, height] = c;
      c[0] = fx + 0.4; c[1] = height; c[2] = dist;
      c[3] = fx; c[4] = 0; c[5] = 0;
    } else {
      sample(OUT_CAMERA, ct, c);
    }
    // A tall screen sees less across: step back so the same width shows.
    const aspect = w / Math.max(1, h - inset);

    const back = aspect < 1.4 ? Math.min(2.4, 1.4 / aspect) : 1;
    this.look.set(c[3], c[4], c[5]);
    camera.position.set(c[3] + (c[0] - c[3]) * back, c[4] + (c[1] - c[4]) * back, c[5] + (c[2] - c[5]) * back);
    camera.fov = inside ? 45 : 50;
    camera.near = 0.05;
    camera.far = 80;
    // The shot is framed for the screen above the card, and runs on under it.
    const above = Math.max(1, h - inset);
    camera.aspect = w / above;
    if (inset > 0) camera.setViewOffset(w, above, 0, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    camera.lookAt(this.look);
    camera.updateMatrixWorld();

    // The labels: the point each marks, and its place straight above or below the worm.
    const out = this.labels;
    LABELS.forEach((l, i) => {
      const o = i * 5;
      out[o + 4] = 0;
      if (!inside) return;
      this.v.set(l.x, l.y, 0).project(camera);
      const ax = (this.v.x + 1) / 2 * w;
      const ay = (1 - this.v.y) / 2 * h;
      if (this.v.z > 1 || ax < 8 || ax > w - 8 || ay < 0 || ay > above) return;
      this.v.set(l.x, l.side * LABEL_Y, 0).project(camera);
      out[o] = ax;
      out[o + 1] = ay;
      out[o + 2] = (this.v.x + 1) / 2 * w;
      out[o + 3] = (1 - this.v.y) / 2 * h;
      out[o + 4] = 1;
    });
  }

  /** The game's camera settings, put back after the film (main.ts sizes it again on resize). */
  release(camera: THREE.PerspectiveCamera, fov: number, near: number, far: number): void {
    camera.clearViewOffset();
    camera.fov = fov;
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }

  private setPlace(place: 'outside' | 'inside'): void {
    if (this.place === place) return;
    this.place = place;
    const l = LIGHT[place];
    this.bg.setHex(l.bg);
    this.fog.color.setHex(l.bg);
    this.fog.near = place === 'outside' ? 7 : 30;
    this.fog.far = place === 'outside' ? 26 : 70;
    this.hemi.color.setHex(l.sky);
    this.hemi.groundColor.setHex(l.ground);
    this.hemi.intensity = l.hemi;
    this.sun.color.setHex(l.sun);
    this.sun.intensity = l.sunI;
    this.sun.position.set(l.sunDir[0], l.sunDir[1], l.sunDir[2]).multiplyScalar(10);
  }
}

/** When the beat at time `t` began. */
function beatStart(t: number): number {
  let from = 0;
  for (const [, at] of BEATS) if (t >= at) from = at;
  return from;
}
