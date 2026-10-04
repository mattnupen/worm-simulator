import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildNearClutter, buildNearClutterLayer, NEAR_CLUTTER_COUNT,
} from '../../src/surface/nearClutter';
import {
  clearScale, nearClutterVertex, spineDistance, NEAR_CLUTTER_CLEAR, NEAR_CLUTTER_FADE_OUT, NEAR_CLUTTER_GLSL,
  NEAR_CLUTTER_REACH, type NearClutterInputs,
} from '../../src/render/nearClutterGlsl';
import { NEAR_CLUTTER_BOX, createPropMaterial } from '../../src/render/propMaterial';
import { groundUniforms, setSpine, SPINE_POINTS } from '../../src/render/groundUniforms';
import { litterTextureData } from '../../src/render/litterTexture';
import { groundTextureData } from '../../src/render/groundTexture';
import { meshGroundHeight } from '../../src/surface/terrainMesh';
import { wrapAround } from '../../src/render/wrap';
import { buildWorld } from '../../src/game/world';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import { PRESETS } from '../../src/render/graphics';
import { mulberry32 } from '../../src/core/random';
import { HeroWorm, type WormPose } from '../../src/worm/wormMesh';
import { DEFAULT_SCALE, SCALE_MODES, setScale } from '../../src/surface/worldScale';

describe('near-worm clutter (Ultra)', () => {
  const mesh = buildNearClutter();
  const g = mesh.geometry;

  it('is one hidden mesh placed by the WRAP shader, a home for every vertex', () => {
    expect(mesh.visible).toBe(false);
    expect(mesh.frustumCulled).toBe(false);
    expect(mesh.material).toHaveProperty('defines.WRAP');
    const homes = g.getAttribute('aWrap').array as Float32Array;
    expect(g.getAttribute('aWrap').count).toBe(g.getAttribute('position').count);
    expect(new Set(Array.from(homes)).size).toBeGreaterThanOrEqual(NEAR_CLUTTER_COUNT);
    for (const h of homes) {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it('is small: local items around the origin, a few thousand triangles, within the reach the shader assumes', () => {
    const pos = g.getAttribute('position').array as Float32Array;
    let reach = 0;
    for (let v = 0; v < pos.length; v += 3) reach = Math.max(reach, Math.hypot(pos[v], pos[v + 2]));
    expect(reach).toBeLessThanOrEqual(NEAR_CLUTTER_REACH);
    // The constant is honest: not a loose bound that would hide items for nothing.
    expect(reach).toBeGreaterThan(NEAR_CLUTTER_REACH * 0.75);
    expect(g.index!.count / 3).toBeLessThan(6000);
  });

  it('its wrap tile covers the 4.5 m fade', () => {
    expect(NEAR_CLUTTER_BOX / 2 - 0.5).toBeGreaterThanOrEqual(NEAR_CLUTTER_FADE_OUT);
  });

  it('shares the head, wrap centre and spine uniforms, and reads the baked ground', () => {
    const m = mesh.material as THREE.ShaderMaterial;
    expect(m.uniforms.uFocus).toBe(groundUniforms.uFocus);
    expect(m.uniforms.uWrapCentre).toBe(groundUniforms.uWrapCentre);
    expect(m.uniforms.uSpine).toBe(groundUniforms.uSpine);
    expect(m.vertexShader).toContain('nearClutterPosition(position, shade)');
    expect(NEAR_CLUTTER_GLSL).toContain('meshGround(xz)');
    expect(createPropMaterial().defines).not.toHaveProperty('WRAP');
    expect(SPINE_POINTS).toBe(WORM_SEGMENTS);
  });
});

describe('the lazily built near clutter layer', () => {
  it('builds nothing until shown, then keeps the one mesh', () => {
    const l = buildNearClutterLayer();
    l.show(false);
    expect(l.built).toBeNull();
    expect(l.visible).toBe(false);
    l.show(true);
    const built = l.built!;
    expect(l.group.children).toEqual([built]);
    expect(l.visible).toBe(true);
    l.show(false);
    expect(built.visible).toBe(false);
    expect(l.visible).toBe(false);
    l.show(true);
    expect(l.built).toBe(built);
    expect(built.visible).toBe(true);
  });

  it('the world shows it on Ultra only, and builds it only then', () => {
    const world = buildWorld(new Crawl());
    world.apply(PRESETS.low);
    world.apply(PRESETS.high);
    expect(world.nearClutter.built).toBeNull();
    world.apply(PRESETS.ultra);
    expect(world.nearClutter.visible).toBe(true);
    expect(world.scene.getObjectByName('nearClutter')).toBe(world.nearClutter.built);
    world.apply(PRESETS.high);
    expect(world.nearClutter.visible).toBe(false);
  });

  it('the world hands the rendered spine to the shader only while it is shown', () => {
    const crawl = new Crawl();
    const world = buildWorld(crawl);
    const camera = new THREE.PerspectiveCamera();
    const uSpine = groundUniforms.uSpine.value;
    uSpine.fill(-77);
    world.apply(PRESETS.high);
    world.sync(crawl, 1, 0, camera);
    expect(uSpine.every((v) => v === -77)).toBe(true);
    world.apply(PRESETS.ultra);
    world.sync(crawl, 1, 0, camera);
    expect(uSpine.some((v) => v === -77)).toBe(false);
    expect(groundUniforms.uSpine.value).toBe(uSpine);
    expect(uSpine.length).toBe(WORM_SEGMENTS * 3);
  });

  it('the world hands the leaf fade the body as this frame\'s camera sees it, on every preset', () => {
    const crawl = new Crawl();
    const world = buildWorld(crawl);
    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.2, 120);
    const g = groundUniforms;
    for (const p of [PRESETS.low, PRESETS.high, PRESETS.ultra]) {
      g.uOccCount.value = -1;
      g.uOccBox.value.set(9, 9, 9, 9);
      world.apply(p);
      world.sync(crawl, 1, 0, camera);
      // The worm (straight at first) is in front of the follow camera: a box within the screen.
      expect(g.uOccCount.value).toBeGreaterThan(0);
      expect(g.uOccBox.value.x).toBeLessThan(g.uOccBox.value.z);
      expect(g.uOccBox.value.y).toBeLessThan(g.uOccBox.value.w);
      expect(g.uOccBox.value.x).toBeGreaterThan(-1);
      expect(g.uOccBox.value.z).toBeLessThan(1);
      expect(g.uOccTan.value.y).toBeCloseTo(Math.tan(Math.PI / 6), 6);
      expect(g.uOccDepth.value).toBeGreaterThan(2);
    }
  });

  it('setSpine copies in place', () => {
    const s = Float32Array.from({ length: SPINE_POINTS * 3 }, (_, i) => i);
    const target = groundUniforms.uSpine.value;
    setSpine(s);
    expect(groundUniforms.uSpine.value).toBe(target);
    expect(Array.from(target)).toEqual(Array.from(s));
  });
});

describe('near clutter placement (TS twin of nearClutterPosition)', () => {
  const g = buildNearClutter().geometry;
  const pos = g.getAttribute('position');
  const wrap = g.getAttribute('aWrap');
  const w2 = [0, 0];
  const p3 = [0, 0, 0];
  const out = [0, 0, 0];
  const far = new Float32Array(SPINE_POINTS * 3);
  const inp: NearClutterInputs = {
    focusX: 0, focusZ: 0, wrapX: 0, wrapZ: 0, spine: far, litter: litterTextureData(), ground: groundTextureData(),
  };
  const setFocus = (x: number, z: number) => {
    inp.focusX = x;
    inp.focusZ = z;
    inp.wrapX = Math.round(x);
    inp.wrapZ = Math.round(z);
  };
  const place = (v: number) => {
    w2[0] = wrap.getX(v);
    w2[1] = wrap.getY(v);
    p3[0] = pos.getX(v);
    p3[1] = pos.getY(v);
    p3[2] = pos.getZ(v);
    return nearClutterVertex(inp, w2, p3, out);
  };
  /** A straight spine from the head at (x, z) heading `yaw`, 0.22 between points. */
  const straight = (x: number, z: number, yaw: number): Float32Array => {
    const a = new Float32Array(SPINE_POINTS * 3);
    for (let i = 0; i < SPINE_POINTS; i++) a.set([x - Math.cos(yaw) * 0.22 * i, 0.03, z - Math.sin(yaw) * 0.22 * i], i * 3);
    return a;
  };

  it('with the worm elsewhere, lays every vertex on the rendered ground, shaded by the trunk shade', () => {
    let full = 0;
    for (const [fx, fz] of [[0.3, -0.2], [7.6, 3.1], [-12.4, 9.8], [15.2, -16.7]]) {
      setFocus(fx, fz);
      inp.spine = straight(fx + 40, fz + 40, 0);
      for (let v = 0; v < pos.count; v++) {
        const shade = place(v);
        expect(shade).toBeGreaterThan(0.4);
        expect(shade).toBeLessThanOrEqual(1);
        const hx = wrapAround(wrap.getX(v), inp.wrapX, NEAR_CLUTTER_BOX);
        const hz = wrapAround(wrap.getY(v), inp.wrapZ, NEAR_CLUTTER_BOX);
        const fade = Math.hypot(hx - fx, hz - fz);
        if (fade >= NEAR_CLUTTER_FADE_OUT) {
          // Faded out: one point.
          expect(out[0]).toBe(hx);
          expect(out[2]).toBe(hz);
          continue;
        }
        if (fade > 3.5) continue;
        full++;
        // The rendered ground (the terrain mesh) under the vertex, plus its height in the item.
        expect(out[1] - meshGroundHeight(out[0], out[2]) - pos.getY(v)).toBeCloseTo(0, 5);
        expect(out[0] - hx).toBeCloseTo(pos.getX(v), 6);
        expect(out[2] - hz).toBeCloseTo(pos.getZ(v), 6);
      }
    }
    expect(full).toBeGreaterThan(1000);
  });

  it('keeps every vertex clear of the worm: a spine through an item hides it, one beside it shrinks it', () => {
    let shrunk = 0;
    let hidden = 0;
    for (let item = 0; item < NEAR_CLUTTER_COUNT; item += 3) {
      // The item's vertices share a home: take it from the item's first vertex.
      const v0 = (() => {
        let v = 0;
        let seen = -1;
        for (; v < pos.count; v++) {
          if (v === 0 || wrap.getX(v) !== wrap.getX(v - 1) || wrap.getY(v) !== wrap.getY(v - 1)) seen++;
          if (seen === item) break;
        }
        return v;
      })();
      setFocus(0, 0);
      const hx = wrapAround(wrap.getX(v0), 0, NEAR_CLUTTER_BOX);
      const hz = wrapAround(wrap.getY(v0), 0, NEAR_CLUTTER_BOX);
      for (const [off, yaw] of [[0, 0.3], [0.1, 1.9], [0.35, -2.2], [0.6, 4.1], [1.1, 0]]) {
        // A body whose middle passes `off` m from the item's home, so the home is also near the worm.
        const nx = -Math.sin(yaw);
        const nz = Math.cos(yaw);
        const spine = straight(hx + nx * off + Math.cos(yaw) * 1.6, hz + nz * off + Math.sin(yaw) * 1.6, yaw);
        inp.spine = spine;
        inp.focusX = hx + 1;
        inp.focusZ = hz;
        inp.wrapX = 0;
        inp.wrapZ = 0;
        const s = clearScale(spine, hx, hz);
        if (s === 0) hidden++;
        else if (s < 1) shrunk++;
        for (let v = v0; v < pos.count && wrap.getX(v) === wrap.getX(v0) && wrap.getY(v) === wrap.getY(v0); v++) {
          place(v);
          // The shader's scale already includes the head-distance fade; whatever it is, every
          // vertex stays at least CLEAR from the spine (a hidden item is a point, drawn as nothing).
          if (s === 0) continue;
          expect(spineDistance(spine, out[0], out[2])).toBeGreaterThanOrEqual(NEAR_CLUTTER_CLEAR - 1e-6);
        }
      }
    }
    expect(hidden).toBeGreaterThan(5);
    expect(shrunk).toBeGreaterThan(5);
  });

  it.each(SCALE_MODES)('%s: keeps clear of the real worm over seeded crawls (the sedge never pokes through the body)', (mode) => {
    setScale(mode);
    inp.litter = litterTextureData();
    inp.ground = groundTextureData();
    try {
      keepsClear();
    } finally {
      setScale(DEFAULT_SCALE);
      inp.litter = litterTextureData();
      inp.ground = groundTextureData();
    }
  });

  /** Seeded crawls in the active mode: no near-clutter vertex comes within CLEAR of the spine. */
  function keepsClear(): void {
    const rng = mulberry32(17);
    const crawl = new Crawl();
    const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
    const camera = new THREE.PerspectiveCamera();
    const move = { x: 0, y: 1 };
    let t = 0;
    let checked = 0;
    let shrunk = 0;
    for (let s = 0; s < 1500; s++) {
      if (s % 90 === 0) {
        const r = rng();
        move.x = (rng() * 2 - 1) * (r < 0.2 ? 1 : 0.5);
        move.y = r < 0.1 ? 0 : 1;
      }
      crawl.step(1 / 60, move);
      t += 1 / 60;
      if (s % 7) continue;
      crawl.interpolate(0.5, t, pose, camera);
      inp.spine = pose.spine;
      setFocus(crawl.focus.x, crawl.focus.z);
      for (let v = 0; v < pos.count; v += 3) {
        const hx = wrapAround(wrap.getX(v), inp.wrapX, NEAR_CLUTTER_BOX);
        const hz = wrapAround(wrap.getY(v), inp.wrapZ, NEAR_CLUTTER_BOX);
        if (Math.hypot(hx - inp.focusX, hz - inp.focusZ) > 4.4) continue;
        place(v);
        const s = clearScale(pose.spine, hx, hz);
        // Hidden by the worm: every vertex collapses to the home, which draws nothing.
        if (s === 0) continue;
        checked++;
        if (s < 1) shrunk++;
        expect(spineDistance(pose.spine, out[0], out[2])).toBeGreaterThanOrEqual(NEAR_CLUTTER_CLEAR - 1e-5);
      }
    }
    // The sample is real: items near the worm, some of them shrunk by it.
    expect(checked).toBeGreaterThan(5000);
    expect(shrunk).toBeGreaterThan(50);
  }

  it('CLEAR covers the real body: no vertex of the worm tube lies farther than CLEAR from its spine', () => {
    // clearScale measures from the 16-point spine polyline, but the body is a tube around it, wider
    // where it swells and curving between the points. Rest, crawl and hard turns, seeded.
    const crawl = new Crawl();
    const worm = new HeroWorm(WORM_SEGMENTS);
    const tube = (worm.group.getObjectByName('worm') as THREE.Mesh).geometry.getAttribute('position');
    const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
    const camera = new THREE.PerspectiveCamera();
    const rng = mulberry32(5);
    // [steps, move x, move y]: rest, crawl, turn left, turn right, then a seeded wander.
    const script: [number, number, number][] = [[120, 0, 0], [240, 0, 1], [180, -1, 1], [180, 1, 1], [120, 0, 0]];
    for (let k = 0; k < 20; k++) {
      const r = rng();
      script.push([90, (rng() * 2 - 1) * (r < 0.3 ? 1 : 0.5), r < 0.25 ? 0 : 1]);
    }
    let t = 0;
    let worst = 0;
    let poses = 0;
    for (const [steps, mx, my] of script) {
      const move = { x: mx, y: my };
      for (let s = 0; s < steps; s++) {
        crawl.step(1 / 60, move);
        t += 1 / 60;
        if (s % 6) continue;
        crawl.interpolate(0.5, t, pose, camera);
        worm.update(pose);
        poses++;
        for (let v = 0; v < tube.count; v++) worst = Math.max(worst, spineDistance(pose.spine, tube.getX(v), tube.getZ(v)));
      }
    }
    expect(poses).toBeGreaterThan(400);
    // Measured 0.135 against 0.2 (seed 5): the body's side plus its peristaltic swell.
    expect(worst).toBeGreaterThan(0.1);
    expect(worst).toBeLessThan(NEAR_CLUTTER_CLEAR);
  });

  it('an item grows smoothly back to full size as the worm moves away, and never pops', () => {
    const v = 0;
    setFocus(0, 0);
    const hx = wrapAround(wrap.getX(v), 0, NEAR_CLUTTER_BOX);
    const hz = wrapAround(wrap.getY(v), 0, NEAR_CLUTTER_BOX);
    // Crosswise vertex: the farthest-out vertex of the item.
    let far2 = 0;
    for (let k = 0; k < pos.count && wrap.getX(k) === wrap.getX(v) && wrap.getY(k) === wrap.getY(v); k++) {
      if (Math.hypot(pos.getX(k), pos.getZ(k)) > Math.hypot(pos.getX(far2), pos.getZ(far2))) far2 = k;
    }
    let last = -1;
    for (let d = 0; d <= 1.2; d += 0.01) {
      inp.spine = straight(hx + 1.6, hz + d, Math.PI);
      inp.focusX = hx + 1.6;
      inp.focusZ = hz + d;
      inp.wrapX = Math.round(inp.focusX);
      inp.wrapZ = Math.round(inp.focusZ);
      if (wrapAround(wrap.getX(v), inp.wrapX, NEAR_CLUTTER_BOX) !== hx) continue;
      place(far2);
      const r = Math.hypot(out[0] - hx, out[2] - hz);
      expect(r).toBeGreaterThanOrEqual(last - 1e-6);
      if (last >= 0) expect(r - last).toBeLessThan(0.02);
      last = r;
    }
    expect(last).toBeGreaterThan(0.3);
  });

  it('never pops: an item jumps to another tile copy only while faded out', () => {
    const last = new Float64Array(pos.count * 3).fill(NaN);
    let jumps = 0;
    inp.spine = far;
    for (let t = 0; t < 40; t += 0.02) {
      setFocus(8 * Math.sin(t * 0.21) + t * 0.3, 6 * Math.cos(t * 0.17) - t * 0.2);
      for (let v = 0; v < pos.count; v += 11) {
        place(v);
        const k = v * 3;
        if (!Number.isNaN(last[k]) && Math.hypot(out[0] - last[k], out[2] - last[k + 2]) > 1) {
          jumps++;
          // Gone on both sides: the item is a point at its home.
          const hx = wrapAround(wrap.getX(v), inp.wrapX, NEAR_CLUTTER_BOX);
          const hz = wrapAround(wrap.getY(v), inp.wrapZ, NEAR_CLUTTER_BOX);
          expect(Math.hypot(out[0] - hx, out[2] - hz)).toBeLessThan(0.02);
        }
        last[k] = out[0];
        last[k + 2] = out[2];
      }
    }
    expect(jumps).toBeGreaterThan(50);
  });
});
