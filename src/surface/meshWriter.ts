import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Accumulates many small static meshes into one merged geometry (one draw call): positions,
 * normals and one extra float attribute per vertex. Build-time only.
 */
export class MeshWriter {
  readonly pos: number[] = [];
  readonly nor: number[] = [];
  readonly extra: number[] = [];
  readonly idx: number[] = [];

  constructor(readonly extraName: string, readonly extraSize: number) {}

  get vertexCount(): number {
    return this.pos.length / 3;
  }

  /** Adds a vertex; `extra` must hold `extraSize` values. Returns its index. */
  vertex(x: number, y: number, z: number, nx: number, ny: number, nz: number, extra: readonly number[]): number {
    const len = Math.hypot(nx, ny, nz) || 1;
    this.pos.push(x, y, z);
    this.nor.push(nx / len, ny / len, nz / len);
    for (let i = 0; i < this.extraSize; i++) this.extra.push(extra[i] ?? 0);
    return this.pos.length / 3 - 1;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /** Two triangles over quad a-b-c-d (counter-clockwise from the front). */
  quad(a: number, b: number, c: number, d: number): void {
    this.idx.push(a, b, c, a, c, d);
  }

  /**
   * A grid of (rows x cols) vertices laid out row-major from `first`. Front faces are CCW
   * when rows run "up" and columns run "left" as seen from the front; `flip` reverses them.
   */
  grid(first: number, rows: number, cols: number, flip = false): void {
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols - 1; c++) {
        const a = first + r * cols + c;
        if (flip) this.quad(a, a + 1, a + cols + 1, a + cols);
        else this.quad(a, a + cols, a + cols + 1, a + 1);
      }
    }
  }

  /** Adds triangle a-b-c wound so its front faces direction (nx, ny, nz). */
  triFacing(a: number, b: number, c: number, nx: number, ny: number, nz: number): void {
    const p = this.pos;
    const ux = p[b * 3] - p[a * 3];
    const uy = p[b * 3 + 1] - p[a * 3 + 1];
    const uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3];
    const vy = p[c * 3 + 1] - p[a * 3 + 1];
    const vz = p[c * 3 + 2] - p[a * 3 + 2];
    const d = (uy * vz - uz * vy) * nx + (uz * vx - ux * vz) * ny + (ux * vy - uy * vx) * nz;
    if (d >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  /** Smooth normals from the faces of vertices [firstVertex..) and triangles [firstIndex..). */
  smoothNormals(firstVertex: number, firstIndex: number): void {
    const p = this.pos;
    const n = this.nor;
    for (let v = firstVertex * 3; v < n.length; v++) n[v] = 0;
    for (let t = firstIndex; t < this.idx.length; t += 3) {
      const a = this.idx[t] * 3;
      const b = this.idx[t + 1] * 3;
      const c = this.idx[t + 2] * 3;
      const ux = p[b] - p[a]; const uy = p[b + 1] - p[a + 1]; const uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a]; const vy = p[c + 1] - p[a + 1]; const vz = p[c + 2] - p[a + 2];
      const fx = uy * vz - uz * vy;
      const fy = uz * vx - ux * vz;
      const fz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { n[k] += fx; n[k + 1] += fy; n[k + 2] += fz; }
    }
    for (let v = firstVertex * 3; v < n.length; v += 3) {
      const l = Math.hypot(n[v], n[v + 1], n[v + 2]) || 1;
      n[v] /= l; n[v + 1] /= l; n[v + 2] /= l;
    }
  }

  toGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute(this.extraName, new THREE.Float32BufferAttribute(this.extra, this.extraSize));
    g.setIndex(this.vertexCount > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    return g;
  }
}

let ico: { pos: Float32Array; index: ArrayLike<number> } | null = null;

/** Shared unit icosphere (detail 1: 42 vertices, 80 triangles), indexed. */
export function icosphere(): { pos: Float32Array; index: ArrayLike<number> } {
  if (ico) return ico;
  const g = new THREE.IcosahedronGeometry(1, 1);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g);
  ico = { pos: m.getAttribute('position').array as Float32Array, index: m.getIndex()!.array };
  return ico;
}
