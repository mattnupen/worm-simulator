import { describe, it, expect } from 'vitest';
import { CUT_FRAGMENT } from '../../src/underground/cutFaceGlsl';
import { faceShade, smooth } from '../../src/underground/faceLight';
import { createSlab, boundaryAt, B_TOP } from '../../src/underground/slab';
import { FACE_BELOW } from '../../src/underground/cutFrame';
import { glslFloat as f } from '../../src/render/glslNumber';
import { sharedLighting } from '../../src/render/paintedMaterial';
import {
  BEYOND_LEVEL, BEYOND_SPAN, BOTTOM_FADE, DIM_DEPTH, DIM_LEVEL, FACE_FADE, FACE_GAMMA, WARM_ADD, WARM_DEPTH,
} from '../../src/underground/faceLight';

describe('what is drawn on the cut face is lit as the face is', () => {
  it('the face shader uses the shared light numbers', () => {
    const src = CUT_FRAGMENT.replace(/\s+/g, ' ');
    expect(src).toContain(`col *= mix(1.0, ${f(DIM_LEVEL)}, smoothstep(0.0, ${f(DIM_DEPTH)}, below));`);
    expect(src).toContain(`col += col * uLightColor * ${f(WARM_ADD)} * (1.0 - smoothstep(0.0, ${f(WARM_DEPTH)}, below));`);
    expect(src).toContain(`smoothstep(uBottom - ${f(FACE_BELOW)}, uBottom + ${f(BOTTOM_FADE)}, p.y)`);
    expect(src).toContain(`col *= mix(1.0, ${f(BEYOND_LEVEL)}, smoothstep(0.0, ${f(BEYOND_SPAN)}, beyond));`);
    expect(src).toContain(`smoothstep(uFace.y, uFace.y + ${f(FACE_FADE)}, p.x)`);
    expect(src).toContain(`pow(col, vec3(${f(FACE_GAMMA)}))`);
  });

  it('faceShade matches the shader\'s rule (its warm light as one brightness) down the face and past its ends', () => {
    const s = createSlab(4, 6, 0.4, 1, 7);
    const c = sharedLighting.uLightColor.value;
    const warm = WARM_ADD * (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b);
    for (const u of [0, s.playHi + 1, s.faceHi + 0.2]) {
      const top = boundaryAt(s, B_TOP, u);
      for (let below = 0.05; below < top - s.bottom + 2; below += 0.37) {
        const v = top - below;
        // The shader's lines, in order, on a brightness of 1.
        let col = 1 + (DIM_LEVEL - 1) * smooth(0, DIM_DEPTH, below);
        col += col * warm * (1 - smooth(0, WARM_DEPTH, below));
        col *= smooth(s.bottom - FACE_BELOW, s.bottom + BOTTOM_FADE, v); // mixed toward near black
        col *= 1 + (BEYOND_LEVEL - 1) * smooth(0, BEYOND_SPAN, Math.max(s.playLo - u, u - s.playHi));
        col *= smooth(s.faceLo - FACE_FADE, s.faceLo, u) * (1 - smooth(s.faceHi, s.faceHi + FACE_FADE, u));
        expect(faceShade(s, u, v)).toBeCloseTo(col ** FACE_GAMMA, 6);
      }
    }
    // Above the litter top, the forest's own light.
    expect(faceShade(s, 0, boundaryAt(s, B_TOP, 0) + 0.1)).toBe(1);
  });
});
