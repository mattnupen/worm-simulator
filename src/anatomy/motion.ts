import * as THREE from 'three';
import { sampleBody, type BodySample } from './body';
import { GUT_START, gutCentreY } from './gut';
import { ORGANS, segStart } from './layout';

/**
 * The model's moving parts, for lessons and animations built on it (the eating film first): the
 * pharynx pushing out of the mouth, the prostomium lifting, the crop swelling as it fills and the
 * gizzard squeezing. Each is a few uniforms read by the vertex shader, so moving changes numbers
 * only: nothing rebuilds or recompiles. Shared by every full-detail worm, on the straight pose.
 */
export interface WormMotion {
  /** How far (mm) the pharynx's front reaches out past where it sits. */
  pharynx: number;
  /** How far the prostomium is lifted (radians), opening the mouth under it. */
  prostomium: number;
  /** The crop's swell: 0 empty, 1 full (about a third wider). */
  crop: number;
  /** The gizzard's squeeze: 0 relaxed, 1 squeezed (about a seventh narrower). */
  gizzard: number;
}

export const REST: WormMotion = { pharynx: 0, prostomium: 0, crop: 0, gizzard: 0 };

const bs: BodySample = { s: 0, w: 0, h: 0, yc: 0 };
const span = (a: number, b: number): [number, number, number] => {
  const x0 = segStart(a) - 0.6;
  const x1 = segStart(b + 1) + 0.8;
  return [x0, x1, gutCentreY((x0 + x1) / 2, sampleBody((x0 + x1) / 2, bs))];
};
const CROP = span(ORGANS.crop[0], ORGANS.crop[1]);
const GIZZARD = span(ORGANS.gizzard[0], ORGANS.gizzard[1]);
/** The pharynx stretches from the gut's front to the back of segment 5; behind it nothing moves. */
const PHARYNX_END = segStart(ORGANS.pharynx[1] + 1);
/** The prostomium hinges here (x, y), on top of the head; below `floor` (y) nothing lifts. */
const HINGE = new THREE.Vector2(0.35, sampleBody(0.35, bs).yc + bs.h * 0.55);
const FLOOR = gutCentreY(0.2, sampleBody(0.2, bs)) + 0.15;

const U = {
  mReach: { value: 0 },
  mLobe: { value: 0 },
  mBulge: { value: [new THREE.Vector4(CROP[0], CROP[1], CROP[2], 0), new THREE.Vector4(GIZZARD[0], GIZZARD[1], GIZZARD[2], 0)] },
};

/** Sets the motion every full-detail worm shows from the next frame. */
export function setMotion(m: WormMotion): void {
  U.mReach.value = m.pharynx;
  U.mLobe.value = m.prostomium;
  U.mBulge.value[0].w = 0.35 * m.crop;
  U.mBulge.value[1].w = -0.14 * m.gizzard;
}

const f = (v: number): string => v.toFixed(4);
const GUT_GLSL = `
  {
    vec3 mP = transformed;
    for (int i = 0; i < 2; i++) {
      vec4 b = mBulge[i];
      float w = smoothstep(b.x, mix(b.x, b.y, 0.35), mP.x) * smoothstep(b.y, mix(b.x, b.y, 0.65), mP.x);
      transformed.y = b.z + (transformed.y - b.z) * (1.0 + b.w * w);
      transformed.z *= 1.0 + b.w * w;
    }
    if (mP.x < ${f(PHARYNX_END)}) {
      float k = 1.0 + mReach / ${f(PHARYNX_END - GUT_START)};
      transformed.x = ${f(PHARYNX_END)} - (${f(PHARYNX_END)} - mP.x) * k;
      // Stretched thin as it reaches.
      float thin = 1.0 - 0.2 * clamp(mReach / 6.0, 0.0, 1.0) * smoothstep(${f(PHARYNX_END)}, ${f(GUT_START)}, mP.x);
      transformed.y = ${f(FLOOR - 0.15)} + (transformed.y - ${f(FLOOR - 0.15)}) * thin;
      transformed.z *= thin;
    }
  }`;
const LOBE_GLSL = `
  {
    float w = smoothstep(${f(HINGE.x)}, ${f(HINGE.x - 0.9)}, transformed.x) * smoothstep(${f(FLOOR - 0.2)}, ${f(FLOOR + 0.6)}, transformed.y);
    float a = -mLobe * w;
    vec2 d = transformed.xy - vec2(${f(HINGE.x)}, ${f(HINGE.y)});
    transformed.xy = vec2(${f(HINGE.x)}, ${f(HINGE.y)}) + vec2(d.x * cos(a) - d.y * sin(a), d.x * sin(a) + d.y * cos(a));
  }`;

/** Adds the motion to a material: `gut` moves with the food, `head` lifts the prostomium. */
export function addMotion(m: THREE.Material, kind: 'gut' | 'head'): void {
  const before = m.onBeforeCompile.bind(m);
  const key = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'uniform float mReach;\nuniform float mLobe;\nuniform vec4 mBulge[2];\nvoid main() {')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${kind === 'gut' ? GUT_GLSL : LOBE_GLSL}`);
  };
  m.customProgramCacheKey = () => `${key()}-motion-${kind}`;
}
