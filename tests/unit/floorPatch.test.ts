import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildFloorPatch, floorCellShown, floorGridCentre, updateFloorPatch } from '../../src/surface/floorPatch';
import {
  FLOOR_CELL, FLOOR_CELL_GLSL, FLOOR_CENTRE, FLOOR_KEEP, FLOOR_SEGS, FLOOR_SIZE, FLOOR_SLOPE,
} from '../../src/render/floorMaterial';
import { terrainHeight, WORLD_HALF } from '../../src/surface/terrain';
import { glslFloat } from '../../src/render/glslNumber';
import { OCC_SEGMENTS } from '../../src/render/occlusion';
import { occluderSegments } from '../../src/render/occluderSegments';
import { spineDistance } from '../../src/render/nearClutterGlsl';
import type { WormPose } from '../../src/worm/wormMesh';
import { FLOOR_ORDER, GROUND_ORDER, POCKET_ORDER } from '../../src/render/drawOrder';
import { groundUniforms } from '../../src/render/groundUniforms';
import { buildWorld } from '../../src/game/world';
import { Crawl, WORM_SEGMENTS } from '../../src/game/crawl';
import { PRESETS } from '../../src/render/graphics';

describe('the floor under the buried worm (V2 spec 8.2)', () => {
  const patch = buildFloorPatch();

  it('is one grid of FLOOR_SEGS cells a side, placed under the middle of the body by its shader', () => {
    const pos = patch.geometry.getAttribute('position');
    const cell = patch.geometry.getAttribute('aCell');
    expect(pos.count).toBe(FLOOR_SEGS * FLOOR_SEGS * 4);
    expect(patch.geometry.index!.count).toBe(FLOOR_SEGS * FLOOR_SEGS * 6);
    expect(patch.frustumCulled).toBe(false);
    const xs = Array.from({ length: pos.count }, (_, v) => pos.getX(v));
    expect(Math.min(...xs)).toBe(-FLOOR_SEGS / 2);
    expect(Math.max(...xs)).toBe(FLOOR_SEGS / 2);
    // Every corner lies on its own cell, whose centre aCell gives.
    for (let v = 0; v < pos.count; v++) {
      expect(Math.abs(pos.getX(v) - cell.getX(v))).toBe(0.5);
      expect(Math.abs(pos.getZ(v) - cell.getY(v))).toBe(0.5);
    }
    const m = patch.material as THREE.ShaderMaterial;
    expect(m.uniforms.uSpine).toBe(groundUniforms.uSpine);
    expect(m.vertexShader).toContain('terrainHeight(xz)');
    // The shader drops a cell as floorCellShown does (the GPU parity test runs FLOOR_CELL_GLSL),
    // reading the hole's segments as the top of the litter does.
    expect(m.vertexShader).toContain(FLOOR_CELL_GLSL);
    expect(m.vertexShader).toContain(`floorCellShown(base + aCell * ${glslFloat(FLOOR_CELL)})`);
    // Centred by the CPU (updateFloorPatch, floorGridCentre), so the CPU's cell list and the GPU agree.
    expect(m.vertexShader).toContain('vec2 base = uFloorBase;');
    expect(m.uniforms.uOccSeg).toBe(groundUniforms.uOccSeg);
    expect(m.uniforms.uOccCount).toBe(groundUniforms.uOccCount);
  });

  it('holds the whole strip: the grid reaches past every kept cell, wherever the snap puts it', () => {
    // Body point 7 is 1.54 from the head and 1.76 from the tail (0.22 apart): a kept cell's centre
    // lies within FLOOR_KEEP of the spine, its edge half a cell farther, and the snap moves the
    // grid by up to half a cell.
    expect(FLOOR_CENTRE).toBe(7);
    expect(FLOOR_SIZE / 2 - FLOOR_CELL / 2).toBeGreaterThanOrEqual(8 * 0.22 + FLOOR_KEEP + FLOOR_CELL / 2);
  });

  it('lies on a floor no steeper than FLOOR_SLOPE anywhere in the world (its cells\' balls hold them)', () => {
    let worst = 0;
    const e = 0.01;
    for (let x = -WORLD_HALF; x <= WORLD_HALF; x += 0.1) {
      for (let z = -WORLD_HALF; z <= WORLD_HALF; z += 0.1) {
        const gx = terrainHeight(x + e, z) - terrainHeight(x - e, z);
        const gz = terrainHeight(x, z + e) - terrainHeight(x, z - e);
        worst = Math.max(worst, Math.hypot(gx, gz) / (2 * e));
      }
    }
    expect(worst).toBeGreaterThan(0.1);
    expect(worst).toBeLessThan(FLOOR_SLOPE);
  });

  it('draws only the cells the hole can show: a small share of the grid as the crawl starts', () => {
    // The worm at the spawn, its camera settled behind it: of the cells near the spine, only those
    // the hole round the body can show.
    const crawl = new Crawl();
    const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
    const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
    crawl.interpolate(1, 0, pose, camera);
    camera.updateMatrixWorld();
    const view = camera.matrixWorldInverse.elements;
    const pe = camera.projectionMatrix.elements;
    const seg = new Float32Array(OCC_SEGMENTS * 8);
    const count = occluderSegments(pose.spine, view, pe[0], pe[5], seg, new Float32Array(5));
    const c = [0, 0];
    floorGridCentre(pose.spine, c);
    let near = 0;
    let shown = 0;
    for (let j = 0; j < FLOOR_SEGS; j++) {
      for (let i = 0; i < FLOOR_SEGS; i++) {
        const x = c[0] + (i - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL;
        const z = c[1] + (j - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL;
        if (spineDistance(pose.spine, x, z) <= FLOOR_KEEP) near++;
        if (floorCellShown(pose.spine, view, seg, count, x, z)) shown++;
      }
    }
    // Measured: 592 cells near the spine, 396 of them on screen within the hole's reach, of 1444.
    expect(near / FLOOR_SEGS ** 2).toBeLessThan(0.45);
    expect(shown).toBeLessThan(near * 0.75);
    expect(shown).toBeGreaterThan(200);
    // The CPU lists exactly those cells in the index buffer (the vertex shader runs for them alone),
    // each with its own two triangles, and centres the grid where floorGridCentre does.
    const mesh = buildFloorPatch();
    expect(mesh.geometry.drawRange.count).toBe(0);
    expect(updateFloorPatch(mesh, pose.spine, view, seg, count)).toBe(shown);
    expect(mesh.geometry.drawRange.count).toBe(shown * 6);
    const base = (mesh.material as THREE.ShaderMaterial).uniforms.uFloorBase.value as THREE.Vector2;
    expect([base.x, base.y]).toEqual(c);
    const idx = mesh.geometry.index!.array;
    const listed = new Set<number>();
    for (let t = 0; t < shown * 6; t += 6) {
      const v = idx[t];
      expect(v % 4).toBe(0);
      expect([idx[t + 1], idx[t + 2], idx[t + 3], idx[t + 4], idx[t + 5]]).toEqual([v + 2, v + 1, v + 1, v + 2, v + 3]);
      const cellId = v / 4;
      const i = cellId % FLOOR_SEGS;
      const j = (cellId - i) / FLOOR_SEGS;
      const x = c[0] + (i - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL;
      const z = c[1] + (j - FLOOR_SEGS / 2 + 0.5) * FLOOR_CELL;
      expect(floorCellShown(pose.spine, view, seg, count, x, z)).toBe(true);
      listed.add(cellId);
    }
    expect(listed.size).toBe(shown);
  });

  it('draws after the top of the litter, and after the worm and the leaves in its pocket', () => {
    expect(patch.renderOrder).toBe(FLOOR_ORDER);
    expect(GROUND_ORDER).toBeLessThan(POCKET_ORDER);
    expect(POCKET_ORDER).toBeLessThan(FLOOR_ORDER);
  });

  it('is in the world, with the worm, the hero leaves and the pocket\'s leaves drawn after the top of the litter', () => {
    const crawl = new Crawl();
    const world = buildWorld(crawl);
    world.apply(PRESETS.ultra);
    const named = (name: string) => {
      let found: THREE.Object3D | undefined;
      world.scene.traverse((o) => { if (o.name === name) found = o; });
      return found!;
    };
    expect(named('terrain').renderOrder).toBe(GROUND_ORDER);
    expect(named('floorPatch').renderOrder).toBe(FLOOR_ORDER);
    expect(named('worm').renderOrder).toBe(POCKET_ORDER);
    expect(named('heroLeaves').renderOrder).toBe(POCKET_ORDER);
    expect(world.pocket.built!.mesh.renderOrder).toBe(POCKET_ORDER);
    // The top leaves lie on the top of the litter: drawn before it, as in V1.
    expect(world.detail.built!.mesh.renderOrder).toBeLessThan(GROUND_ORDER);
  });
});
