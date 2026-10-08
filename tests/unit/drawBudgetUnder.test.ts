import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildWorld, type World } from '../../src/game/world';
import { SPACING, WORM_SEGMENTS, type Crawl } from '../../src/game/crawl';
import { PRESETS, type PresetId } from '../../src/render/graphics';
import { scaledLeafCount } from '../../src/surface/leafScale';
import { sharedLighting } from '../../src/render/paintedMaterial';
import { groundUniforms } from '../../src/render/groundUniforms';
import { createBody } from '../../src/worm/body';
import { rocks, ROCK_FOOT } from '../../src/surface/propPlacement';
import { canDigAt } from '../../src/underground/digSpot';
import { createCutScene, type CutHud, type CutScene } from '../../src/underground/cutScene';
import type { BurrowGame } from '../../src/underground/burrowGame';
import { BUDGET, countDraws } from './drawCount';
import { canEmergeAt } from '../../src/underground/emergeMap';
import { DT, RIGHT, STILL, makeGame, press, run, until } from './burrowPlay';

/**
 * The draw-call budget underground (V2 Task 17; drawBudget.test.ts counts the surface): a whole
 * visit (digging down, the camera's swing, digging in Wide and Close, coming up and the swing
 * back) drawn by the real cut scene over the real world, at the spawn and beside every rock, at
 * the bench's 1366 x 768 and a 360 x 640 phone, on every preset. While the camera is at the cut
 * the surface is whole: no fade, the hole's patches empty, every litter chunk plain, no rim light;
 * back on the surface each of them is as it was.
 */
const NO_HUD: CutHud = { place: () => {}, dip: () => {}, labels: () => {}, head: () => {} };

/** The spawn, and a spot 2.5 u from each rock's edge facing it (where the worm may dig there). */
const SPOTS: [string, number, number, number][] = [['spawn', 0, 0, 0]];
rocks().forEach((rock, n) => {
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    const r = rock.size * ROCK_FOOT + 2.5;
    const x = rock.x + Math.sin(a) * r;
    const z = rock.z + Math.cos(a) * r;
    const h = a + Math.PI;
    if (canDigAt(x, z, h, createBody(WORM_SEGMENTS, SPACING, { x, y: 0, z }, h))) {
      SPOTS.push([`rock ${n} ${k}`, x, z, h]);
      return;
    }
  }
});

/**
 * Steers the worm along the cut to the nearest place it can come out (emergeMap.ts), then up until
 * Action would bring it out.
 */
function steerOut(game: BurrowGame, each: () => void): void {
  const s = game.slab!;
  let to = NaN;
  for (let u = s.playLo; u <= s.playHi; u += 0.1) {
    // Well inside a stretch where it can come out.
    const ok = canEmergeAt(game.emerge, u - 0.4) && canEmergeAt(game.emerge, u) && canEmergeAt(game.emerge, u + 0.4);
    if (ok && !(Math.abs(u - game.worm.u[0]) >= Math.abs(to - game.worm.u[0]))) to = u;
  }
  for (let k = 0; k < 60 * 30 && !game.nearTop; k++) {
    const off = to - game.worm.u[0];
    const along = Math.abs(off) > 0.15 ? Math.sign(off) * game.rightSign : 0;
    game.step(DT, { x: along, y: along ? 0 : 1 }, false);
    each();
  }
  expect(game.prompt).toBe('comeUp');
}

describe('draw-call budget underground', () => {
  let crawl: Crawl;
  let game: BurrowGame;
  let world: World;
  let cut: CutScene;
  const camera = new THREE.PerspectiveCamera(60, 1366 / 768, 0.2, 120);
  const phone = new THREE.PerspectiveCamera(60, 360 / 640, 0.2, 120);
  let t = 0;
  beforeAll(() => {
    ({ crawl, game } = makeGame());
    world = buildWorld(crawl);
    cut = createCutScene(game, world, crawl, NO_HUD);
  });

  function applyPreset(id: PresetId): void {
    const spec = PRESETS[id];
    world.apply(spec);
    crawl.setReaction(spec.reaction);
    crawl.setHeroCount(scaledLeafCount(spec.hero));
  }

  /** One whole visit at a spot; the most draws per mode, frame by frame as the game draws them. */
  function visit(x: number, z: number, h: number, cam: THREE.PerspectiveCamera): Record<string, number> {
    game.reset();
    crawl.reset(crawl.hero.count, createBody(WORM_SEGMENTS, SPACING, { x, y: 0, z }, h), h);
    game.aspect = cam.aspect;
    game.view = 'wide';
    const most: Record<string, number> = {};
    let f = 0;
    const each = () => {
      t += DT;
      // Every other frame (the moves last seconds; a frame's draws change slowly).
      if (f++ % 2) return;
      cut.sync(1, t, cam, 1366, 768);
      const m = game.mode.mode;
      most[m] = Math.max(most[m] ?? 0, countDraws(world.scene, cam));
    };
    run(game, 0.3, STILL, each);
    expect(game.prompt).toBe('digDown');
    press(game, STILL, each);
    until(game, 'underground', 8, STILL, each);
    run(game, 1.5, RIGHT, each);
    press(game, STILL, each);
    run(game, 1.5, RIGHT, each);
    steerOut(game, each);
    press(game, STILL, each);
    until(game, 'surface', 8, STILL, each);
    run(game, 0.3, STILL, each);
    return most;
  }

  for (const id of ['low', 'medium', 'high', 'ultra'] as PresetId[]) {
    it(`${id}: at most ${BUDGET} draws through a whole visit, at the spawn and beside every rock, on a laptop and a phone`, () => {
      applyPreset(id);
      expect(SPOTS.length).toBeGreaterThan(rocks().length / 2);
      for (const [name, x, z, h] of SPOTS) {
        for (const cam of name === 'spawn' ? [camera, phone] : [camera]) {
          const most = visit(x, z, h, cam);
          for (const mode of ['surface', 'diggingDown', 'underground', 'comingUp']) {
            expect(most[mode], `${name} ${mode} at ${cam.aspect.toFixed(2)}`).toBeLessThanOrEqual(BUDGET);
          }
        }
      }
    });
  }

  it('at the cut the surface is whole (no fade, its hole closed, no rim light); back up, all as it was', () => {
    applyPreset('ultra');
    const named = (n: string) => world.scene.getObjectByName(n)!;
    game.reset();
    crawl.reset();
    game.aspect = camera.aspect;
    const each = () => { t += DT; cut.sync(1, t, camera, 1366, 768); };
    run(game, 0.3, STILL, each);
    // On the surface the worm's hole is open where it lies.
    expect(groundUniforms.uOccCount.value).toBeGreaterThan(0);
    expect(named('floorPatch').visible).toBe(true);
    expect(sharedLighting.uRim.value).toBe(1);
    const fogNear = sharedLighting.uFogNear.value;
    press(game, STILL, each);
    until(game, 'underground', 8, STILL, each);
    run(game, 0.5, RIGHT, each);
    expect(groundUniforms.uOccCount.value).toBe(0);
    for (const n of ['litterTopPatch', 'floorPatch', 'pocketLeaves', 'pocketLeavesFaded']) {
      const o = named(n) as THREE.Mesh;
      expect(!o.visible || o.geometry.drawRange.count === 0, n).toBe(true);
    }
    expect(world.litter.chunks.every((c) => !c.active)).toBe(true);
    expect(sharedLighting.uRim.value).toBe(0);
    expect(named('underground').visible).toBe(true);
    expect(named('middens').visible).toBe(false);
    expect(camera.near).toBeGreaterThan(1);
    steerOut(game, each);
    press(game, STILL, each);
    until(game, 'surface', 8, STILL, each);
    run(game, 0.3, STILL, each);
    expect(groundUniforms.uOccCount.value).toBeGreaterThan(0);
    expect(named('floorPatch').visible).toBe(true);
    expect(sharedLighting.uRim.value).toBe(1);
    expect(sharedLighting.uFogNear.value).toBe(fogNear);
    expect(camera.near).toBe(0.2);
    expect(named('underground').visible).toBe(false);
    expect(named('middens').visible).toBe(true);
    expect(world.worm.up).toEqual({ x: 0, y: 1, z: 0 });
  });
});
