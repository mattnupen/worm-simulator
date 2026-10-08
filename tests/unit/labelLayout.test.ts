import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  LABEL_COUNT, LABEL_GAP, LABEL_SIDE, SCREEN_EDGE, TICK_W, HIDE_PAD,
  createEndPoints, createEndPixels, projectPoint, px, projectEnd, pushApart, endShows, namesShown, layoutEnd, writeChanged,
  type EndPoints, type PixelSink,
} from '../../src/underground/labelLayout';
import { createSlab, boundaryAt, slabX, slabZ, B_TOP, B_E } from '../../src/underground/slab';
import { frameTarget, cutPose, FOV_DEG, type CutFrame, type CutPose } from '../../src/underground/cutCamera';

function camAt(p: CutPose, aspect: number): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(FOV_DEG, aspect, p.near, 200);
  c.position.set(p.px, p.py, p.pz);
  c.lookAt(p.lx, p.ly, p.lz);
  c.updateMatrixWorld();
  return c;
}

/** Wide's camera for the head at (hu, hv) on a w x h screen. */
function wideCam(s: ReturnType<typeof createSlab>, hu: number, hv: number, w: number, h: number): THREE.PerspectiveCamera {
  const f: CutFrame = { cu: 0, cv: 0, h: 0, pitch: 0 };
  const p: CutPose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, near: 0 };
  frameTarget('wide', s, hu, hv, 1, 0, w / h, f);
  return camAt(cutPose(s, f.cu, f.cv, f.h, f.pitch, p), w / h);
}

function points(mx: number[], my: number[], tx = mx, ty = my): EndPoints {
  const p = createEndPoints();
  p.ok = true;
  p.mx.set(mx); p.my.set(my); p.tx.set(tx); p.ty.set(ty);
  return p;
}

const counter = (): PixelSink & { labels: number; ticks: number } => {
  const c = { labels: 0, ticks: 0, label() { c.labels++; }, tick() { c.ticks++; } };
  return c;
};

describe('layer names on screen (spec 5.3)', () => {
  it('projects a world point to pixels, and refuses one behind the camera', () => {
    const c = new THREE.PerspectiveCamera(60, 1366 / 768, 0.1, 100);
    c.position.set(0, 0, 5);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld();
    expect(projectPoint(c, 0, 0, 0, 1366, 768)).toBe(true);
    expect(px.x).toBeCloseTo(683, 6);
    expect(px.y).toBeCloseTo(384, 6);
    expect(projectPoint(c, 1, 1, 0, 1366, 768)).toBe(true);
    expect(px.x).toBeGreaterThan(683);
    expect(px.y).toBeLessThan(384);
    expect(projectPoint(c, 0, 0, 10, 1366, 768)).toBe(false);
  });

  it("projects each layer's top and middle at the slab's end, top to bottom down the screen", () => {
    const s = createSlab(0, 0, 0.4, 1, 3);
    const cam = wideCam(s, s.playHi - 0.5, boundaryAt(s, B_E, s.playHi) - 0.5, 1366, 768);
    const e = projectEnd(cam, s, s.playHi, 1366, 768, createEndPoints());
    expect(e.ok).toBe(true);
    for (let k = 1; k < LABEL_COUNT; k++) expect(e.ty[k]).toBeGreaterThan(e.ty[k - 1]);
    for (let k = 0; k < LABEL_COUNT; k++) {
      expect(e.my[k]).toBeGreaterThan(e.ty[k]);
      if (k + 1 < LABEL_COUNT) expect(e.my[k]).toBeLessThan(e.ty[k + 1]);
    }
    projectPoint(cam, slabX(s, s.playHi), boundaryAt(s, B_TOP, s.playHi), slabZ(s, s.playHi), 1366, 768);
    expect(e.tx[0]).toBeCloseTo(px.x, 9);
    expect(e.ty[0]).toBeCloseTo(px.y, 9);
  });

  it('pushes thin layers apart top to bottom, and leaves spaced ones alone', () => {
    const ys = new Float64Array([100, 110, 115, 300, 305]);
    pushApart(ys, LABEL_GAP);
    expect([...ys]).toEqual([100, 130, 160, 300, 330]);
    const apart = new Float64Array([10, 60, 200, 260, 400]);
    pushApart(apart, LABEL_GAP);
    expect([...apart]).toEqual([10, 60, 200, 260, 400]);
  });

  it('lays out in whole pixels: names hang outward, ticks sit on the end', () => {
    const mx = [700.4, 702.6, 704.5, 706.2, 709.9];
    const my = [100.4, 180.6, 240.2, 300.5, 401.49];
    const widths = [120, 110, 90, 95, 85];
    const r = layoutEnd(points(mx, my), true, widths, 1366, createEndPixels());
    const l = layoutEnd(points(mx, my), false, widths, 1366, createEndPixels());
    for (const o of [r, l]) for (const a of [o.lx, o.ly, o.tx, o.ty]) for (const v of a) expect(Number.isInteger(v)).toBe(true);
    for (let k = 0; k < LABEL_COUNT; k++) {
      expect(r.lx[k]).toBe(Math.round(mx[k] + LABEL_SIDE));
      expect(l.lx[k]).toBe(Math.round(mx[k] - LABEL_SIDE - widths[k]));
      expect(r.tx[k]).toBe(Math.round(mx[k]));
      expect(l.tx[k]).toBe(Math.round(mx[k] - TICK_W));
      expect(r.ty[k]).toBe(Math.round(my[k]));
      expect(r.ly[k]).toBe(Math.round(my[k]));
    }
  });

  it("holds each label on screen where the end leaves too little room, its tick still on the end", () => {
    const widths = [120, 110, 90, 95, 85];
    const left = layoutEnd(points([50, 50, 50, 50, 200], [100, 200, 300, 400, 500]), false, widths, 1366, createEndPixels());
    expect([...left.lx]).toEqual([SCREEN_EDGE, SCREEN_EDGE, SCREEN_EDGE, SCREEN_EDGE, 200 - LABEL_SIDE - 85]);
    expect(left.tx[0]).toBe(50 - TICK_W);
    const right = layoutEnd(points([1300, 1300, 1300, 1300, 1000], [100, 200, 300, 400, 500]), true, widths, 1366, createEndPixels());
    for (let k = 0; k < 4; k++) expect(right.lx[k]).toBe(1366 - SCREEN_EDGE - widths[k]);
    expect(right.lx[4]).toBe(1000 + LABEL_SIDE);
    expect(right.tx[0]).toBe(1300);
  });

  it("at the world's edge, Wide on 1366 x 768 keeps every name on screen", () => {
    // A cut running off the world's edge: its playable end is held FACE_END_ROOM inside the face.
    for (const [x, z, heading] of [[16, 3, Math.PI / 2], [-16, -4, -Math.PI / 2], [4, 16, 0.2], [12, 14, 0.8]] as const) {
      const s = createSlab(x, z, heading, 1, 9);
      for (const u of [s.playLo + 0.2, s.playHi - 0.2]) {
        const cam = wideCam(s, u, boundaryAt(s, B_TOP, u) - 0.6, 1366, 768);
        const end = u > 0 ? s.playHi : s.playLo;
        const e = projectEnd(cam, s, end, 1366, 768, createEndPoints());
        const other = projectEnd(cam, s, end === s.playHi ? s.playLo : s.playHi, 1366, 768, createEndPoints());
        expect(endShows(e.ok, false, e.tx[0], 1366)).toBe(true);
        const widths = [130, 125, 90, 100, 90];
        const o = layoutEnd(e, e.tx[0] > other.tx[0], widths, 1366, createEndPixels());
        for (let k = 0; k < LABEL_COUNT; k++) {
          expect(o.lx[k]).toBeGreaterThanOrEqual(SCREEN_EDGE);
          expect(o.lx[k] + widths[k]).toBeLessThanOrEqual(1366 - SCREEN_EDGE);
        }
      }
    }
  });

  it('shows a name once its point of the end is on screen and hides it only well off (no flicker at the edge)', () => {
    expect(endShows(true, false, 0, 1366)).toBe(true);
    expect(endShows(true, false, -1, 1366)).toBe(false);
    expect(endShows(true, true, -HIDE_PAD + 1, 1366)).toBe(true);
    expect(endShows(true, true, -HIDE_PAD - 1, 1366)).toBe(false);
    expect(endShows(true, false, 1367, 1366)).toBe(false);
    expect(endShows(true, true, 1366 + HIDE_PAD - 1, 1366)).toBe(true);
    expect(endShows(false, true, 600, 1366)).toBe(false);
    expect(endShows(true, true, NaN, 1366)).toBe(false);
    // An end wobbling a pixel either side of the screen's edge stays as it was.
    let on = false;
    let changes = 0;
    for (let i = 0; i < 40; i++) {
      const next = endShows(true, on, i < 5 ? -30 + i : (i % 2 ? -0.6 : 0.4), 1366);
      if (next !== on) changes++;
      on = next;
    }
    expect(changes).toBe(1);
  });

  it("hides each name on its own where the leaning end is partly off screen", () => {
    // The end leans (the camera looks down a little): its top is off the left edge, its foot on.
    const p = points([-70, -40, -1, 12, 41], [100, 200, 300, 400, 500]);
    const on = new Uint8Array(LABEL_COUNT);
    expect(namesShown(p, 1600, on)).toBe(2);
    expect([...on]).toEqual([0, 0, 0, 1, 1]);
    // Drifting a few pixels left: the shown ones hold (hysteresis), the hidden ones stay hidden.
    const q = points([-75, -45, -6, 2, 31], [100, 200, 300, 400, 500]);
    expect(namesShown(q, 1600, on)).toBe(2);
    p.ok = false;
    expect(namesShown(p, 1600, on)).toBe(0);
  });

  it('writes a position only when its whole pixel changes: nothing for a still camera', () => {
    const widths = [120, 110, 90, 95, 85];
    const last = createEndPixels();
    const next = createEndPixels();
    const mx = [700, 702, 704, 706, 709];
    const my = [100, 180, 240, 300, 400];
    const sink = counter();
    expect(writeChanged(last, layoutEnd(points(mx, my), true, widths, 1366, next), sink)).toBe(2 * LABEL_COUNT);
    expect(sink.labels).toBe(LABEL_COUNT);
    expect(sink.ticks).toBe(LABEL_COUNT);
    // The same frame again, then a sub-pixel drift that rounds the same: nothing written.
    expect(writeChanged(last, layoutEnd(points(mx, my), true, widths, 1366, next), sink)).toBe(0);
    const drift = my.map((y) => y + 0.3);
    expect(writeChanged(last, layoutEnd(points(mx, drift), true, widths, 1366, next), sink)).toBe(0);
    // One label's layer moves a pixel: that label and its tick, nothing else.
    const moved = [...drift];
    moved[2] += 1;
    expect(writeChanged(last, layoutEnd(points(mx, moved), true, widths, 1366, next), sink)).toBe(2);
    expect(sink.labels).toBe(LABEL_COUNT + 1);
    expect(sink.ticks).toBe(LABEL_COUNT + 1);
  });
});
