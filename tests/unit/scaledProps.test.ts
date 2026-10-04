import { describe, it, expect, afterAll } from 'vitest';
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
import { DEFAULT_SCALE, SCALE_MODES, SCALE_SPECS, setScale } from '../../src/surface/worldScale';

/** Length, sum and a weighted sum of an array: a cheap fingerprint of a mesh. */
function fingerprint(a: ArrayLike<number>): number[] {
  let s = 0;
  let w = 0;
  for (let i = 0; i < a.length; i++) {
    s += a[i];
    w += a[i] * ((i % 7) + 1);
  }
  return [a.length, s, w];
}
const positions = (m: THREE.Object3D) => (m as THREE.Mesh).geometry.getAttribute('position');
/** The worm is never taller than this over the ground, so a footprint must hold the props up to here. */
const WORM_TOP = 0.3;
const hit = { nx: 0, nz: 0 };

afterAll(() => { setScale(DEFAULT_SCALE); });

describe('Classic props are exactly Step 1a\'s (fingerprints taken before the scale modes)', () => {
  it('ground props, trunks, crowns and the distant ring', () => {
    setScale('classic');
    const props = buildGroundProps().mesh.geometry;
    const trees = buildForestTrees(writeHeroLog);
    const distant = buildDistantTrees();
    const close = (a: number[], b: number[]) => {
      expect(a[0]).toBe(b[0]);
      expect(a[1]).toBeCloseTo(b[1], 6);
      expect(a[2]).toBeCloseTo(b[2], 5);
    };
    close(fingerprint(props.getAttribute('position').array), [28107, -8939.906466193963, -35534.30563228228]);
    expect(props.index!.count).toBe(20652);
    close(fingerprint(positions(trees.children[0]).array), [17793, 6109.6819789083675, 24396.986306414008]);
    close(fingerprint(positions(trees.children[1]).array), [14112, 34505.49341870146, 139358.94168695062]);
    close(fingerprint(distant.instanceMatrix.array), [1152, 197.031853672117, 721.2187286820263]);
    expect(distant.count).toBe(72);
  });
});

describe.each(SCALE_MODES)('%s: the solid footprints hold what is drawn, up to the worm\'s height', (mode) => {
  it('trunks and the log', () => {
    setScale(mode);
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
    setScale(mode);
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
    setScale(mode);
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

describe('clutter and trees grow with the table', () => {
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

  it('a grown fern has denser leaflets (14 pairs a frond, Classic 8), so it does not read as a comb', () => {
    const verts = (grow: number) => {
      const w = new MeshWriter('aProp', 4);
      writeFern(w, 0, 0, 1, mulberry32(9), () => 0, grow);
      return w.vertexCount;
    };
    // 5 fronds, 6 more pairs each, two leaflets a pair, three vertices a leaflet.
    expect(verts(7) - verts(1)).toBe(5 * 6 * 2 * 3);
  });

  it('the distant ring has the mode\'s count, each tree its size', () => {
    for (const mode of SCALE_MODES) {
      setScale(mode);
      const ring = buildDistantTrees();
      const spec = SCALE_SPECS[mode];
      expect(ring.count).toBe(spec.distantCount);
      const m = new THREE.Matrix4();
      const s = new THREE.Vector3();
      for (let i = 0; i < ring.count; i++) {
        ring.getMatrixAt(i, m);
        s.setFromMatrixScale(m);
        expect(s.x / spec.distantScale).toBeGreaterThanOrEqual(0.75 - 1e-6);
        expect(s.x / spec.distantScale).toBeLessThanOrEqual(1.35 + 1e-6);
      }
    }
  });

  it('True trunks stand about nine (birch) and eleven (maple) times taller than Classic\'s', () => {
    const tallest = (mode: 'classic' | 'true') => {
      setScale(mode);
      const p = positions(buildForestTrees().children[0]);
      let top = 0;
      for (let v = 0; v < p.count; v++) top = Math.max(top, p.getY(v));
      return top;
    };
    const ratio = tallest('true') / tallest('classic');
    expect(ratio).toBeGreaterThan(8);
    expect(ratio).toBeLessThan(12);
  });
});
