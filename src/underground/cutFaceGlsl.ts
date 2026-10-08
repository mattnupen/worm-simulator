import { GRADE_GLSL } from '../render/paintedMaterial';
import { glslFloat as f } from '../render/glslNumber';
import { FACE_BELOW, FACE_PAST } from './cutFrame';
import { BEYOND_LEVEL, BEYOND_SPAN, BOTTOM_FADE, DIM_DEPTH, DIM_LEVEL, FACE_GAMMA, WARM_ADD, WARM_DEPTH } from './faceLight';
import { GRID_H } from './soilGrid';
import { LITTER_TILE_U, OLD_TILE_U, SOIL_TILE_U } from './soilTiles';

/**
 * The cut face's shaders (V2 spec 5): one draw over a strip in the cut's plane. Each vertex
 * carries its plane point (u, v) and its column's layer boundaries (litter top, then the tops of
 * F, H, A, E and B), so the boundaries are drawn exactly where the soil grid has them. Each layer
 * has its own baked pattern (soilTiles.ts: pattern, not only colour, spec 5.3): L and H share one
 * tile (H in its alpha), F has its own, and A, E and B use the grain tile each its own way. The
 * soil grid's data texture adds the tunnels, castings, mixed walls and damp. Darker with depth;
 * the bottom darkens away; past the face's ends it fades to dark.
 *
 * Lean for software GL, which runs every line for every pixel, branch or not: six texture reads a
 * pixel, all outside the branches (the broad noise, the three tiles, two of the soil grid), and
 * the branches only mix colours. No discard, no extra pass.
 */
export const CUT_VERTEX = /* glsl */ `
  attribute vec2 aPlane;
  attribute vec4 aBoundsA;
  attribute vec2 aBoundsB;
  varying vec2 vPlane;
  varying vec4 vBoundsA;
  varying vec2 vBoundsB;
  void main() {
    vPlane = aPlane;
    vBoundsA = aBoundsA;
    vBoundsB = aBoundsB;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

export const CUT_FRAGMENT = /* glsl */ `
  uniform sampler2D uNoise;
  uniform sampler2D uSoil;
  uniform sampler2D uLitter;
  uniform sampler2D uOldLeaves;
  uniform sampler2D uGrain;
  uniform vec4 uGrid;
  uniform vec2 uPlay;
  uniform vec2 uFace;
  uniform float uBottom;
  uniform vec3 uLightColor;
  uniform vec2 uResolution;
  varying vec2 vPlane;
  varying vec4 vBoundsA;
  varying vec2 vBoundsB;
  ${GRADE_GLSL}

  void main() {
    vec2 p = vPlane;
    float top = vBoundsA.x;
    // One broad noise read: the boundaries wander (no ruler lines) and the paint varies.
    // Its period (1 / 0.19 = 5.26 u) shares no small multiple with the tiles' 2 and 4 u.
    vec4 br = texture2D(uNoise, p * 0.19);
    // The same read bends the tiles, and the 4 u tiles are sheared a little (each repeat sits
    // 0.24 or 0.2 u higher or lower than the last), so their repeats never line up in a row.
    vec2 q = p + (br.ra - 0.5) * vec2(0.5, 0.12);
    vec4 lit = texture2D(uLitter, vec2(q.x, q.y + q.x * 0.06) / vec2(${f(LITTER_TILE_U[0])}, ${f(LITTER_TILE_U[1])}));
    vec4 old = texture2D(uOldLeaves, vec2(q.x, q.y - q.x * 0.05) / vec2(${f(OLD_TILE_U[0])}, ${f(OLD_TILE_U[1])}));
    // H rides in the litter tile's alpha: black, crumbs, fine roots, white hyphae along a ramp.
    vec3 hum = mix(vec3(0.018, 0.013, 0.01), vec3(0.3, 0.21, 0.14), smoothstep(0.05, 0.42, lit.a));
    hum = mix(hum, vec3(0.52, 0.38, 0.24), smoothstep(0.44, 0.6, lit.a));
    hum = mix(hum, vec3(0.85, 0.83, 0.76), smoothstep(0.75, 0.98, lit.a));
    // A, E and B share the grain tile at the same place (no seams where they meet): each layer
    // uses its channels its own way.
    float yb = p.y + (br.b - 0.5) * 0.16 + (br.g - 0.5) * 0.05;
    vec4 gr = texture2D(uGrain, q / ${f(SOIL_TILE_U)});
    // Crumbly edges: the grain's fine noise breaks each boundary up a little more.
    float y = yb + (gr.r - 0.5) * 0.06;

    // The soil grid: tunnels (r), castings (g), mixed walls (b), damp (a), its tunnels already
    // softened (cutFace.ts blurBores). Two bilinear reads half a cell above and below: their mean
    // smooths the cells a little more, their difference tells a bore's floor from its roof.
    vec2 g = (p - uGrid.xy) * uGrid.zw;
    float inside = step(0.0, g.x) * step(g.x, 1.0) * step(0.0, g.y) * step(g.y, 1.0);
    vec2 hv = vec2(0.0, ${f(0.5 / GRID_H)});
    vec4 lo = texture2D(uSoil, g - hv);
    vec4 hi = texture2D(uSoil, g + hv);
    vec4 s = (lo + hi) * 0.5;
    // Damp carries on past the grid's edges (the edge texels repeat); the rest stops at them.
    float damp = s.a;
    s *= inside;

    vec3 col;
    if (y > vBoundsA.y) {
      // L: this fall's leaves edge-on. The lower ones are older: duller and darker.
      float older = clamp((top - y) / max(0.01, top - vBoundsA.y), 0.0, 1.0);
      col = mix(lit.rgb, lit.rgb * vec3(0.55, 0.5, 0.48) + vec3(0.08, 0.05, 0.03), older * 0.6);
    } else if (y > vBoundsA.z) {
      // F: matted fragments, hyphae and fine roots.
      col = old.rgb;
    } else if (y > vBoundsA.w) {
      // H: black crumbs.
      col = hum;
    } else {
      // A, E and B from the grain tile: sand grain (r), mottles (g), pebbles (b), platy streaks (a).
      // Pebbles come in richer and poorer patches; the broad noise also breaks the tile's repeat.
      float peb = smoothstep(0.08, 0.3, gr.b) * smoothstep(0.2, 0.55, br.g + 0.25 * br.b);
      float mot = gr.g * 0.65 + br.b * 0.55 - 0.1;
      vec3 pebCol = mix(vec3(0.5, 0.47, 0.43), vec3(0.6, 0.46, 0.4), gr.g) * (0.25 + 0.75 * gr.b);
      if (y < vBoundsB.y) {
        // B: brown to rust, mottled, with pebbles.
        col = vec3(0.45, 0.27, 0.14) * (0.8 + 0.4 * gr.r);
        col = mix(col, vec3(0.62, 0.33, 0.11), smoothstep(0.5, 0.75, mot) * 0.7);
        col = mix(col, vec3(0.36, 0.27, 0.2), (1.0 - smoothstep(0.2, 0.45, mot)) * 0.4);
        col = mix(col, pebCol * 0.85, peb);
      } else if (y < vBoundsB.x) {
        // E: pale grey-white, in thin plates.
        col = vec3(0.66, 0.63, 0.57) * (0.86 + 0.2 * gr.r) * (0.93 + 0.1 * gr.a);
        col = mix(col, pebCol, peb * 0.35);
      } else {
        // A: thin grey-brown grain, stained dark where humus washed in.
        col = vec3(0.25, 0.2, 0.16) * (0.65 + 0.7 * gr.r);
        col = mix(col, vec3(0.1, 0.075, 0.06), smoothstep(0.55, 0.75, mot) * 0.7);
        col = mix(col, pebCol * 0.6, peb * 0.7);
      }
    }

    // Moss creeping in at F's top, in patches along the cut.
    float moss = (1.0 - smoothstep(0.04, 0.24, abs(p.y - vBoundsA.y + 0.08))) * smoothstep(0.3, 0.55, br.g) * old.a;
    col = mix(col, vec3(0.3, 0.46, 0.1) * (0.6 + 0.6 * old.a), moss);
    col *= 1.0 - 0.22 * damp;
    // Mixed walls: darker and crumbly (H's crumbs).
    col = mix(col, vec3(0.03, 0.02, 0.015) + hum * 0.9, smoothstep(0.3, 0.7, s.b) * 0.8);
    // The tunnel, cut in half: a void in shadow, darkest under its roof, its floor catching a
    // little light; the wall just outside it pressed smooth and darker. Soft edged.
    float open = smoothstep(0.35, 0.65, s.r);
    col *= 1.0 - 0.22 * smoothstep(0.08, 0.35, s.r) * (1.0 - open);
    float floorLit = smoothstep(0.05, 0.6, hi.r - lo.r) * inside;
    float roof = clamp((lo.r - hi.r) * 2.5, 0.0, 1.0);
    vec3 hollow = mix((vec3(0.05, 0.034, 0.022) + col * 0.14) * (1.0 - 0.5 * roof), col * 0.6 + vec3(0.03, 0.02, 0.012), floorLit);
    col = mix(col, hollow, open);
    // Castings settled in the tunnel: dark granular lumps (H's crumbs), darker for a
    // gut full of leaves.
    vec3 castCol = mix(vec3(0.32, 0.22, 0.15), vec3(0.17, 0.11, 0.07), clamp(s.g * 1.6 - 0.3, 0.0, 1.0));
    col = mix(col, castCol * (0.35 + 0.9 * smoothstep(0.05, 0.35, lit.a)), smoothstep(0.06, 0.2, s.g));

    // Warm light from the surface fades with depth; the bottom darkens away (burrows go deeper).
    float below = top - p.y;
    col *= mix(1.0, ${f(DIM_LEVEL)}, smoothstep(0.0, ${f(DIM_DEPTH)}, below));
    col += col * uLightColor * ${f(WARM_ADD)} * (1.0 - smoothstep(0.0, ${f(WARM_DEPTH)}, below));
    col = mix(col, vec3(0.012, 0.008, 0.005), (1.0 - smoothstep(uBottom - ${f(FACE_BELOW)}, uBottom + ${f(BOTTOM_FADE)}, p.y)));
    // Beyond the playable slab the soil dims a little; past the face's ends it fades to dark.
    float beyond = max(uPlay.x - p.x, p.x - uPlay.y);
    col *= mix(1.0, ${f(BEYOND_LEVEL)}, smoothstep(0.0, ${f(BEYOND_SPAN)}, beyond));
    col *= smoothstep(uFace.x - ${f(FACE_PAST)}, uFace.x, p.x) * (1.0 - smoothstep(uFace.y, uFace.y + ${f(FACE_PAST)}, p.x));
    // Painted variation: broad value patches and a warm/cool drift.
    col *= 0.9 + 0.2 * br.r;
    col *= mix(vec3(1.05, 0.99, 0.9), vec3(0.93, 0.98, 1.04), br.a);
    gl_FragColor = vec4(paintedGrade(pow(col, vec3(${f(FACE_GAMMA)}))), 1.0);
    #include <colorspace_fragment>
  }
`;
