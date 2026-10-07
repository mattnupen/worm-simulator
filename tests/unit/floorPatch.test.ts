import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildFloorPatch } from '../../src/surface/floorPatch';
import { FLOOR_CENTRE, FLOOR_SEGS, FLOOR_SIZE } from '../../src/render/floorMaterial';
import { FLOOR_ORDER, GROUND_ORDER, POCKET_ORDER } from '../../src/render/drawOrder';
import { groundUniforms } from '../../src/render/groundUniforms';
import { OCC_REACH } from '../../src/render/occlusion';
import { buildWorld } from '../../src/game/world';
import { Crawl } from '../../src/game/crawl';
import { PRESETS } from '../../src/render/graphics';

describe('the floor under the buried worm (V2 spec 8.2)', () => {
  const patch = buildFloorPatch();

  it('is one grid of FLOOR_SEGS cells a side, placed round the head by its shader', () => {
    const pos = patch.geometry.getAttribute('position');
    expect(pos.count).toBe((FLOOR_SEGS + 1) ** 2);
    expect(patch.geometry.index!.count).toBe(FLOOR_SEGS * FLOOR_SEGS * 6);
    expect(patch.frustumCulled).toBe(false);
    const xs = Array.from({ length: pos.count }, (_, v) => pos.getX(v));
    expect(Math.min(...xs)).toBe(-FLOOR_SEGS / 2);
    expect(Math.max(...xs)).toBe(FLOOR_SEGS / 2);
    const m = patch.material as THREE.ShaderMaterial;
    expect(m.uniforms.uSpine).toBe(groundUniforms.uSpine);
    expect(m.vertexShader).toContain('terrainHeight(xz)');
  });

  it('reaches past the head and the tail, and what the hole over the worm shows round them', () => {
    // Centred on the middle of the body (1.65 from either end); the hole reaches OCC_REACH from
    // its axis, and the floor seen through it at a slant up to about a metre more.
    expect(FLOOR_CENTRE).toBe(7);
    expect(FLOOR_SIZE / 2).toBeGreaterThan(1.65 + OCC_REACH + 1);
  });

  it('draws after the top of the litter, and after the worm and the leaves in its pocket', () => {
    expect(patch.renderOrder).toBe(FLOOR_ORDER);
    expect(GROUND_ORDER).toBeLessThan(POCKET_ORDER);
    expect(POCKET_ORDER).toBeLessThan(FLOOR_ORDER);
  });

  it('is in the world, with the worm and the hero leaves drawn after the top of the litter', () => {
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
    // The top leaves lie on the top of the litter: drawn before it, as in V1.
    expect(world.detail.built!.mesh.renderOrder).toBeLessThan(GROUND_ORDER);
  });
});
