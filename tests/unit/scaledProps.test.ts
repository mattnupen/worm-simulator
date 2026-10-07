import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildGroundProps, writeHeroLog } from '../../src/surface/groundProps';
import { buildForestTrees } from '../../src/surface/forestTrees';
import { buildDistantTrees } from '../../src/surface/distantTrees';
import { writeFern, writeMushrooms, writeSedge } from '../../src/surface/propGeometry';
import { MeshWriter } from '../../src/surface/meshWriter';
import { mulberry32 } from '../../src/core/random';
import { footprints, obstacleDepth } from '../../src/surface/obstacles';
import { heroLog, logEnd } from '../../src/surface/propPlacement';
import { terrainHeight } from '../../src/surface/terrain';
import { REAL_SCALE } from '../../src/surface/realScale';

const positions = (m: THREE.Object3D) => (m as THREE.Mesh).geometry.getAttribute('position');
/** The worm is never taller than this over the ground, so a footprint must hold the props up to here. */
const WORM_TOP = 0.3;
const hit = { nx: 0, nz: 0 };

describe('the bark pattern is laid out at base size, so a big trunk wears the same bark, bigger', () => {
  /** The largest aBark.y (height or length along the bark, over grow) of the trunks, and of the log. */
  function barkReach(): { trunk: number; log: number } {
    const trunks = buildForestTrees().children[0] as THREE.Mesh;
    const withLog = buildForestTrees(writeHeroLog).children[0] as THREE.Mesh;
    const first = trunks.geometry.getAttribute('position').count;
    const bark = withLog.geometry.getAttribute('aBark');
    let trunk = 0;
    let log = 0;
    // Trunk vertices come first; the log's follow them.
    for (let v = 0; v < bark.count; v++) {
      if (v < first) trunk = Math.max(trunk, bark.getY(v));
      else log = Math.max(log, bark.getY(v));
    }
    return { trunk, log };
  }

  it('the log\'s reach along its bark is its base length, 4.4, and the trunks\' about a base trunk\'s height', () => {
    const r = barkReach();
    expect(r.log).toBeCloseTo(4.4, 5);
    // In base units (V1 measured Classic's tallest at 14.4, and every mode within 15% of it).
    expect(r.trunk).toBeGreaterThan(12);
    expect(r.trunk).toBeLessThan(17);
  });
});

describe('the solid footprints hold what is drawn, up to the worm\'s height', () => {
  it('trunks and the log', () => {
    const trunks = positions(buildForestTrees().children[0]);
    const withLog = positions(buildForestTrees(writeHeroLog).children[0]);
    let checked = 0;
    for (let v = 0; v < withLog.count; v++) {
      const x = withLog.getX(v);
      const z = withLog.getZ(v);
      const above = withLog.getY(v) - terrainHeight(x, z);
      if (above > WORM_TOP || above < -0.05) continue;
      // Trunk vertices come first; the log's follow them.
      expect(obstacleDepth(x, z, 0.02, hit), `${v < trunks.count ? 'trunk' : 'log'} vertex at ${x}, ${z}`).toBeGreaterThan(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('the log\'s jagged ends reach out to, and not past, its footprint\'s ends', () => {
    const w = new MeshWriter('aBark', 4);
    writeHeroLog(w);
    const log = heroLog();
    const dx = Math.cos(log.yaw);
    const dz = Math.sin(log.yaw);
    let reach = 0;
    for (let v = 0; v < w.pos.length; v += 3) {
      reach = Math.max(reach, Math.abs((w.pos[v] - log.x) * dx + (w.pos[v + 2] - log.z) * dz));
    }
    // The splinters grow with the log, so a big log's ends are not sawn off.
    expect(reach).toBeLessThanOrEqual(log.length / 2 + logEnd() + 1e-9);
    expect(reach).toBeGreaterThan(log.length / 2 + 0.9 * logEnd());
    expect(footprints().log.half).toBeCloseTo(log.length / 2 + logEnd(), 9);
  });

  it('rocks', () => {
    const g = buildGroundProps().mesh.geometry;
    const pos = g.getAttribute('position');
    const kind = g.getAttribute('aProp');
    let checked = 0;
    for (let v = 0; v < pos.count; v++) {
      if (Math.floor(kind.getW(v)) !== 1) continue; // stone
      const x = pos.getX(v);
      const z = pos.getZ(v);
      const above = pos.getY(v) - terrainHeight(x, z);
      if (above > WORM_TOP || above < 0) continue;
      expect(obstacleDepth(x, z, 0.02, hit)).toBeGreaterThan(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });
});

describe('clutter and trees grow to real size', () => {
  /** Height and width of one clutter item written with `grow`. */
  function extent(write: typeof writeFern, grow: number): { h: number; w: number } {
    const w = new MeshWriter('aProp', 4);
    write(w, 0, 0, 1, mulberry32(9), () => 0, grow);
    const box = new THREE.Box3().setFromBufferAttribute(new THREE.Float32BufferAttribute(w.pos, 3));
    return { h: box.max.y, w: box.max.x - box.min.x };
  }

  it('ferns, sedge and mushrooms are drawn `grow` times bigger', () => {
    for (const write of [writeFern, writeSedge, writeMushrooms]) {
      const a = extent(write, 1);
      const b = extent(write, 7);
      expect(b.w / a.w).toBeCloseTo(7, 1);
      expect(b.h).toBeGreaterThan(a.h * 6);
    }
  });

  it('a grown fern has denser leaflets (14 pairs a frond, 8 at base size), so it does not read as a comb', () => {
    const verts = (grow: number) => {
      const w = new MeshWriter('aProp', 4);
      writeFern(w, 0, 0, 1, mulberry32(9), () => 0, grow);
      return w.vertexCount;
    };
    // 5 fronds, 6 more pairs each, two leaflets a pair, three vertices a leaflet.
    expect(verts(7) - verts(1)).toBe(5 * 6 * 2 * 3);
  });

  it('the distant ring has the real-size count, each tree its size', () => {
    const ring = buildDistantTrees();
    expect(ring.count).toBe(REAL_SCALE.distantCount);
    const m = new THREE.Matrix4();
    const s = new THREE.Vector3();
    for (let i = 0; i < ring.count; i++) {
      ring.getMatrixAt(i, m);
      s.setFromMatrixScale(m);
      expect(s.x / REAL_SCALE.distantScale).toBeGreaterThanOrEqual(0.75 - 1e-6);
      expect(s.x / REAL_SCALE.distantScale).toBeLessThanOrEqual(1.35 + 1e-6);
    }
  });

  it('trunks stand tens of units tall, as real birches and maples do next to a 15 cm worm', () => {
    const p = positions(buildForestTrees().children[0]);
    let top = 0;
    for (let v = 0; v < p.count; v++) top = Math.max(top, p.getY(v));
    expect(top).toBeGreaterThan(40);
  });
});
