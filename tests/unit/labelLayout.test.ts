import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  LABEL_COUNT, LABEL_GAP, LABEL_SIDE, SCREEN_EDGE, TICK_W, HIDE_PAD,
  CONTROL_GAP, CONTROL_RAMP,
  createEndPoints, createEndPixels, projectPoint, px, projectEnd, endShows, namesShown, layoutEnd, writeChanged,
  fitColumn, type EndPoints, type PixelSink,
} from '../../src/underground/labelLayout';
import { createLabelFrame, layoutLabels, NEAR_SWITCH, type LabelFrame } from '../../src/underground/labelFrame';
import { screenOnCut } from './cutWorld';
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
    const lx = new Float64Array(LABEL_COUNT).fill(600);
    const w = [100, 100, 100, 100, 100];
    const ys = new Float64Array([100, 110, 115, 300, 305]);
    fitColumn(ys, lx, w, new Float64Array(0), 0, 768);
    expect([...ys]).toEqual([100, 130, 160, 300, 330]);
    const apart = new Float64Array([30, 60, 200, 260, 400]);
    fitColumn(apart, lx, w, new Float64Array(0), 0, 768);
    expect([...apart]).toEqual([30, 60, 200, 260, 400]);
    // Off the screen's top or bottom: held on it, still apart.
    const off = new Float64Array([-80, -40, 300, 900, 1000]);
    fitColumn(off, lx, w, new Float64Array(0), 0, 768);
    expect([...off]).toEqual([21, 51, 300, 717, 747]);
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

describe('the nearer end always names its layers (answer 11.2)', () => {
  const WIDTHS = [102, 109, 81, 81, 84];
  /** The controls as hud.css places them on a w x h screen: joystick, Action prompt, Pause. */
  function controls(w: number, h: number): Float64Array {
    const narrow = w <= 560;
    const prompt = narrow ? [w - 16 - 120, h - 16 - 110, w - 16, h - 16] : [w - 24 - 240, h - 24 - 72, w - 24, h - 24];
    return new Float64Array([24, h - 164, 164, h - 24, ...prompt, w - 12 - 141, 12, w - 12, 72]);
  }
  function frameFor(w: number, h: number): LabelFrame {
    const f = createLabelFrame();
    f.rects.set(controls(w, h));
    f.rectCount = 3;
    f.lo.widths.set(WIDTHS);
    f.hi.widths.set(WIDTHS);
    return f;
  }

  it('at the entry in Wide, the nearer end docks at the screen edge, each name beside its layer there', () => {
    const s = createSlab(0, 0, 0.3, 1, 9);
    const f = frameFor(1366, 768);
    const cam = wideCam(s, 0.1, boundaryAt(s, B_TOP, 0.1) - 0.6, 1366, 768);
    layoutLabels(f, cam, s, 0.1, 1366, 768);
    const near = f.nearHi === 1 ? f.hi : f.lo;
    expect(near.count).toBe(LABEL_COUNT);
    // Both ends are off screen at the entry: the near end's names sit at its side's edge.
    const edge = near.right ? 1366 : 0;
    const pose: CutPose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0, near: 0 };
    const fr: CutFrame = { cu: 0, cv: 0, h: 0, pitch: 0 };
    frameTarget('wide', s, 0.1, boundaryAt(s, B_TOP, 0.1) - 0.6, 1, 0, 1366 / 768, fr);
    cutPose(s, fr.cu, fr.cv, fr.h, fr.pitch, pose);
    for (let k = 0; k < LABEL_COUNT; k++) {
      expect(near.pts.tx[k]).toBe(edge);
      // The docked tick lies on its layer's top where the screen's edge meets the cut.
      const at = screenOnCut(pose, s, 1366 / 768, edge / 683 - 1, 1 - near.pts.ty[k] / 384);
      expect(at.v).toBeCloseTo(boundaryAt(s, k, at.u), 2);
      expect(near.px.tx[k]).toBe(near.right ? 1366 - TICK_W : 0);
      expect(near.px.lx[k]).toBe(near.right ? 1366 - SCREEN_EDGE - WIDTHS[k] : SCREEN_EDGE);
    }
    // The far end is off screen: its names hide.
    expect((f.nearHi === 1 ? f.lo : f.hi).count).toBe(0);
  });

  for (const [w, h] of [[1366, 768], [1366, 640], [640, 360], [360, 640]] as const) {
    it(`a sweep along the slab at ${w} x ${h}: names never flicker, jump, leave the screen or cover a control`, () => {
      for (const [x, z, heading] of [[0, 0, 0.3], [12, 14, 0.8], [-6, 3, 2.2]] as const) {
        const s = createSlab(x, z, heading, 1, 9);
        const f = frameFor(w, h);
        const rects = controls(w, h);
        const steps = 300;
        for (const dir of [1, -1]) {
          const toggles = new Uint8Array(2 * LABEL_COUNT);
          const was = new Uint8Array(2 * LABEL_COUNT).fill(255);
          const prevY = new Float64Array(2 * LABEL_COUNT).fill(NaN);
          let switches = 0;
          let near = -1;
          for (let i = 0; i <= steps; i++) {
            const t = dir > 0 ? i / steps : 1 - i / steps;
            const hu = s.playLo + 0.2 + (s.playHi - s.playLo - 0.4) * t;
            const cam = wideCam(s, hu, boundaryAt(s, B_TOP, hu) - 0.6, w, h);
            layoutLabels(f, cam, s, hu, w, h);
            if (near >= 0 && f.nearHi !== near) switches++;
            near = f.nearHi;
            ([f.lo, f.hi] as const).forEach((e, j) => {
              if (e.near) expect(e.count).toBe(LABEL_COUNT);
              for (let k = 0; k < LABEL_COUNT; k++) {
                const q = j * LABEL_COUNT + k;
                if (was[q] !== 255 && was[q] !== e.on[k]) toggles[q]++;
                was[q] = e.on[k];
                if (!e.on[k]) { prevY[q] = NaN; continue; }
                const lx = e.px.lx[k];
                const ly = e.px.ly[k];
                expect(lx).toBeGreaterThanOrEqual(SCREEN_EDGE - 0.5);
                expect(lx + WIDTHS[k]).toBeLessThanOrEqual(w - SCREEN_EDGE + 0.5);
                for (let r = 0; r < 3; r++) {
                  const apart = lx + WIDTHS[k] <= rects[r * 4] || lx >= rects[r * 4 + 2]
                    || ly + LABEL_GAP / 2 <= rects[r * 4 + 1] || ly - LABEL_GAP / 2 >= rects[r * 4 + 3];
                  expect(apart, `name ${k} over control ${r} at u ${hu.toFixed(2)}`).toBe(true);
                }
                // A shown name moves smoothly with the camera (no jump on docking).
                if (!Number.isNaN(prevY[q])) expect(Math.abs(ly - prevY[q])).toBeLessThan(40);
                prevY[q] = ly;
              }
            });
          }
          for (const n of toggles) expect(n).toBeLessThanOrEqual(1);
          expect(switches).toBeLessThanOrEqual(1);
        }
      }
    });
  }

  it('the nearer end changes only past the middle by NEAR_SWITCH (no back and forth near it)', () => {
    const s = createSlab(0, 0, 0.3, 1, 9);
    const f = frameFor(1366, 768);
    const mid = (s.playLo + s.playHi) / 2;
    const cam = wideCam(s, 0, boundaryAt(s, B_TOP, 0) - 0.6, 1366, 768);
    layoutLabels(f, cam, s, mid + 0.1, 1366, 768);
    expect(f.nearHi).toBe(1);
    for (const d of [-0.3, 0.2, -0.45, 0.4]) {
      layoutLabels(f, cam, s, mid + d, 1366, 768);
      expect(f.nearHi).toBe(1);
    }
    layoutLabels(f, cam, s, mid - NEAR_SWITCH - 0.01, 1366, 768);
    expect(f.nearHi).toBe(0);
    layoutLabels(f, cam, s, mid + 0.3, 1366, 768);
    expect(f.nearHi).toBe(0);
  });

  it('slides labels past a control vertically (below Pause, above the joystick), easing in beside it', () => {
    // Pause top right, the joystick bottom left, on 640 x 360.
    const rects = new Float64Array([487, 12, 628, 72, 24, 190, 170, 336]);
    const w = [102, 109, 81, 81, 84];
    const right = new Float64Array([532, 525, 553, 553, 550]);
    const ys = new Float64Array([60, 100, 140, 170, 200]);
    fitColumn(ys, right, w, rects, 2, 360);
    expect(ys[0]).toBe(72 + CONTROL_GAP + LABEL_GAP / 2);
    expect(ys[1]).toBe(ys[0] + LABEL_GAP);
    const left = new Float64Array([6, 6, 6, 6, 6]);
    const low = new Float64Array([100, 140, 170, 200, 260]);
    fitColumn(low, left, w, rects, 2, 360);
    expect(low[4]).toBe(190 - CONTROL_GAP - LABEL_GAP / 2);
    for (let k = 1; k < LABEL_COUNT; k++) expect(low[k] - low[k - 1]).toBeGreaterThanOrEqual(LABEL_GAP);
    // A label nearing the joystick sideways is moved part way, and clear of it.
    const near = new Float64Array([6, 6, 6, 6, 170 + CONTROL_GAP + CONTROL_RAMP / 2]);
    const part = new Float64Array([100, 140, 170, 200, 260]);
    fitColumn(part, near, w, rects, 2, 360);
    expect(part[4]).toBeGreaterThan(190 - CONTROL_GAP - LABEL_GAP / 2);
    expect(part[4]).toBeLessThan(260);
  });
});
