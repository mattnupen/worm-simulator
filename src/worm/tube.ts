/**
 * Pure tube-mesh helpers: rings of vertices around a framed spine. Each ring has
 * `radial + 1` vertices (the last duplicates the first, so the around-coordinate can wrap
 * cleanly). Vertex 0 (and the seam) of each ring is on the dorsal (N) side.
 */

export function tubeVertexCount(rings: number, radial: number): number {
  return rings * (radial + 1);
}

/** Triangle indices for a tube of `rings` x (`radial` + 1) vertices, wound outward-facing. */
export function tubeIndices(rings: number, radial: number): Uint16Array {
  const out = new Uint16Array((rings - 1) * radial * 6);
  const row = radial + 1;
  let k = 0;
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * row + j;
      const b = a + row;
      out[k++] = a;
      out[k++] = a + 1;
      out[k++] = b;
      out[k++] = a + 1;
      out[k++] = b + 1;
      out[k++] = b;
    }
  }
  return out;
}

/** cos/sin table for one ring, interleaved: [cos0, sin0, cos1, sin1, ...], radial + 1 entries. */
export function ringTrig(radial: number): Float32Array {
  const out = new Float32Array((radial + 1) * 2);
  for (let j = 0; j <= radial; j++) {
    const a = (j / radial) * Math.PI * 2;
    out[j * 2] = Math.cos(a);
    out[j * 2 + 1] = Math.sin(a);
  }
  return out;
}

/**
 * Writes ring positions and unit normals. Per ring i: centre, frame (T, N, B), elliptical
 * semi-axes rN (along N, dorsal) and rB (along B, lateral), and `slope` = d(radius)/d(arc
 * length) toward the tail, which tilts the normals forward or back on the tapers.
 * Rings with zero radius are the tips: their normals point straight out along the spine.
 */
export function writeTube(
  rings: number,
  trig: Float32Array,
  c: Float32Array, T: Float32Array, N: Float32Array, B: Float32Array,
  rN: Float32Array, rB: Float32Array, slope: Float32Array,
  outPos: Float32Array, outNor: Float32Array,
): void {
  const row = trig.length / 2;
  for (let i = 0; i < rings; i++) {
    const o = i * 3;
    const a = rN[i];
    const b = rB[i];
    const sl = slope[i];
    const tip = a <= 0 && b <= 0;
    // Ellipse normal direction is (b cos, a sin); use the axis ratio so it never vanishes.
    const big = Math.max(a, b, 1e-9);
    const na = tip ? 1 : b / big;
    const nb = tip ? 1 : a / big;
    for (let j = 0; j < row; j++) {
      const cs = trig[j * 2];
      const sn = trig[j * 2 + 1];
      const v = (i * row + j) * 3;
      for (let k = 0; k < 3; k++) {
        outPos[v + k] = c[o + k] + N[o + k] * a * cs + B[o + k] * b * sn;
      }
      let nx: number;
      let ny: number;
      let nz: number;
      if (tip) {
        const s = sl > 0 ? -1 : 1;
        nx = T[o] * s;
        ny = T[o + 1] * s;
        nz = T[o + 2] * s;
      } else {
        let rx = N[o] * na * cs + B[o] * nb * sn;
        let ry = N[o + 1] * na * cs + B[o + 1] * nb * sn;
        let rz = N[o + 2] * na * cs + B[o + 2] * nb * sn;
        const rl = Math.hypot(rx, ry, rz) || 1;
        rx /= rl;
        ry /= rl;
        rz /= rl;
        nx = rx - sl * T[o];
        ny = ry - sl * T[o + 1];
        nz = rz - sl * T[o + 2];
      }
      const l = Math.hypot(nx, ny, nz) || 1;
      outNor[v] = nx / l;
      outNor[v + 1] = ny / l;
      outNor[v + 2] = nz / l;
    }
  }
}
