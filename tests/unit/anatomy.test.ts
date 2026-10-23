import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CLITELLUM, LENGTH, ORGANS, SEGMENTS, segStart, segmentAt } from '../../src/anatomy/layout';
import { sampleBody } from '../../src/anatomy/body';
import { gutRadius } from '../../src/anatomy/gut';
import { ANCHORS } from '../../src/anatomy/anchors';
import { AnatomyWorm, SYSTEMS } from '../../src/anatomy/model';
import { VIEWS } from '../../src/anatomy/views';
import { ANATOMY_PARTS } from '../../src/content/anatomy';
import { pickPart } from '../../src/anatomy/picking';
import { gutPoint } from '../../src/anatomy/gut';
import { segMid } from '../../src/anatomy/layout';

const sample = (x: number) => sampleBody(x, { s: 0, w: 0, h: 0, yc: 0 });

describe('the nightcrawler layout (docs/codev/research/anatomy.md)', () => {
  it('has adult proportions: 110 to 180 segments, about 20 cm long, the saddle on 32 to 37', () => {
    expect(SEGMENTS).toBeGreaterThanOrEqual(110);
    expect(SEGMENTS).toBeLessThanOrEqual(180);
    expect(LENGTH).toBeGreaterThan(150);
    expect(LENGTH).toBeLessThan(250);
    expect(CLITELLUM).toEqual([32, 37]);
  });

  it('keeps the organs in the textbook order along the body', () => {
    expect(ORGANS.brain).toBe(3);
    expect(ORGANS.pharynx[1]).toBeLessThan(ORGANS.esophagus[0]);
    expect(ORGANS.hearts).toEqual([7, 11]);
    expect(ORGANS.esophagus[1]).toBeLessThan(ORGANS.crop[0]);
    expect(ORGANS.crop[1]).toBeLessThan(ORGANS.gizzard[0]);
    expect(ORGANS.gizzard[1]).toBeLessThan(ORGANS.intestineFrom);
    expect(ORGANS.seminalVesicles).toEqual([9, 11, 12]);
    expect(ORGANS.ovaries).toBe(13);
    expect(ORGANS.malePores).toBe(15);
  });

  it('maps segment numbers and positions both ways', () => {
    for (const n of [1, 10, 33, 90, SEGMENTS]) expect(segmentAt(segStart(n) + 0.01)).toBeCloseTo(n, 1);
  });

  it('fits the gut inside the body wall along its whole length', () => {
    for (let x = 1; x < LENGTH - 2; x += 0.5) {
      const b = sample(x);
      expect(gutRadius(b.s, b.w)).toBeLessThan(b.w * 0.85);
    }
  });

  it('points every label at a place inside the body', () => {
    for (const [id, a] of Object.entries(ANCHORS)) {
      const p = a.at();
      const b = sample(p.x);
      expect(p.x, id).toBeGreaterThan(-2);
      expect(p.x, id).toBeLessThan(LENGTH);
      expect(Math.abs(p.z), id).toBeLessThanOrEqual(b.w * 1.2 + 0.05);
      expect(Math.abs(p.y - b.yc), id).toBeLessThanOrEqual(b.h * 1.2 + 0.05);
    }
  });

  it('labels only parts that have a name and a sourced fact, in every view', () => {
    for (const v of VIEWS) for (const id of v.labels) expect(ANATOMY_PARTS[id], `${v.id}:${id}`).toBeDefined();
  });
});

describe('the anatomy model', () => {
  it('builds the game version as one mesh, one draw, under 20,000 vertices', () => {
    const worm = new AnatomyWorm('game');
    const meshes: THREE.Mesh[] = [];
    worm.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect(meshes).toHaveLength(1);
    expect(worm.stats().draws).toBe(1);
    expect(worm.stats().vertices).toBeLessThan(20_000);
  });

  it('shows and hides each system, and cuts the wall open, without rebuilding', () => {
    const worm = new AnatomyWorm('full');
    const geometries = new Set<THREE.BufferGeometry>();
    worm.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) geometries.add((o as THREE.Mesh).geometry); });
    const visible = (prefix: string) => worm.group.children.filter((m) => m.visible && m.name.startsWith(prefix)).length;
    for (const s of SYSTEMS) {
      worm.setSystem(s, false);
      expect(visible(`${s}:`), s).toBe(0);
      worm.setSystem(s, true);
      expect(visible(`${s}:`), s).toBeGreaterThan(0);
    }
    worm.setWall('solid');
    expect(visible('skin:near')).toBeGreaterThan(0);
    expect(visible('skin:cut')).toBe(0);
    worm.setWall('cut');
    expect(visible('skin:near')).toBe(0);
    expect(visible('skin:cut')).toBeGreaterThan(0);
    const after = new Set<THREE.BufferGeometry>();
    worm.group.traverse((o) => { if ((o as THREE.Mesh).isMesh) after.add((o as THREE.Mesh).geometry); });
    expect(after).toEqual(geometries);
  });

  it('fades a system with see-through twins built at load, and hides it at zero', () => {
    const worm = new AnatomyWorm('full');
    const meshes = worm.group.children.filter((m) => m.name.startsWith('gut:')) as THREE.Mesh[];
    const solid = meshes.map((m) => m.material);
    worm.setFade('gut', 0.4);
    for (const m of meshes) expect((m.material as THREE.Material).transparent, m.name).toBe(true);
    expect(meshes.every((m, i) => m.material !== solid[i])).toBe(true);
    worm.setFade('gut', 0);
    expect(worm.isOn('gut')).toBe(false);
    worm.setFade('gut', 1);
    expect(meshes.map((m) => m.material)).toEqual(solid);
  });

  it('builds a lighter lesson version of the same parts, and opens its gut while cut', () => {
    const worm = new AnatomyWorm('lesson');
    worm.setWall('cut');
    const visible = (name: string) => worm.group.children.some((m) => m.visible && m.name === name);
    expect(visible('gut:shut')).toBe(true);
    expect(visible('gut:open')).toBe(false);
    worm.openGut(true);
    expect(visible('gut:shut')).toBe(false);
    expect(visible('gut:open')).toBe(true);
    worm.setWall('solid');
    expect(visible('gut:shut')).toBe(true);
    expect(worm.stats().vertices).toBeLessThan(300_000);
  });

  it('names the part under a tap', () => {
    const worm = new AnatomyWorm('full');
    const at = (x: number) => worm.poseMap.point(gutPoint(x, Math.PI / 2, new THREE.Vector3()), new THREE.Vector3());
    expect(pickPart('gut', at(segMid(17)), worm.poseMap)).toBe('gizzard');
    expect(pickPart('gut', at(segMid(15)), worm.poseMap)).toBe('crop');
    expect(pickPart('gut', at(segMid(60)), worm.poseMap)).toBe('intestine');
  });
});
