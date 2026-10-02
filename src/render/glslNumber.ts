/**
 * A GLSL float literal for `v` with 9 significant digits: enough to round-trip any float32, so
 * a shader constant is exactly the float32 nearest the number its TS twin computes with.
 */
export function glslFloat(v: number): string {
  const s = v.toPrecision(9);
  return /[.e]/.test(s) ? s : `${s}.0`;
}
