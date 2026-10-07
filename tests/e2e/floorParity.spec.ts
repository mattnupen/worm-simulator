import { test, expect } from '@playwright/test';
import * as THREE from 'three';
import { OCC_SEGMENTS } from '../../src/render/occlusion';
import { occluderSegments } from '../../src/render/occluderSegments';
import { FLOOR_CELL, FLOOR_CELL_GLSL, FLOOR_SEGS } from '../../src/render/floorMaterial';
import { floorCellShown, floorGridCentre } from '../../src/surface/floorPatch';
import { TERRAIN_GLSL, terrainHeight } from '../../src/surface/terrain';
import { SPINE_POINTS } from '../../src/render/groundUniforms';

/**
 * The floor patch's cell test (FLOOR_CELL_GLSL's floorCellShown) on a real GPU, by transform
 * feedback, against its TS twin (floorPatch.ts floorCellShown): every cell of the grid round
 * three worm poses, each seen by the follow camera, craned over it, and side-on.
 */
function spine(x: number, z: number, yaw: number, curve: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < SPINE_POINTS; i++) {
    const s = i * 0.22;
    const lx = curve ? (1 - Math.cos(curve * s)) / curve : 0;
    const lz = curve ? -Math.sin(curve * s) / curve : -s;
    const px = x + Math.cos(yaw) * lx + Math.sin(yaw) * lz;
    const pz = z - Math.sin(yaw) * lx + Math.cos(yaw) * lz;
    out.push(px, terrainHeight(px, pz) + 0.01, pz);
  }
  return out;
}

test('the floor patch drops a cell on the GPU exactly where its TS twin says', async ({ page }) => {
  const poses = [
    { sp: spine(0, 0, 0, 0), cam: [0, 1.75, -2.6], look: [0, 0.6, 1] },
    { sp: spine(6, -4, 0.8, 1.2), cam: [6.2, 2.0, -3.6], look: [6.4, -0.2, -3.9] },
    { sp: spine(-9, 7, 2.4, -2.5), cam: [-6.6, 1.6, 7.4], look: [-9, 0.5, 7] },
  ];
  const cases = poses.map((p) => {
    const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
    camera.position.fromArray(p.cam);
    camera.lookAt(new THREE.Vector3().fromArray(p.look));
    camera.updateMatrixWorld();
    const view = camera.matrixWorldInverse.elements;
    const pe = camera.projectionMatrix.elements;
    const seg = new Float32Array(OCC_SEGMENTS * 8);
    const count = occluderSegments(p.sp, view, pe[0], pe[5], seg, new Float32Array(5));
    const c = [0, 0];
    floorGridCentre(p.sp, c);
    const cells: number[] = [];
    const ts: number[] = [];
    for (let j = 0; j < FLOOR_SEGS; j++) {
      for (let i = 0; i < FLOOR_SEGS; i++) {
        const x = c[0] + (i - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL;
        const z = c[1] + (j - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL;
        cells.push(x, z);
        ts.push(floorCellShown(p.sp, view, seg, count, x, z) ? 1 : 0);
      }
    }
    return { sp: p.sp, view: Array.from(view), seg: Array.from(seg), count, cells, ts };
  });

  await page.setContent('<canvas id="c" width="4" height="4"></canvas>');
  const gpu = await page.evaluate(({ fn, terrain, cases, segs, points }) => {
    const gl = (document.getElementById('c') as HTMLCanvasElement).getContext('webgl2');
    if (!gl) throw new Error('no WebGL 2');
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'compile');
      return s;
    };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, shader(gl.VERTEX_SHADER, `#version 300 es
      precision highp float; precision highp int;
      uniform vec3 uSpine[${points}]; uniform vec4 uOccSeg[${segs * 2}]; uniform int uOccCount; uniform mat4 viewMatrix;
      in vec2 aCellXZ;
      ${terrain}
      ${fn}
      out float oShown;
      void main() { oShown = floorCellShown(aCellXZ) ? 1.0 : 0.0; gl_Position = vec4(0.0); }`));
    gl.attachShader(pr, shader(gl.FRAGMENT_SHADER, `#version 300 es
      precision highp float; out vec4 c; void main() { c = vec4(1.0); }`));
    gl.transformFeedbackVaryings(pr, ['oShown'], gl.SEPARATE_ATTRIBS);
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr) ?? 'link');
    gl.useProgram(pr);
    const U = (name: string) => gl.getUniformLocation(pr, name);
    gl.bindVertexArray(gl.createVertexArray());
    return cases.map((c) => {
      const n = c.cells.length / 2;
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(c.cells), gl.STATIC_DRAW);
      const l = gl.getAttribLocation(pr, 'aCellXZ');
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, 2, gl.FLOAT, false, 8, 0);
      gl.uniform3fv(U('uSpine[0]'), new Float32Array(c.sp));
      gl.uniform4fv(U('uOccSeg[0]'), new Float32Array(c.seg));
      gl.uniform1i(U('uOccCount'), c.count);
      gl.uniformMatrix4fv(U('viewMatrix'), false, new Float32Array(c.view));
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
  }, { fn: FLOOR_CELL_GLSL, terrain: TERRAIN_GLSL, cases, segs: OCC_SEGMENTS, points: SPINE_POINTS });

  cases.forEach((c, ci) => {
    let shown = 0;
    let differ = 0;
    for (let k = 0; k < c.ts.length; k++) {
      shown += c.ts[k];
      if (gpu[ci][k] !== c.ts[k]) differ++;
    }
    // Float32 against float64 can only flip a cell lying right on the threshold: none in practice.
    expect(differ, `case ${ci}: cells the GPU and TS disagree on`).toBeLessThanOrEqual(2);
    // The sample is real: cells drawn and cells dropped.
    expect(shown, `case ${ci}`).toBeGreaterThan(30);
    expect(c.ts.length - shown, `case ${ci}`).toBeGreaterThan(300);
  });
});
