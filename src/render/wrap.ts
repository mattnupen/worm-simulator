/**
 * World-anchored wrapping for layers that live only near the worm (detail leaves, near
 * clutter): each item has a fixed home in a repeating `box`-sized tile of the world and is
 * drawn at the copy of that home nearest `centre`. Items stay put as the centre moves; one only
 * jumps (by a whole box) when it crosses the far edge, where the layer has faded it out.
 */

/** One axis: the copy of home `base` (0..1 of the box) nearest `centre`. */
export function wrapAround(base: number, centre: number, box: number): number {
  const v = base * box - centre + box * 0.5;
  return centre + (v - Math.floor(v / box) * box) - box * 0.5;
}

/** GLSL twin of wrapAround for both axes (GLSL mod is x - y * floor(x / y), like the TS above). */
export const WRAP_GLSL = /* glsl */ `
  vec2 wrapAround(vec2 base, vec2 centre, float box) {
    return centre + mod(base * box - centre + box * 0.5, box) - box * 0.5;
  }
`;
