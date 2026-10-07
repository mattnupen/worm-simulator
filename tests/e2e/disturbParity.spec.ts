import { test, expect } from '@playwright/test';
import { DISTURB_GLSL, LID_FROM, LID_TO, disturbVertex, packedMapSampler } from '../../src/render/leafGlsl';
import { mulberry32 } from '../../src/core/random';
import {
  createDisturbance, recentre, stampBody, decay, packDisturbance, DIST_N, DIST_CELL, DIST_SPAN,
} from '../../src/surface/disturbance';
import { disturbReach } from '../../src/surface/leafScale';

/**
 * disturb() on a real GPU for leaves of every size up to real size (the lid rule above LID_FROM)
 * and through two windows (uDistFade): the shipped GLSL in Chromium through transform feedback,
 * against its TS twin (disturbVertex).
 */

/** Floats per vertex: anchor (4), position (3), dip. */
const STRIDE = 8;
/** Float32 on the GPU: 0.2 mm is far below anything visible. */
const TOLERANCE = 2e-4;
const RADII = [0.5, 1.0, 1.25, 1.45, 1.6, 1.8, 2.2, 3.0];

interface Case { dist: number[]; trail: number[]; origin: [number, number]; fade: number[]; inputs: number[] }

/** A curved worm whose seventh point is at (x, z), heading yaw. */
function spine(x: number, z: number, yaw: number, curve: number): { x: number; y: number; z: number }[] {
  const pts: { x: number; y: number; z: number }[] = [];
  let a = yaw;
  let px = 0;
  let pz = 0;
  for (let i = 0; i < 16; i++) {
    pts.push({ x: px, y: 0, z: pz });
    px -= Math.sin(a) * 0.22;
    pz -= Math.cos(a) * 0.22;
    a += curve * 0.22;
  }
  const dx = x - pts[7].x;
  const dz = z - pts[7].z;
  return pts.map((p) => ({ x: p.x + dx, y: 0, z: p.z + dz }));
}

/**
 * The map around a worm at (x, z), partly under the litter, with an older trail 3.3 m to its side,
 * and leaves of every radius over both. `narrow`: read through a narrower window than the game's
 * (fading out from 3.4 to 3.88 m, V1's Classic window), so the trail lies in its fade; the window
 * is a uniform, so any one works.
 */
function makeCase(narrow: boolean, x: number, z: number, yaw: number, curve: number, seed: number): Case {
  const r = { ...disturbReach(), ...(narrow ? { fadeFrom: 3.4, fadeTo: 3.88 } : {}) };
  const m = createDisturbance();
  const old = spine(x + 3.3, z + 0.4, yaw + 0.5, -curve);
  const now = spine(x, z, yaw, curve);
  const under = Float32Array.from({ length: 16 }, (_, i) => (i % 4 === 0 ? 0.6 : 1));
  recentre(m, old[7].x, old[7].z);
  stampBody(m, old, under, r.stamp, r.onTop);
  for (let t = 0; t < 90; t++) decay(m, 1 / 60);
  recentre(m, now[7].x, now[7].z);
  stampBody(m, now, under, r.stamp, r.onTop);
  const near = new Uint8Array(DIST_N * DIST_N * 4);
  const trail = new Uint8Array(DIST_N * DIST_N * 2);
  packDisturbance(m, near, trail);
  const rng = mulberry32(seed);
  const inputs: number[] = [];
  for (let k = 0; k < 900; k++) {
    // Anchors over the worm, its trail and the window's edge.
    const ax = x - 1 + rng() * 6.5;
    const az = z - 3.5 + rng() * 7;
    const rad = RADII[k % RADII.length];
    const rest = rng() * 0.02;
    for (let v = 0; v < 4; v++) {
      const th = rng() * Math.PI * 2;
      const f = rng();
      inputs.push(ax, az, rad, rest, ax + Math.cos(th) * rad * f, rng() * 0.01, az + Math.sin(th) * rad * f, rng() * 0.02);
    }
  }
  return {
    dist: Array.from(near), trail: Array.from(trail), origin: [m.ci * DIST_CELL, m.cj * DIST_CELL],
    fade: [r.fadeFrom / (DIST_SPAN / 2), r.fadeTo / (DIST_SPAN / 2)], inputs,
  };
}

test('disturb runs on the GPU as its TS twin says, for leaves up to real size and in a narrow and the full window', async ({ page }) => {
  const cases = [
    makeCase(true, 0.3, -0.2, 0.7, 0.5, 11), makeCase(false, -4.1, 2.6, 2.2, -0.4, 12),
    makeCase(false, 7.3, -6.4, -1.1, 0.8, 13),
  ];
  await page.setContent('<canvas id="c"></canvas>');
  const gpu = await page.evaluate(({ glsl, cases, stride, distN }) => {
    const gl = (document.getElementById('c') as HTMLCanvasElement).getContext('webgl2');
    if (!gl) throw new Error('no WebGL 2');
    const vs = `#version 300 es
      precision highp float; precision highp int; precision highp sampler2D;
      #define texture2D texture
      in vec4 aAnchor; in vec3 position; in float aDip;
      ${glsl}
      out vec4 oP;
      void main() {
        vec3 n = vec3(0.0, 1.0, 0.0);
        oP = vec4(disturb(position, aAnchor, aDip, n), 0.0);
        gl_Position = vec4(0.0);
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
    gl.transformFeedbackVaryings(pr, ['oP'], gl.SEPARATE_ATTRIBS);
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr) ?? 'link');
    gl.useProgram(pr);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    const tex = (unit: number, internal: number, fmt: number, bytes: number) => {
      const t = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal, distN, distN, 0, fmt, gl.UNSIGNED_BYTE, new Uint8Array(distN * distN * bytes));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    const dist = tex(0, gl.RGBA8, gl.RGBA, 4);
    const trailTex = tex(1, gl.RG8, gl.RG, 2);
    const U = (name: string) => gl.getUniformLocation(pr, name);
    gl.uniform1i(U('uDisturb'), 0);
    gl.uniform1i(U('uDisturbTrail'), 1);
    gl.uniform1f(U('uLeafReact'), 1);
    return cases.map((c) => {
      const n = c.inputs.length / stride;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(c.inputs), gl.STATIC_DRAW);
      for (const [name, off, size] of [['aAnchor', 0, 4], ['position', 4, 3], ['aDip', 7, 1]] as const) {
        const l = gl.getAttribLocation(pr, name);
        if (l < 0) throw new Error(`no attribute ${name}`);
        gl.enableVertexAttribArray(l);
        gl.vertexAttribPointer(l, size, gl.FLOAT, false, stride * 4, off * 4);
      }
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, dist);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, distN, distN, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(c.dist));
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, trailTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, distN, distN, gl.RG, gl.UNSIGNED_BYTE, new Uint8Array(c.trail));
      gl.uniform2f(U('uDistOrigin'), c.origin[0], c.origin[1]);
      gl.uniform2f(U('uDistFade'), c.fade[0], c.fade[1]);
      const b = gl.createBuffer();
      gl.bindBuffer(gl.TRANSFORM_FEEDBACK_BUFFER, b);
      gl.bufferData(gl.TRANSFORM_FEEDBACK_BUFFER, n * 16, gl.STATIC_READ);
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, b);
      gl.enable(gl.RASTERIZER_DISCARD);
      gl.beginTransformFeedback(gl.POINTS);
      gl.drawArrays(gl.POINTS, 0, n);
      gl.endTransformFeedback();
      gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
      const o = new Float32Array(n * 4);
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.getBufferSubData(gl.ARRAY_BUFFER, 0, o);
      return Array.from(o);
    });
  }, { glsl: DISTURB_GLSL, cases, stride: STRIDE, distN: DIST_N });

  const out = [0, 0, 0];
  cases.forEach((c, ci) => {
    const sample = packedMapSampler(c.dist, c.trail);
    const n = c.inputs.length / STRIDE;
    let worst = 0;
    let lids = 0;
    let fading = 0;
    for (let k = 0; k < n; k++) {
      const I = c.inputs.slice(k * STRIDE, k * STRIDE + STRIDE);
      disturbVertex(sample, c.origin[0], c.origin[1], true, I.slice(4, 7), I.slice(0, 4), I[7], out, c.fade);
      const o = k * 4;
      worst = Math.max(worst, Math.abs(gpu[ci][o] - out[0]), Math.abs(gpu[ci][o + 1] - out[1]), Math.abs(gpu[ci][o + 2] - out[2]));
      const lifted = out[1] - I[5] > 0.01;
      if (lifted && I[2] > LID_FROM && I[2] < LID_TO) lids++;
      const e = Math.max(Math.abs((I[0] - c.origin[0]) / DIST_SPAN - 0.5), Math.abs((I[1] - c.origin[1]) / DIST_SPAN - 0.5)) * 2;
      if (e > c.fade[0] && e < c.fade[1] && Math.hypot(out[0] - I[4], out[1] - I[5], out[2] - I[6]) > 1e-3) fading++;
    }
    expect(Number.isFinite(worst), `case ${ci}`).toBe(true);
    expect(worst, `case ${ci}: worst |GPU - TS|`).toBeLessThan(TOLERANCE);
    // The sample is real: leaves part-way into the lid lifted, and some moved inside the fade.
    expect(lids, `case ${ci}`).toBeGreaterThan(20);
    if (ci === 0) expect(fading, `case ${ci}`).toBeGreaterThan(10);
  });
});
