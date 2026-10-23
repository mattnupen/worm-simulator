import { describe, it, expect } from 'vitest';
import { HINT_S, DIG_RECHECK } from '../../src/underground/burrowGame';
import { canDigAt, cutHeading, DIG_EDGE } from '../../src/underground/digSpot';
import { PLAY_HALF } from '../../src/surface/terrain';
import { boundaryAt, slabU, B_F } from '../../src/underground/slab';
import { canEmergeAt } from '../../src/underground/emergeMap';
import { poseAt, AXIS_UP } from '../../src/underground/bodyPath';
import { MAX_OPENINGS } from '../../src/underground/openings';
import { createBody } from '../../src/worm/body';
import { SPACING, WORM_SEGMENTS } from '../../src/game/crawl';
import { cameraProgress, dipDarkness, FADE_S } from '../../src/underground/modeMachine';
import { cutPose, type CutPose } from '../../src/underground/cutCamera';
import { cameraTarget } from '../../src/surface/followCamera';
import { CAM_OPTS } from '../../src/game/cameraClearance';
import { footprints } from '../../src/surface/obstacles';
import { loadSettings, updateSettings, SETTINGS_KEY, type KeyValueStore } from '../../src/save/settingsStore';
import { project } from './cutWorld';
import { DT, N, STILL, UP, RIGHT, makeGame, press, run, until, digDown, steerToTop, shown, gap } from './burrowPlay';

/** Crawling forward, turning right. */
const TURN = { x: 1, y: 1 };

describe('the surface-and-underground game (V2 spec 4, 6, 7)', () => {
  it('crawls on the surface and offers Dig down where allowed', () => {
    const { crawl, game } = makeGame();
    run(game, 0.5, UP);
    expect(crawl.motion.head.z).toBeGreaterThan(0.5);
    expect(game.mode.mode).toBe('surface');
    expect(game.prompt).toBe('digDown');
  });

  it('offers nothing where it may not dig (beside a trunk), and a press there does nothing', () => {
    const { crawl, game } = makeGame();
    const { round } = footprints();
    let k = 0;
    while (round[k + 3] !== Infinity) k += 4;
    // Lying along the trunk's side, just clear of it.
    const x = round[k] + round[k + 2] + 0.25;
    const at = Array.from({ length: N }, (_, i) => ({ x, y: 0, z: round[k + 1] - 0.22 * i }));
    crawl.reset(crawl.hero.count, at, 0);
    expect(canDigAt(crawl.motion.head.x, crawl.motion.head.z, 0, crawl.body)).toBe(false);
    run(game, 0.1);
    expect(game.prompt).toBeNull();
    press(game);
    expect(game.mode.mode).toBe('surface');
    expect(game.visits).toBe(0);
  });

  it('asks canDigAt again only as the head moves or turns enough, and afresh for a press', () => {
    const { crawl, game } = makeGame();
    // Just inside the play edge's limit, then a hair outside it (closer than DIG_RECHECK).
    const lim = PLAY_HALF - DIG_EDGE;
    const lying = (x: number, z: number) => Array.from({ length: N }, (_, i) => ({ x: x - 0.22 * i, y: 0, z }));
    let z = -10;
    for (; z < 10; z += 0.25) {
      crawl.reset(crawl.hero.count, lying(lim - 0.01, z), Math.PI / 2);
      if (canDigAt(crawl.motion.head.x, crawl.motion.head.z, crawl.motion.heading, crawl.body)) break;
    }
    game.step(DT, STILL, false);
    expect(game.prompt).toBe('digDown');
    crawl.reset(crawl.hero.count, lying(lim + 0.01, z), Math.PI / 2);
    expect(canDigAt(crawl.motion.head.x, crawl.motion.head.z, crawl.motion.heading, crawl.body)).toBe(false);
    // Moved under DIG_RECHECK: the prompt is not asked again...
    game.step(DT, STILL, false);
    expect(Math.abs(crawl.motion.head.x - lim)).toBeLessThan(DIG_RECHECK / 2);
    expect(game.prompt).toBe('digDown');
    // ...but a press is: it does not dig here.
    game.step(DT, STILL, true);
    expect(game.mode.mode).toBe('surface');
    expect(game.prompt).toBeNull();
  });

  it('a full visit: dig down, dig around, switch the view, come up, and crawl on', () => {
    const { crawl, game, saved } = makeGame();
    run(game, 0.5, UP);
    const head = { ...crawl.motion.head };
    const heading = crawl.motion.heading;
    const cut = cutHeading(head.x, head.z, heading, crawl.body)!;
    // Dig down: a new slab through the head along the cut digSpot chose.
    press(game);
    expect(game.mode.mode).toBe('diggingDown');
    expect(game.prompt).toBeNull();
    const s = game.slab!;
    expect(s.ox).toBe(head.x);
    expect(s.oz).toBe(head.z);
    expect(s.tx).toBeCloseTo(Math.sin(cut), 12);
    expect(s.tz).toBeCloseTo(Math.cos(cut), 12);
    // The slab's soil is ready a few steps in, before the camera starts to move.
    expect(game.slabVersion).toBe(1);
    expect(game.slabHidden).toBe(true);
    until(game, 'underground');
    expect(game.mode.t).toBe(0);
    expect(game.worm.v[0]).toBeLessThan(boundaryAt(s, B_F, game.worm.u[0]) - 0.5);
    expect(game.prompt).toBe('viewClose');
    // The surface stands still below: the crawl is not stepped.
    const still = JSON.stringify(crawl.body);
    // Dig around: it moves and opens a tunnel.
    const u0 = game.worm.u[0];
    let open0 = 0;
    for (let i = 0; i < game.grid.open.length; i++) open0 += game.grid.open[i];
    run(game, 2, RIGHT);
    expect(Math.abs(game.worm.u[0] - u0)).toBeGreaterThan(1);
    let open1 = 0;
    for (let i = 0; i < game.grid.open.length; i++) open1 += game.grid.open[i];
    expect(open1).toBeGreaterThan(open0 + 30);
    expect(JSON.stringify(crawl.body)).toBe(still);
    // Switch the view, and back: each switch is saved.
    press(game);
    expect(game.view).toBe('close');
    expect(game.prompt).toBe('viewWide');
    press(game);
    expect(game.view).toBe('wide');
    expect(saved).toEqual(['close', 'wide']);
    // Come up near the top, where it can.
    steerToTop(game);
    press(game);
    expect(game.mode.mode).toBe('comingUp');
    // The crawl already lies where the worm will, facing along the cut, its camera settled behind.
    const p = game.path;
    const us = new Float64Array(N); const vs = new Float64Array(N); const ws = new Float64Array(N);
    poseAt(p, 1, us, vs, ws);
    for (let i = 0; i < N; i++) {
      expect(slabU(s, crawl.body[i].x, crawl.body[i].z)).toBeCloseTo(us[i], 6);
      expect(crawl.body[i].y).toBeCloseTo(vs[i] - AXIS_UP, 6);
      expect(Math.abs((crawl.body[i].x - s.ox) * s.nx + (crawl.body[i].z - s.oz) * s.nz)).toBeLessThan(1e-9);
    }
    expect(Math.sin(crawl.motion.heading) * s.tx + Math.cos(crawl.motion.heading) * s.tz).toBeCloseTo(p.exitSign, 9);
    const t = cameraTarget(crawl.motion.head, crawl.motion.heading, CAM_OPTS.distance, CAM_OPTS.height);
    expect(Math.hypot(crawl.cam.pos.x - t.x, crawl.cam.pos.z - t.z)).toBeLessThan(0.05);
    until(game, 'surface');
    // An opening where it came out; the worm handed over exactly; the crawl goes on from there.
    expect(game.openings.count).toBe(1);
    const o = game.openings.data;
    expect(Math.hypot(o[0] - (s.ox + s.tx * p.exitU), o[2] - (s.oz + s.tz * p.exitU))).toBeLessThan(1e-5);
    for (let i = 0; i < N; i++) {
      expect(slabU(s, crawl.body[i].x, crawl.body[i].z)).toBeCloseTo(game.worm.u[i], 6);
      expect(crawl.body[i].y).toBeCloseTo(game.worm.v[i] - AXIS_UP, 6);
    }
    const before = { ...crawl.motion.head };
    run(game, 0.5, UP);
    expect(Math.hypot(crawl.motion.head.x - before.x, crawl.motion.head.z - before.z)).toBeGreaterThan(0.3);
    expect(game.slabVersion).toBe(1);
    expect(saved).toEqual(['close', 'wide']);
  });

  it('a held press acts once: holding Action through a dig, a pause and beyond never acts again', () => {
    const { game } = makeGame();
    run(game, 0.5, UP);
    for (let k = 0; k < 60 * 6; k++) game.step(DT, STILL, true);
    expect(game.mode.mode).toBe('underground');
    expect(game.view).toBe('wide');
    expect(game.visits).toBe(1);
    game.step(DT, STILL, false);
    press(game);
    expect(game.view).toBe('close');
    // Held through coming up and on along the surface, where it could dig again: no second dig.
    steerToTop(game);
    let offered = false;
    for (let k = 0; k < 60 * 8; k++) {
      game.step(DT, game.mode.mode === 'surface' && k > 300 ? UP : STILL, true);
      offered ||= game.prompt === 'digDown';
    }
    expect(offered).toBe(true);
    expect(game.mode.mode).toBe('surface');
    expect(game.visits).toBe(1);
    // Pressed while paused (hold) and held on resuming: not a press. Let go and press: it digs.
    // (Turning back first: straight on, it crawls up onto a rock, where it may not dig, and on to
    // the maple's foot: V4 hot fix.)
    for (let k = 0; k < 900 && game.prompt !== 'digDown'; k++) game.step(DT, k < 300 ? STILL : k < 420 ? TURN : UP, false);
    expect(game.prompt).toBe('digDown');
    game.hold(true);
    game.step(DT, STILL, true);
    expect(game.mode.mode).toBe('surface');
    game.step(DT, STILL, false);
    game.step(DT, STILL, true);
    expect(game.mode.mode).toBe('diggingDown');
  });

  it('at the top Action always comes up: at once where the body can lie out, else after heading out (V4 hot fix)', () => {
    const { game } = makeGame();
    run(game, 0.5, UP);
    digDown(game);
    steerToTop(game);
    expect(canEmergeAt(game.emerge, game.worm.u[0])).toBe(true);
    // The same spot with no way out anywhere (as beside a trunk, at a slab's end): still Come up,
    // never the view switch. With nowhere better, the worm comes up where it is.
    const sides = game.emerge.sides.slice();
    game.emerge.sides.fill(0);
    game.step(DT, STILL, false);
    expect(game.worm.nearTop).toBe(true);
    expect(game.nearTop).toBe(false);
    expect(game.prompt).toBe('comeUp');
    press(game);
    expect(game.view).toBe('wide');
    until(game, 'comingUp', 4);
    until(game, 'surface');
    game.emerge.sides.set(sides);
  });

  it('the view setting is stored only when the player switches it', () => {
    const data: Record<string, string> = {};
    const store: KeyValueStore = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
    const { game } = makeGame({ view: loadSettings(store).undergroundView, save: (v) => updateSettings(store, { undergroundView: v }) });
    run(game, 0.5, UP);
    digDown(game);
    run(game, 1, RIGHT);
    expect(data[SETTINGS_KEY] ?? '').not.toContain('undergroundView');
    press(game);
    expect(JSON.parse(data[SETTINGS_KEY]).undergroundView).toBe('close');
    expect(loadSettings(store).undergroundView).toBe('close');
  });

  it('screen right is along the cut the way the camera sees it', () => {
    const { game } = makeGame();
    run(game, 0.5, UP);
    digDown(game);
    const s = game.slab!;
    const c = game.cam;
    const cp: CutPose = { px: 0, py: 0, pz: 0, lx: 0, ly: 0, lz: 0 };
    cutPose(s, c.cu.value, c.cv.value, c.h.value, c.pitch.value, cp);
    const at = (u: number) => project(cp, 16 / 9, s.ox + s.tx * u, game.worm.v[0], s.oz + s.tz * u).nx;
    expect(Math.sign(at(1) - at(0))).toBe(game.rightSign);
    const u0 = game.worm.u[0];
    run(game, 2, RIGHT);
    expect(Math.sign(game.worm.u[0] - u0)).toBe(game.rightSign);
  });

  it('one slab per visit: digging down again makes a fresh one', () => {
    const { game } = makeGame();
    run(game, 0.5, UP);
    digDown(game);
    steerToTop(game);
    press(game);
    until(game, 'surface');
    // Crawl on until Dig down shows (where it comes up depends on how its body lay below).
    for (let k = 0; k < 30 && game.prompt !== 'digDown'; k++) run(game, 0.1, UP);
    digDown(game);
    expect(game.slabVersion).toBe(2);
    let open = 0;
    for (let i = 0; i < game.grid.open.length; i++) open += game.grid.open[i];
    expect(open).toBeLessThan(400);
  });

  it('keeps at most 8 openings, the oldest replaced; one burrow reused keeps one; reset clears them and comes back up', () => {
    const { crawl, game } = makeGame();
    const comeUpFrom = (x: number): void => {
      crawl.reset(crawl.hero.count, createBody(WORM_SEGMENTS, SPACING, { x, y: 0, z: 0 }, 0), 0);
      run(game, 0.5, UP);
      digDown(game);
      steerToTop(game);
      press(game);
      until(game, 'surface');
    };
    // The same dig twice goes back into the same burrow (V4: its tunnels stay, so the worm may come
    // up by another way): at most one opening per way out, each over that one burrow.
    comeUpFrom(0);
    comeUpFrom(0);
    expect(game.burrows.slabs.filter(Boolean)).toHaveLength(1);
    expect(game.openings.count).toBeLessThanOrEqual(2);
    for (let i = 0; i < game.openings.count; i++) expect(game.openings.burrow[i]).toBe(0);
    // Digs 1.5 u apart (the cuts run parallel): each leaves its own.
    for (let n = 1; n < MAX_OPENINGS + 2; n++) comeUpFrom(n % 2 ? -1.5 * Math.ceil(n / 2) : 1.5 * (n / 2));
    expect(game.openings.count).toBe(MAX_OPENINGS);
    expect(game.openings.version).toBe(MAX_OPENINGS + 3);
    // Crawl on until Dig down shows (where it comes up depends on how its body lay below; after 3 s,
    // turning a little, then on: it crawls over a rock in the way, where it may not dig, V4 hot fix).
    for (let k = 0; k < 100 && game.prompt !== 'digDown'; k++) run(game, 0.1, { x: k > 30 && k < 40 ? 1 : 0, y: 1 });
    digDown(game);
    game.reset();
    expect(game.mode.mode).toBe('surface');
    expect(game.openings.count).toBe(0);
    expect(game.burrows.slabs.filter(Boolean)).toHaveLength(0);
    expect(game.home).toBe(-1);
  });

  it('the first visit shows the hint card for HINT_S underground, from the end of the swing, later visits none', () => {
    const { game } = makeGame();
    run(game, 0.5, UP);
    expect(game.hintShowing).toBe(false);
    press(game);
    // Not over the surface view or the camera's swing.
    expect(game.mode.mode).toBe('diggingDown');
    expect(game.hintShowing).toBe(false);
    until(game, 'underground');
    expect(game.hintShowing).toBe(true);
    run(game, HINT_S - 0.1);
    expect(game.hintShowing).toBe(true);
    run(game, 0.2);
    expect(game.hintShowing).toBe(false);
  });

  it('reduced motion going down: a short dip; in the dark the worm is sunk and the camera at the cut, still as it clears', () => {
    for (const view of ['wide', 'close'] as const) {
      let reduced = true;
      const { crawl, game } = makeGame({ reduced: () => reduced, view });
      run(game, 0.5, UP);
      press(game);
      reduced = false;
      expect(game.mode.reduced).toBe(true);
      let t = 10 * DT; // the press's steps
      let cutAt = NaN;
      let cam = cameraProgress(game.mode);
      let held: number[] | null = null;
      let camMoved = 0;
      const frame = () => shown(game, 0.5).cut!;
      for (let k = 0; k < 60 * 6 && game.mode.mode === 'diggingDown'; k++) {
        game.step(DT, STILL, false);
        t += DT;
        const c = cameraProgress(game.mode);
        if (c !== cam) {
          cutAt = t;
          // Cut in the dark, the worm already sunk (the rest of its move skipped).
          expect(dipDarkness(game.mode)).toBe(1);
          expect(game.offW.every((w) => w === 0)).toBe(true);
          cam = c;
        }
        if (held) camMoved = Math.max(camMoved, ...frame().map((x, i) => Math.abs(x - held![i])));
        else if (c === 1) held = frame();
      }
      expect(game.mode.mode).toBe('underground');
      expect(t).toBeLessThan(FADE_S + 2 * DT);
      expect(cutAt).toBeLessThan(0.4);
      // The cut camera stood still from the cut on: nothing slides in as the dip clears.
      run(game, 0.5, STILL, () => { camMoved = Math.max(camMoved, ...frame().map((x, i) => Math.abs(x - held![i]))); });
      expect(camMoved).toBeLessThan(1e-3);
      expect(crawl.motion.head.z).toBeGreaterThan(0.5);
    }
  });

  it('reduced motion coming up: a short dip; in the dark the worm and the camera cut to where the crawl starts', () => {
    const { crawl, game } = makeGame({ reduced: () => true });
    run(game, 0.5, UP);
    digDown(game);
    steerToTop(game);
    const before = shown(game, 1).body;
    press(game);
    expect(game.mode.mode).toBe('comingUp');
    let t = 10 * DT;
    let cam = 1;
    let cuts = 0;
    for (let k = 0; k < 60 * 8 && game.mode.mode === 'comingUp'; k++) {
      const c = cameraProgress(game.mode);
      if (c !== cam) {
        cuts++;
        expect(dipDarkness(game.mode)).toBe(1);
        cam = c;
      }
      // Before the cut the worm only starts its move; from the cut it lies where the crawl starts.
      if (c === 1) expect(gap(shown(game, 1).body, before)).toBeLessThan(0.5);
      else expect(gap(shown(game, 1).body, crawl.body.flatMap((p) => [p.x, p.y, p.z]))).toBeLessThan(1e-6);
      game.step(DT, STILL, false);
      t += DT;
    }
    expect(game.mode.mode).toBe('surface');
    expect(t).toBeLessThan(FADE_S + 2 * DT);
    expect(cuts).toBe(1);
    expect(dipDarkness(game.mode)).toBe(0);
  });

  it('enterNow puts the speed test straight underground, always in Wide, and the scripted dig moves', () => {
    // The player had picked Close: the test still measures Wide, and saves nothing.
    const { game, saved } = makeGame({ view: 'close' });
    game.enterNow();
    expect(game.mode.mode).toBe('underground');
    expect(game.view).toBe('wide');
    expect(saved).toEqual([]);
    expect(game.slabVersion).toBe(1);
    // Not the player's visit: their first one still shows the hint card.
    expect(game.visits).toBe(0);
    expect(game.hintShowing).toBe(false);
    const u = game.worm.u[0];
    const v = game.worm.v[0];
    for (let k = 0; k < 60 * 5; k++) game.step(DT, STILL, false, true);
    expect(Math.hypot(game.worm.u[0] - u, game.worm.v[0] - v)).toBeGreaterThan(1);
  });
});
