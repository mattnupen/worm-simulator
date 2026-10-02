import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { HeroWorm, type WormPose } from '../../src/worm/wormMesh';

const N = 16;
const spineOf = (f: (i: number) => [number, number, number]) => {
  const a = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) a.set(f(i), i * 3);
  return a;
};

const SPINES: Record<string, Float32Array> = {
  straight: spineOf((i) => [0, 0.035, -0.22 * i]),
  coincident: spineOf(() => [5, 0.035, 5]),
  'vertical stack': spineOf((i) => [0, 0.035 + 0.22 * i, 0]),
  'U-turn': spineOf((i) => {
    const a = (i * 0.22) / 0.5;
    return [0.5 * Math.sin(a), 0.035, -0.5 * (1 - Math.cos(a))];
  }),
  'two coincident groups': spineOf((i) => [0, 0.035, i < 8 ? 0 : -1]),
};

describe('HeroWorm.update', () => {
  const worm = new HeroWorm(N);
  const meshes = worm.group.children as THREE.Mesh[];
  const body = meshes.find((o) => o.name === 'worm')!;
  const shadow = meshes.find((o) => o.name === 'wormShadow')!;
  const attr = (m: THREE.Mesh, name: string) => m.geometry.getAttribute(name).array as Float32Array;

  for (const [name, spine] of Object.entries(SPINES)) {
    for (const [phase, activity] of [[0, 0], [3.37, 0.5], [12.1, 1]]) {
      it(`${name} (phase ${phase}, activity ${activity}): finite, unit normals`, () => {
        const pose: WormPose = { spine, phase, activity, timeSec: 1.2 };
        worm.update(pose);
        const pos = attr(body, 'position');
        const nor = attr(body, 'normal');
        expect(pos.every(Number.isFinite)).toBe(true);
        expect(nor.every(Number.isFinite)).toBe(true);
        expect(attr(body, 'aTangent').every(Number.isFinite)).toBe(true);
        expect(attr(shadow, 'position').every(Number.isFinite)).toBe(true);
        for (let v = 0; v < nor.length; v += 3) {
          expect(Math.hypot(nor[v], nor[v + 1], nor[v + 2])).toBeCloseTo(1, 4);
        }
      });
    }
  }
});

describe('HeroWorm contact shadow', () => {
  it('lies on the ground function it is given', () => {
    const worm = new HeroWorm(N, () => 0.5);
    worm.update({ spine: SPINES.straight, phase: 0, activity: 0, timeSec: 0 });
    const shadow = (worm.group.children as THREE.Mesh[]).find((o) => o.name === 'wormShadow')!;
    const pos = shadow.geometry.getAttribute('position').array as Float32Array;
    for (let v = 1; v < pos.length; v += 3) expect(pos[v]).toBeCloseTo(0.57, 6);
  });
});
