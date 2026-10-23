/**
 * The drawn rocks' shape (propGeometry's writeRock), as pure maths with no three.js, so the litter
 * (litterDepth.ts) can bank against each rock as drawn.
 */

/** The seed the `i`th rock (propPlacement's rocks()) is drawn with: its shape, yaw and colour. */
export function rockSeed(i: number): number {
  return (i * 0.37 + 0.11) % 1;
}

/** How much a rock's unit icosphere vertex (dx, dy, dz) bulges out for `seed`. */
export function rockLump(dx: number, dy: number, dz: number, seed: number): number {
  return 1 + 0.16 * Math.sin(2.7 * dx + 1.9 * dz + seed * 17) * Math.cos(2.1 * dy + seed * 5) + 0.07 * Math.sin(6.1 * dx - 5.3 * dz);
}

/** A rock vertex's height over the rock's sunken middle: flattened, with a flat-ish bottom hidden in the soil. */
export function rockLy(dy: number, size: number, lump: number): number {
  return Math.max(dy, -0.35) * size * lump * 0.62;
}

/**
 * Where a drawn rock (at (x, z) on soil height g, `size`, `seed`) puts its unit icosphere vertex
 * (dx, dy, dz): written into out[0..2] as x, y, z. writeRock draws it, and the worm's climb
 * surface (climbSurface.ts) rides over it, so the two never disagree.
 */
export function rockPoint(
  dx: number, dy: number, dz: number, x: number, z: number, g: number, size: number, seed: number, out: Float64Array,
): void {
  const lump = rockLump(dx, dy, dz, seed);
  const yaw = seed * Math.PI * 2;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const lx = dx * size * lump * 1.15;
  const lz = dz * size * lump * 0.9;
  out[0] = x + lx * c - lz * s;
  out[1] = g - size * 0.18 + rockLy(dy, size, lump);
  out[2] = z + lx * s + lz * c;
}

let unit: Float32Array | null = null;

/**
 * The unit icosphere's 42 vertices (meshWriter's icosphere: three.js IcosahedronGeometry(1, 1)),
 * built without three.js: the icosahedron's 12 corners and its 30 edge midpoints, on the sphere,
 * stored as 32-bit floats as there.
 */
function unitIcosphere(): Float32Array {
  if (unit) return unit;
  const t = (1 + Math.sqrt(5)) / 2;
  const c = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
    [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ];
  const pts: number[][] = [...c];
  // Neighbouring corners are 2 apart (the edges); every other pair is farther.
  for (let a = 0; a < c.length; a++) {
    for (let b = a + 1; b < c.length; b++) {
      const m = [0, 1, 2].map((k) => (c[a][k] + c[b][k]) / 2);
      if (Math.abs(Math.hypot(c[a][0] - c[b][0], c[a][1] - c[b][1], c[a][2] - c[b][2]) - 2) < 1e-9) pts.push(m);
    }
  }
  unit = new Float32Array(pts.flatMap((p) => {
    const len = Math.hypot(p[0], p[1], p[2]);
    return [p[0] / len, p[1] / len, p[2] / len];
  }));
  return unit;
}

/** How high a drawn rock (writeRock with `size` and `seed`) stands over the soil at its centre. */
export function rockRise(size: number, seed: number): number {
  const pos = unitIcosphere();
  let top = -Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    top = Math.max(top, rockLy(pos[i + 1], size, rockLump(pos[i], pos[i + 1], pos[i + 2], seed)));
  }
  return top - size * 0.18;
}
