import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { occlusion, ign, OCCLUSION_FN_GLSL, IGN_GLSL, OCC_SEGMENTS } from '../../src/render/occlusion';
import { occluderSegments } from '../../src/render/occluderSegments';
import { mulberry32 } from '../../src/core/random';
import { DETAIL_GLSL, detailVertex, type DetailInputs } from '../../src/render/detailGlsl';
import { DISTURB_GLSL, disturbVertex, type MapSampler } from '../../src/render/leafGlsl';
import { litterTextureData, LITTER_TEX_N } from '../../src/render/litterTexture';
import { groundTextureData, GROUND_TEX_N } from '../../src/render/groundTexture';
import {
  NEAR_CLUTTER_GLSL, nearClutterVertex, clearScale, NEAR_CLUTTER_BOX, type NearClutterInputs,
} from '../../src/render/nearClutterGlsl';
import { buildDetailLeaves } from '../../src/surface/detailLeaves';
import { buildNearClutter } from '../../src/surface/nearClutter';
import { wrapAround } from '../../src/render/wrap';
import {
  createDisturbance, recentre, stamp, decay, packDisturbance, DIST_N, DIST_CELL,
} from '../../src/surface/disturbance';

/**
 * The GLSL twins on a real GPU: runs the shipped detailPosition (with meshGround and litterAt)
 * and disturb() in Chromium through transform feedback, on every vertex of a seeded third of the
 * detail leaves around five worm placements (two near the world edge, on the terrain mesh's
 * outer rings), and checks the TS twins (detailVertex, disturbVertex) land in the same place.
 */

/** Floats per vertex: aDetail (4), position (3) + pad, aLeaf2 (2) + pad, normal (3) + pad. */
const STRIDE = 16;
/** Float32 on the GPU, approximate sin/cos: 0.2 mm is far below anything visible. */
const TOLERANCE = 2e-4;

interface Case { focus: [number, number]; dist: number[]; origin: [number, number] }

function worm(hx: number, hz: number, yaw: number, curve: number): Case {
  const n = 16;
  const pts: number[][] = [];
  for (let i = 0; i < n; i++) {
    const th = curve * i * 0.22;
    const lx = (1 - Math.cos(th)) / curve;
    const lz = -Math.sin(th) / curve;
    pts.push([hx + Math.cos(yaw) * lx - Math.sin(yaw) * lz, hz + Math.sin(yaw) * lx + Math.cos(yaw) * lz]);
  }
  const m = createDisturbance();
  recentre(m, pts[7][0], pts[7][1]);
  const pass = (dx: number, dz: number) => {
    for (let k = 0; k <= 2 * (n - 1); k++) {
      const i = k >> 1;
      const j = Math.min(n - 1, i + (k & 1));
      stamp(m, (pts[i][0] + pts[j][0]) / 2 + dx, (pts[i][1] + pts[j][1]) / 2 + dz, 1);
    }
  };
  // An older, fading trail beside the body, so the slide is exercised too.
  pass(0.4, -0.3);
  for (let t = 0; t < 120; t++) decay(m, 1 / 60);
  pass(0, 0);
  const bytes = new Uint8Array(DIST_N * DIST_N * 4);
  packDisturbance(m, bytes);
  // The head a little off the 1 m snap, so the wrap centre and the focus differ.
  return { focus: [hx + 0.13, hz - 0.27], dist: Array.from(bytes), origin: [m.ci * DIST_CELL, m.cj * DIST_CELL] };
}

function samplerOf(bytes: number[]): MapSampler {
  return (u, v, out) => {
    const tx = u * DIST_N - 0.5;
    const tz = v * DIST_N - 0.5;
    const i = Math.floor(tx);
    const j = Math.floor(tz);
    const fx = tx - i;
    const fz = tz - j;
    const at = (a: number, b: number, ch: number) =>
      bytes[(Math.min(DIST_N - 1, Math.max(0, b)) * DIST_N + Math.min(DIST_N - 1, Math.max(0, a))) * 4 + ch] / 255;
    for (let ch = 0; ch < 4; ch++) {
      out[ch] = (at(i, j, ch) * (1 - fx) + at(i + 1, j, ch) * fx) * (1 - fz)
        + (at(i, j + 1, ch) * (1 - fx) + at(i + 1, j + 1, ch) * fx) * fz;
    }
  };
}

test('detail placement, meshGround and disturb run on the GPU as their TS twins say', async ({ page }) => {
  const litter = litterTextureData();
  const ground = groundTextureData();
  const g = buildDetailLeaves(2500).mesh.geometry;
  const pos = g.getAttribute('position');
  const det = g.getAttribute('aDetail');
  const leaf2 = g.getAttribute('aLeaf2');
  const nor = g.getAttribute('normal');
  // Every vertex of every third leaf (a leaf's vertices share one aDetail).
  const inputs: number[] = [];
  let leaf = -1;
  for (let v = 0; v < pos.count; v++) {
    if (v === 0 || det.getX(v) !== det.getX(v - 1) || det.getW(v) !== det.getW(v - 1)) leaf++;
    if (leaf % 3) continue;
    inputs.push(
      det.getX(v), det.getY(v), det.getZ(v), det.getW(v), pos.getX(v), pos.getY(v), pos.getZ(v), 0,
      leaf2.getX(v), leaf2.getY(v), 0, 0, nor.getX(v), nor.getY(v), nor.getZ(v), 0,
    );
  }
  const cases = [
    worm(0.31, -0.17, 0.7, 0.5), worm(6.4, -3.3, 2.1, -0.4), worm(-6.9, -7.2, 4.0, 0.3),
    worm(18.6, 17.9, 0.9, 0.2), worm(-18.8, 4.2, 3.3, -0.5),
  ];

  await page.setContent('<canvas id="c"></canvas>');
  const gpu = await page.evaluate(({ glsl, litter, litterN, ground, groundN, inputs, cases, stride }) => {
    const gl = (document.getElementById('c') as HTMLCanvasElement).getContext('webgl2');
    if (!gl) throw new Error('no WebGL 2');
    const vs = `#version 300 es
      precision highp float; precision highp int; precision highp sampler2D;
      #define texture2D texture
      #define attribute in
      in vec3 position; in vec2 aLeaf2; in vec3 normal;
      ${glsl}
      out vec4 oW; out vec4 oP; out vec4 oA;
      void main() {
        vec3 n = normal; float shade; vec4 anchor;
        vec4 wp = detailPosition(n, shade, anchor);
        oW = vec4(wp.xyz, shade);
        // As leafMaterial's main(): a leaf shrunk to nothing skips the drape.
        vec3 p = wp.xyz;
        if (anchor.z > 0.0) p = disturb(wp.xyz, anchor, 0.0, n);
        oP = vec4(p, 0.0); oA = anchor; gl_Position = vec4(0.0);
      }`;
    const fs = `#version 300 es
      precision highp float; out vec4 c; void main() { c = vec4(1.0); }`;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'compile');
      return s;
    };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(pr, shader(gl.FRAGMENT_SHADER, fs));
    gl.transformFeedbackVaryings(pr, ['oW', 'oP', 'oA'], gl.SEPARATE_ATTRIBS);
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr) ?? 'link');
    gl.useProgram(pr);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const tex = (unit: number, internal: number, n: number, fmt: number, type: number, data: ArrayBufferView, filter: number) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, n, n, 0, fmt, type, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    // As three uploads them: the maps filtered, the ground read texel by texel.
    const dist = tex(0, gl.RGBA8, 64, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(64 * 64 * 4), gl.LINEAR);
    tex(1, gl.RGBA8, litterN, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(litter), gl.LINEAR);
    tex(2, gl.R32F, groundN, gl.RED, gl.FLOAT, new Float32Array(ground), gl.NEAREST);
    const U = (name: string) => gl.getUniformLocation(pr, name);
    gl.uniform1i(U('uDisturb'), 0);
    gl.uniform1i(U('uLitter'), 1);
    gl.uniform1i(U('uGround'), 2);
    gl.uniform1f(U('uLeafReact'), 1);
    const n = inputs.length / stride;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(inputs), gl.STATIC_DRAW);
    for (const [name, off, size] of [['aDetail', 0, 4], ['position', 4, 3], ['aLeaf2', 8, 2], ['normal', 12, 3]] as const) {
      const l = gl.getAttribLocation(pr, name);
      if (l < 0) throw new Error(`no attribute ${name}`);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride * 4, off * 4);
    }
    gl.enable(gl.RASTERIZER_DISCARD);
    return cases.map((c) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, dist);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(c.dist));
      gl.uniform2f(U('uDistOrigin'), c.origin[0], c.origin[1]);
      gl.uniform3f(U('uFocus'), c.focus[0], 0, c.focus[1]);
      gl.uniform2f(U('uWrapCentre'), Math.round(c.focus[0]), Math.round(c.focus[1]));
      const bufs = [0, 1, 2].map((i) => {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, b);
        gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, n * 16, gl.STATIC_READ);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, i, b);
        return b;
      });
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, n);
      gl.endTransformFeedback();
      for (const i of [0, 1, 2]) gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, i, null);
      return bufs.map((b) => {
        const o = new Float32Array(n * 4);
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.getBufferSubData(gl.ARRAY_BUFFER, 0, o);
        return Array.from(o);
      });
    });
  }, {
    glsl: `${DETAIL_GLSL}\n${DISTURB_GLSL}`, litter: Array.from(litter), litterN: LITTER_TEX_N,
    ground: Array.from(ground), groundN: GROUND_TEX_N, inputs, cases, stride: STRIDE,
  });

  const n = inputs.length / STRIDE;
  const w = [0, 0, 0];
  const p = [0, 0, 0];
  const a = [0, 0, 0, 0];
  cases.forEach((c, ci) => {
    const [gw, gp, ga] = gpu[ci];
    const sample = samplerOf(c.dist);
    const inp: DetailInputs = {
      focusX: c.focus[0], focusZ: c.focus[1], wrapX: Math.round(c.focus[0]), wrapZ: Math.round(c.focus[1]), litter, ground,
    };
    let worst = 0;
    let shown = 0;
    let moved = 0;
    let gone = 0;
    for (let k = 0; k < n; k++) {
      const I = inputs.slice(k * STRIDE, k * STRIDE + STRIDE);
      const shade = detailVertex(inp, I.slice(0, 4), I.slice(4, 7), I[9], w, a);
      p[0] = w[0];
      p[1] = w[1];
      p[2] = w[2];
      if (a[2] > 0) disturbVertex(sample, c.origin[0], c.origin[1], true, w, a, 0, p);
      const o = k * 4;
      // A home exactly on a tile edge may land a tile apart on the CPU and GPU: only if shrunk to nothing.
      if (Math.abs(ga[o] - a[0]) > 1 || Math.abs(ga[o + 1] - a[1]) > 1) {
        expect(Math.max(a[2], ga[o + 2])).toBeLessThan(1e-6);
        continue;
      }
      if (a[2] > 0) shown++;
      else gone++;
      if (Math.hypot(p[0] - w[0], p[1] - w[1], p[2] - w[2]) > 1e-3) moved++;
      worst = Math.max(
        worst,
        Math.abs(gw[o] - w[0]), Math.abs(gw[o + 1] - w[1]), Math.abs(gw[o + 2] - w[2]), Math.abs(gw[o + 3] - shade),
        Math.abs(gp[o] - p[0]), Math.abs(gp[o + 1] - p[1]), Math.abs(gp[o + 2] - p[2]),
        Math.abs(ga[o] - a[0]), Math.abs(ga[o + 1] - a[1]), Math.abs(ga[o + 2] - a[2]), Math.abs(ga[o + 3] - a[3]),
      );
    }
    expect(Number.isFinite(worst), `case ${ci}`).toBe(true);
    expect(worst, `case ${ci}: worst |GPU - TS|`).toBeLessThan(TOLERANCE);
    // The sample is real: leaves near and far, and the drape moved some.
    expect(shown, `case ${ci}`).toBeGreaterThan(n / 2);
    expect(gone, `case ${ci}`).toBeGreaterThan(n / 10);
    expect(moved, `case ${ci}`).toBeGreaterThan(200);
  });
});

/** A 16-point curved spine (x, y, z triples, head first) whose seventh point is at (x, z). */
function spineThrough(x: number, z: number, yaw: number, curve: number): number[] {
  const pts: number[][] = [];
  for (let i = 0; i < 16; i++) {
    const th = curve * i * 0.22;
    const lx = (1 - Math.cos(th)) / curve;
    const lz = -Math.sin(th) / curve;
    pts.push([Math.cos(yaw) * lx - Math.sin(yaw) * lz, Math.sin(yaw) * lx + Math.cos(yaw) * lz]);
  }
  const dx = x - pts[6][0];
  const dz = z - pts[6][1];
  return pts.flatMap((p) => [p[0] + dx, 0.03, p[1] + dz]);
}

test('near clutter placement, meshGround and the worm keep-clear run on the GPU as their TS twins say', async ({ page }) => {
  const litter = litterTextureData();
  const ground = groundTextureData();
  const g = buildNearClutter().geometry;
  const pos = g.getAttribute('position');
  const wrap = g.getAttribute('aWrap');
  const stride = 8;
  // Every vertex of every item: aWrap (2), position (3), padding.
  const inputs: number[] = [];
  for (let v = 0; v < pos.count; v++) inputs.push(wrap.getX(v), wrap.getY(v), pos.getX(v), pos.getY(v), pos.getZ(v), 0, 0, 0);
  const n = pos.count;
  // Five wrap centres (two near the world edge, on the terrain mesh's outer rings); the worm's body
  // passes 0.1 to 0.5 m from the home of a different item in each, so the keep-clear shrinks it.
  const homeOf = (item: number, cx: number, cz: number): [number, number] => {
    let first = 0;
    for (let seen = -1, v = 0; v < n; v++) {
      if (v === 0 || wrap.getX(v) !== wrap.getX(v - 1) || wrap.getY(v) !== wrap.getY(v - 1)) seen++;
      if (seen === item) { first = v; break; }
    }
    return [wrapAround(wrap.getX(first), cx, NEAR_CLUTTER_BOX), wrapAround(wrap.getY(first), cz, NEAR_CLUTTER_BOX)];
  };
  const place = [
    { c: [0, 0], item: 3, off: [0.1, 0.05], yaw: 0.7, curve: 0.5 },
    { c: [6, -3], item: 11, off: [0.3, -0.2], yaw: 2.1, curve: -0.4 },
    { c: [-7, -7], item: 19, off: [-0.15, 0.4], yaw: 4.0, curve: 0.3 },
    { c: [19, 18], item: 27, off: [0.4, 0.1], yaw: 0.9, curve: 0.2 },
    { c: [-19, 4], item: 35, off: [0.0, -0.25], yaw: 3.3, curve: -0.5 },
  ];
  const cases = place.map((p) => {
    const [hx, hz] = homeOf(p.item, p.c[0], p.c[1]);
    const spine = spineThrough(hx + p.off[0], hz + p.off[1], p.yaw, p.curve);
    // The head a little off the 1 m snap, so the wrap centre and the focus differ.
    return { focus: [spine[0] + 0.13, spine[2] - 0.27] as [number, number], spine };
  });

  await page.setContent('<canvas id="c"></canvas>');
  const gpu = await page.evaluate(({ glsl, litter, litterN, ground, groundN, inputs, cases, stride }) => {
    const gl = (document.getElementById('c') as HTMLCanvasElement).getContext('webgl2');
    if (!gl) throw new Error('no WebGL 2');
    const vs = `#version 300 es
      precision highp float; precision highp int; precision highp sampler2D;
      #define texture2D texture
      #define attribute in
      in vec3 position;
      ${glsl}
      out vec4 oW;
      void main() {
        float shade;
        vec4 wp = nearClutterPosition(position, shade);
        oW = vec4(wp.xyz, shade); gl_Position = vec4(0.0);
      }`;
    const fs = `#version 300 es
      precision highp float; out vec4 c; void main() { c = vec4(1.0); }`;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'compile');
      return s;
    };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, shader(gl.VERTEX_SHADER, vs));
    gl.attachShader(pr, shader(gl.FRAGMENT_SHADER, fs));
    gl.transformFeedbackVaryings(pr, ['oW'], gl.SEPARATE_ATTRIBS);
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr) ?? 'link');
    gl.useProgram(pr);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const tex = (unit: number, internal: number, size: number, fmt: number, type: number, data: ArrayBufferView, filter: number) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, size, size, 0, fmt, type, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    // As three uploads them: the litter filtered, the ground read texel by texel.
    tex(1, gl.RGBA8, litterN, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(litter), gl.LINEAR);
    tex(2, gl.R32F, groundN, gl.RED, gl.FLOAT, new Float32Array(ground), gl.NEAREST);
    const U = (name: string) => gl.getUniformLocation(pr, name);
    gl.uniform1i(U('uLitter'), 1);
    gl.uniform1i(U('uGround'), 2);
    const count = inputs.length / stride;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(inputs), gl.STATIC_DRAW);
    for (const [name, off, size] of [['aWrap', 0, 2], ['position', 2, 3]] as const) {
      const l = gl.getAttribLocation(pr, name);
      if (l < 0) throw new Error(`no attribute ${name}`);
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride * 4, off * 4);
    }
    gl.enable(gl.RASTERIZER_DISCARD);
    return cases.map((c) => {
      gl.uniform3fv(U('uSpine[0]'), new Float32Array(c.spine));
      gl.uniform3f(U('uFocus'), c.focus[0], 0, c.focus[1]);
      gl.uniform2f(U('uWrapCentre'), Math.round(c.focus[0]), Math.round(c.focus[1]));
      const b = gl.createBuffer();
      gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, b);
      gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, count * 16, gl.STATIC_READ);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, b);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, count);
      gl.endTransformFeedback();
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
      const o = new Float32Array(count * 4);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.getBufferSubData(gl.ARRAY_BUFFER, 0, o);
      return Array.from(o);
    });
  }, {
    glsl: NEAR_CLUTTER_GLSL, litter: Array.from(litter), litterN: LITTER_TEX_N,
    ground: Array.from(ground), groundN: GROUND_TEX_N, inputs, cases, stride,
  });

  const out = [0, 0, 0];
  cases.forEach((c, ci) => {
    const inp: NearClutterInputs = {
      focusX: c.focus[0], focusZ: c.focus[1], wrapX: Math.round(c.focus[0]), wrapZ: Math.round(c.focus[1]),
      spine: c.spine, litter, ground,
    };
    let worst = 0;
    let shown = 0;
    let keptClear = 0;
    let gone = 0;
    for (let k = 0; k < n; k++) {
      const I = inputs.slice(k * stride, k * stride + stride);
      const shade = nearClutterVertex(inp, I.slice(0, 2), I.slice(2, 5), out);
      const o = k * 4;
      const hx = wrapAround(I[0], inp.wrapX, NEAR_CLUTTER_BOX);
      const hz = wrapAround(I[1], inp.wrapZ, NEAR_CLUTTER_BOX);
      // A home exactly on a tile edge may land a tile apart on the CPU and GPU: it is faded out there.
      if (Math.abs(gpu[ci][o] - out[0]) > 1 || Math.abs(gpu[ci][o + 2] - out[2]) > 1) {
        expect(Math.hypot(hx - inp.focusX, hz - inp.focusZ)).toBeGreaterThan(4.4);
        continue;
      }
      const s = clearScale(c.spine, hx, hz);
      if (Math.hypot(hx - inp.focusX, hz - inp.focusZ) >= 4.5) gone++;
      else if (s > 0 && s < 1) keptClear++;
      else if (s === 1) shown++;
      worst = Math.max(
        worst, Math.abs(gpu[ci][o] - out[0]), Math.abs(gpu[ci][o + 1] - out[1]), Math.abs(gpu[ci][o + 2] - out[2]),
        Math.abs(gpu[ci][o + 3] - shade),
      );
    }
    expect(Number.isFinite(worst), `case ${ci}`).toBe(true);
    expect(worst, `case ${ci}: worst |GPU - TS|`).toBeLessThan(TOLERANCE);
    // The sample is real: items at full size, items far and faded out, items shrunk by the worm.
    expect(shown, `case ${ci}`).toBeGreaterThan(100);
    expect(gone, `case ${ci}`).toBeGreaterThan(100);
    expect(keptClear, `case ${ci}`).toBeGreaterThan(20);
  });
});

test('the occluder fade (occlusion, ign) runs on the GPU as its TS twins say', async ({ page }) => {
  // Three worm poses seen by three cameras; leaves along rays through the screen near each.
  const poses = [
    { spine: spineThrough(0.2, -1.3, 1.57, 0.4), cam: [0.1, 1.1, -3.9], look: [0.2, 0.6, 0.4] },
    { spine: spineThrough(5.0, 2.0, 0.3, -0.8), cam: [3.6, 0.9, 0.8], look: [6.0, 0.2, 3.5] },
    { spine: spineThrough(-3.0, 4.0, 2.6, 1.2), cam: [-2.0, 1.4, 1.8], look: [-3.5, 0.3, 4.8] },
  ];
  const cases = poses.map((c) => {
    const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
    camera.position.fromArray(c.cam);
    camera.lookAt(new THREE.Vector3().fromArray(c.look));
    camera.updateMatrixWorld();
    const pe = camera.projectionMatrix.elements;
    const seg = new Float32Array(OCC_SEGMENTS * 8);
    const count = occluderSegments(c.spine, camera.matrixWorldInverse.elements, pe[0], pe[5], seg, new Float32Array(4));
    // Pixels within the box's reach, leaves at any depth along them: (tan x, tan y, view depth).
    const rng = mulberry32(3);
    const points: number[] = [];
    for (let k = 0; k < 4000; k++) {
      const tx = (rng() * 2 - 1) / pe[0];
      const ty = (rng() * 2 - 1) / pe[5];
      points.push(tx, ty, 0.3 + rng() * 4, 0);
    }
    return { seg: Array.from(seg), count, points };
  });

  await page.setContent('<canvas id="c" width="64" height="64"></canvas>');
  const gpu = await page.evaluate(({ fn, ignGlsl, cases, segs }) => {
    const gl = (document.getElementById('c') as HTMLCanvasElement).getContext('webgl2', { antialias: false });
    if (!gl) throw new Error('no WebGL 2');
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'compile');
      return s;
    };
    const program = (vs: string, fs: string, feedback: string[]) => {
      const pr = gl.createProgram()!;
      gl.attachShader(pr, shader(gl.VERTEX_SHADER, vs));
      gl.attachShader(pr, shader(gl.FRAGMENT_SHADER, fs));
      if (feedback.length) gl.transformFeedbackVaryings(pr, feedback, gl.SEPARATE_ATTRIBS);
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr) ?? 'link');
      return pr;
    };
    // occlusion() at each pixel and depth, by transform feedback.
    const pr = program(`#version 300 es
      precision highp float; precision highp int;
      uniform vec4 uOccSeg[${segs * 2}]; uniform int uOccCount;
      in vec4 aPoint;
      ${fn}
      out float oOcc;
      void main() { oOcc = occlusion(aPoint.xy, aPoint.z); gl_Position = vec4(0.0); }`,
    `#version 300 es
      precision highp float; out vec4 c; void main() { c = vec4(1.0); }`, ['oOcc']);
    gl.useProgram(pr);
    const U = (name: string) => gl.getUniformLocation(pr, name);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const occ = cases.map((c) => {
      const n = c.points.length / 4;
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(c.points), gl.STATIC_DRAW);
      const l = gl.getAttribLocation(pr, 'aPoint');
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, 4, gl.FLOAT, false, 16, 0);
      gl.uniform4fv(U('uOccSeg[0]'), new Float32Array(c.seg));
      gl.uniform1i(U('uOccCount'), c.count);
      const b = gl.createBuffer();
      gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, b);
      gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, n * 4, gl.STATIC_READ);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, b);
      gl.enable(gl.RASTERIZER_DISCARD);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, n);
      gl.endTransformFeedback();
      gl.disable(gl.RASTERIZER_DISCARD);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
      const o = new Float32Array(n);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.getBufferSubData(gl.ARRAY_BUFFER, 0, o);
      return Array.from(o);
    });
    // The dither on a full-screen triangle: which pixels of a 0.6 drop survive, drawn twice.
    const dpr = program(`#version 300 es
      precision highp float;
      void main() { gl_Position = vec4(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0, 0.0, 1.0); }`,
    `#version 300 es
      precision highp float;
      ${ignGlsl}
      out vec4 c;
      void main() { if (ign(gl_FragCoord.xy) < 0.6) discard; c = vec4(1.0); }`, []);
    gl.useProgram(dpr);
    const draw = () => {
      gl.viewport(0, 0, 64, 64);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const px = new Uint8Array(64 * 64 * 4);
      gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, px);
      return Array.from({ length: 64 * 64 }, (_, k) => (px[k * 4] > 127 ? 1 : 0));
    };
    return { occ, kept: [draw(), draw()] };
  }, { fn: OCCLUSION_FN_GLSL, ignGlsl: IGN_GLSL, cases, segs: OCC_SEGMENTS });

  cases.forEach((c, ci) => {
    let worst = 0;
    let off = 0;
    let faded = 0;
    let clear = 0;
    for (let k = 0; k < c.points.length / 4; k++) {
      const ts = occlusion(c.points[k * 4], c.points[k * 4 + 1], c.points[k * 4 + 2], c.seg, c.count);
      const d = Math.abs(gpu.occ[ci][k] - ts);
      worst = Math.max(worst, d);
      if (d > 1e-3) off++;
      if (ts > 0.01) faded++;
      else clear++;
    }
    expect(c.count, `case ${ci}`).toBeGreaterThan(3);
    expect(Number.isFinite(worst), `case ${ci}`).toBe(true);
    // Float32 against float64: nearly every pixel agrees to 1e-3 of its drop share. Where two
    // segments tie for nearest, the GPU may take the other one's line for the touch: still within
    // about one step of the 8-bit dither.
    expect(off, `case ${ci}: pixels off by more than 1e-3`).toBeLessThan(c.points.length / 4 / 200);
    expect(worst, `case ${ci}: worst |GPU - TS|`).toBeLessThan(0.01);
    // The sample is real: pixels in the fade and pixels out of it.
    expect(faded, `case ${ci}`).toBeGreaterThan(40);
    expect(clear, `case ${ci}`).toBeGreaterThan(1000);
  });
  // The same pixels survive every frame (no shimmer), 40% of them, as the TS twin picks them.
  expect(gpu.kept[1]).toEqual(gpu.kept[0]);
  const kept = gpu.kept[0];
  expect(kept.reduce((a: number, b) => a + b, 0) / kept.length).toBeCloseTo(0.4, 1);
  let agree = 0;
  for (let k = 0; k < kept.length; k++) if (kept[k] === (ign((k % 64) + 0.5, Math.floor(k / 64) + 0.5) < 0.6 ? 0 : 1)) agree++;
  expect(agree / kept.length).toBeGreaterThan(0.97);
});
