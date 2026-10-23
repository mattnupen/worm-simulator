import * as THREE from 'three';

/**
 * Builds one merged mesh from many parametric surfaces (the anatomy model is made of hundreds of
 * small tubes and blobs, merged per system and material so each system is one or two draws).
 * Positions come from a function of (u, v); normals are taken from the surface's own derivatives,
 * so closed tubes have no seam and every part is smooth however it was bent.
 */
export class Mesher {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private idx: number[] = [];

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  vertex(p: THREE.Vector3, n: THREE.Vector3, c: THREE.Color): number {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(c.r, c.g, c.b);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /**
   * A grid surface: `rows` x `cols` quads over u, v in [0, 1]. `at(u, v, out)` writes the point;
   * `color(u, v, p, out)` its colour. `wrapV`: v = 0 and v = 1 meet (a closed tube), so normals
   * are taken across the seam. `keep(u0, v0, u1, v1)` may drop quads (windows, cut edges).
   * `flip` turns the faces (and normals) inside out.
   */
  surface(
    rows: number, cols: number,
    at: (u: number, v: number, out: THREE.Vector3) => void,
    color: (u: number, v: number, p: THREE.Vector3, out: THREE.Color) => void,
    opts: { wrapV?: boolean; flip?: boolean; keep?: (u0: number, v0: number, u1: number, v1: number) => boolean } = {},
  ): void {
    const base = this.vertexCount;
    const p = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const du = new THREE.Vector3();
    const dv = new THREE.Vector3();
    const n = new THREE.Vector3();
    const c = new THREE.Color();
    const eu = 0.25 / rows;
    const ev = 0.25 / cols;
    const wrap = (v: number): number => (opts.wrapV ? ((v % 1) + 1) % 1 : Math.min(1, Math.max(0, v)));
    for (let i = 0; i <= rows; i++) {
      const u = i / rows;
      for (let j = 0; j <= cols; j++) {
        const v = j / cols;
        at(u, v, p);
        // Central differences, stepping inward at the edges. At a tip (zero radius) the v
        // derivative vanishes: there the normal points straight out along the axis.
        let uu = u;
        for (let k = 0; k < 1; k++) {
          const u0 = Math.max(0, uu - eu);
          const u1 = Math.min(1, uu + eu);
          at(u1, v, a);
          at(u0, v, b);
          du.subVectors(a, b);
          at(uu, wrap(v + ev), a);
          at(uu, wrap(v - ev), b);
          if (!opts.wrapV && (v + ev > 1 || v - ev < 0)) {
            at(uu, Math.min(1, v + ev), a);
            at(uu, Math.max(0, v - ev), b);
          }
          dv.subVectors(a, b);
          n.crossVectors(dv, du);
          if (n.lengthSq() > 1e-14 * du.lengthSq()) break;
          n.copy(du).multiplyScalar(uu < 0.5 ? -1 : 1);
        }
        n.normalize();
        if (opts.flip) n.negate();
        color(u, v, p, c);
        this.vertex(p, n, c);
      }
    }
    const row = cols + 1;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        if (opts.keep && !opts.keep(i / rows, j / cols, (i + 1) / rows, (j + 1) / cols)) continue;
        const q = base + i * row + j;
        if (opts.flip) {
          this.tri(q, q + row, q + 1);
          this.tri(q + 1, q + row, q + row + 1);
        } else {
          this.tri(q, q + 1, q + row);
          this.tri(q + 1, q + row + 1, q + row);
        }
      }
    }
  }

  /** Appends another mesher's triangles. */
  append(other: Mesher): void {
    const base = this.vertexCount;
    for (let i = 0; i < other.pos.length; i++) {
      this.pos.push(other.pos[i]);
      this.nor.push(other.nor[i]);
      this.col.push(other.col[i]);
    }
    for (const i of other.idx) this.idx.push(i + base);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    const count = this.vertexCount;
    g.setIndex(count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** A solid colour function for `surface`. */
export const flat = (hex: number) => {
  const c = new THREE.Color(hex);
  return (_u: number, _v: number, _p: THREE.Vector3, out: THREE.Color): void => {
    out.copy(c);
  };
};
