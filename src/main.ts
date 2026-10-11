import * as THREE from 'three';
import './ui/parchment.css';
import './ui/hud.css';
import { startLoop } from './core/loop';
import { FpsMeter } from './render/fps';
import { TIERS } from './render/quality';
import {
  PRESETS, CHOICE_LABELS, pixelRatioFor, recommendedPreset, tierSpec, type PresetSpec,
} from './render/graphics';
import { setResolution, setTime } from './render/paintedMaterial';
import { KeyboardInput } from './input/keyboard';
import { TouchJoystick } from './input/touchJoystick';
import { keysToCommandsInto, mergeCommandsInto, NO_COMMANDS, type Commands } from './input/commands';
import { createPressEdge } from './input/actionEdge';
import { parseParams } from './game/params';
import { initialScreens, transition, type ScreenEvent, type ScreenState } from './game/screens';
import { GraphicsControl } from './game/graphicsControl';
import { buildWorld } from './game/world';
import { Crawl } from './game/crawl';
import { AUTO_DRIVE_MOVE } from './game/drive';
import { scaledLeafCount } from './surface/leafScale';
import { browserStore } from './save/settingsStore';
import { FPS_CAP, SpeedTestRunner } from './perf/speedTestRunner';
import { formatContextLostResults, formatNoWebGLResults } from './perf/speedTest';
import { basicDeviceInfo, deviceInfo } from './perf/device';
import { createShell } from './ui/shell';
import { showCrawl, showLost, showPause, showStart } from './ui/menus';
import { showGraphics } from './ui/graphicsMenu';
import { createActionPrompt } from './ui/actionPrompt';
import { showResult, showRunning, showTestIntro } from './ui/speedTestUi';
import { showUnderground } from './ui/undergroundHint';
import { closeLesson, showLesson } from './ui/lesson';
import { CURRENT_LESSON } from './content/lessons';
import { lessonDone, markLessonDone } from './save/lessonStore';
import { warmShaders } from './render/warmShaders';
import { createBurrowing } from './underground/burrowing';

const RESET_AFTER_TEST_NOTE = 'The graphics reset after the test. These results are still valid.';
const RESET_NOTE = 'The graphics reset during the test. Reload the page and try again.';
const CRASH_AFTER_TEST_NOTE = 'Something went wrong after the test. These results are still valid. '
  + 'Reload the page to keep playing.';
/** The Lost card's heading when the game threw (not a graphics reset). */
const CRASH_TITLE = 'Something went wrong';
/** The game's frame cap; the speed test lifts it for its uncapped phase. */
const MAX_FPS = FPS_CAP;

const params = parseParams(location.search);
const app = document.getElementById('app')!;
let onPauseButton = (): void => {};
// The card exists before any 3D setup, so a computer without WebGL 2 still gets a report.
const shell = createShell(app, params.fps, () => onPauseButton());

let renderer: THREE.WebGLRenderer | null = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  // Three r186 needs WebGL 2 and throws without it. That is a FAIL worth reporting, not a blank page.
  const reason = e instanceof Error ? e.message : String(e);
  showResult(shell, formatNoWebGLResults(basicDeviceInfo(), reason), false,
    { summary: 'This computer could not start the 3D graphics.' });
}
if (renderer) run(renderer);

/**
 * Building the world is the one slow, fallible step. If it throws, the Start card (already up)
 * would sit there with buttons that cannot work, so it is replaced with a Reload card.
 */
function run(renderer: THREE.WebGLRenderer): void {
  try {
    start(renderer);
  } catch (e) {
    console.error(e);
    renderer.domElement.remove();
    showLost(shell, 'The game could not start. Reload the page to try again.', CRASH_TITLE);
  }
}

function start(renderer: THREE.WebGLRenderer): void {
  app.appendChild(renderer.domElement);
  let state: ScreenState = initialScreens(params.speedTest, params.lesson && !!CURRENT_LESSON);
  // The first card (Start, or the speed-test intro) goes up synchronously, before the slow
  // world build, so no frame is ever painted with an empty card. (The no-WebGL path shows its
  // FAIL card just as synchronously, above.) Its buttons only act once run() has finished.
  const store = browserStore();
  draw();
  // Near plane 0.2 (not 0.1) doubles depth precision for the thin, layered leaf litter. The
  // camera stays >= 0.5 above the litter and 2.6 behind the worm, so nothing it normally looks
  // at comes within 0.2 of the lens.
  const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 120);
  const crawl = new Crawl();
  const world = buildWorld(crawl);
  const keyboard = new KeyboardInput();
  const joystick = new TouchJoystick(app);
  // What Action does now, and the touch Action button. The game sets it from where the worm is;
  // ?prompt= shows one kind (none while #app has data-prompt-off) and counts data-action-presses.
  const actionPrompt = createActionPrompt(app);
  // Surface or underground (V2): the game steps the crawl on the surface and digs below it.
  const { game, cut } = createBurrowing(crawl, world, app, shell.panel, store);
  /** The crawl screen's card: 0 the surface one, 1 the first underground visit's hint, 2 none. */
  let shownCard = 0;
  const cardNow = (): number => (game.mode.mode === 'surface' ? 0 : game.hintShowing ? 1 : 2);
  const pressEdge = createPressEdge();
  let presses = 0;
  const meter = new FpsMeter();
  const graphics = new GraphicsControl(store, params.preset);
  // The speed test measures a forced ?preset= or, normally, High.
  const testBase = PRESETS[params.preset ?? 'high'];
  const drawSize = new THREE.Vector2();
  let spec: PresetSpec = PRESETS[graphics.active];
  /** What the results screen shows. */
  let report: { text: string; pass: boolean; summary?: string } | null = null;
  let lost = false;
  /** Game clock (ms). It stands still while paused, so wind, dust and the worm's breath freeze. */
  let clock = 0;
  let lastNow = performance.now();
  /** Something changed while frozen (preset, size): draw one more frame. */
  let dirty = true;

  const runner = new SpeedTestRunner({
    // Every run starts at the spawn, whatever the player did before opening the test (or dug: no
    // openings). ?dig=1 starts it underground there, in Wide (scripts/perf-gates.mjs's run below).
    resetWorld: () => { crawl.reset(); if (params.dig) game.enterNow(); else game.reset(); dirty = true; },
    where: () => (game.mode.mode === 'surface' ? 'Surface' : 'Underground'),
    setMaxFps: (fps) => loop.setMaxFps(fps),
    applyTier: (tier) => applySpec(tierSpec(testBase, TIERS[tier])),
    showPhase: (p) => showRunning(shell,
      p.id === 'full' ? 'Test 1 of 2: full quality' : 'Test 2 of 2: auto quality', p.id === 'full' ? 1 : 2, 2),
    deviceInfo: () => deviceInfo(renderer),
  }, params.quick, () => world.litter.drawn + world.detail.drawn);

  function updateResolution(): void {
    renderer.getDrawingBufferSize(drawSize);
    setResolution(drawSize.x, drawSize.y);
  }

  /**
   * Applies live: pixel ratio, draw ranges, visibility, uniforms. No rebuilds and no recompiles,
   * except the first time a preset shows a lazily built layer (the detail leaves; Ultra's near
   * clutter): that layer is built and its shader compiles once, then it is only shown and hidden.
   */
  function applySpec(s: PresetSpec): void {
    spec = s;
    renderer.setPixelRatio(pixelRatioFor(s, window.devicePixelRatio));
    world.apply(s);
    crawl.setReaction(s.reaction);
    crawl.setHeroCount(scaledLeafCount(s.hero));
    updateResolution();
    dirty = true;
    // The frames around a preset change say nothing about the new preset's speed.
    graphics.interruptAuto(performance.now());
  }

  /** The player's own preset: a forced ?preset=, a menu choice, or Auto's current pick. */
  function applyActive(): void {
    applySpec(PRESETS[graphics.active]);
  }

  function resize(): void {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    game.aspect = camera.aspect;
    updateResolution();
    dirty = true;
  }

  function dispatch(e: ScreenEvent): void {
    if (lost) return;
    const next = transition(state, e);
    if (next === state) return;
    // Leaving the speed-test screen while the test runs (Back to start) stops the test first:
    // otherwise its uncapped frame rate and quality tier would stay on, and its result would
    // later land on another screen. The running card offers no such button today.
    if (runner.running && next.screen !== 'speedTest') stopTest();
    // Back from Graphics: focus returns to the button that opened it.
    const back = e.type === 'back' && state.screen === 'graphics';
    // Leaving the lesson by any way (Esc included): its cue and any reading aloud stop.
    if (state.screen === 'lesson') closeLesson(shell.root);
    state = next;
    // A slow streak from before (or a menu over the scene) must not count against Auto.
    graphics.interruptAuto(performance.now());
    draw(back);
  }

  /**
   * The game threw and the loop is stopped: say so, do not freeze silently. Nothing builds or
   * redraws a game screen after this.
   */
  function crash(): void {
    if (runner.running) runner.abort();
    const finished = state.screen === 'results' && !lost ? report : null;
    lost = true;
    if (finished) {
      // As after a context loss: the finished report matters more than the crash. Shown
      // again with a note and without the buttons that need a running game.
      report = { ...finished, summary: CRASH_AFTER_TEST_NOTE };
      showReport();
    } else {
      showLost(shell, 'The game stopped unexpectedly. Reload the page to try again.', CRASH_TITLE);
    }
  }

  /** Abandons a running speed test without a result and restores the player's own settings. */
  function stopTest(): void {
    runner.abort();
    loop.setMaxFps(MAX_FPS);
    applyActive();
  }

  function draw(fromGraphics = false): void {
    switch (state.screen) {
      case 'start':
        return showStart(shell, {
          onCrawl: () => dispatch({ type: 'crawl' }),
          onGraphics: () => dispatch({ type: 'graphics' }),
          onSpeedTest: () => dispatch({ type: 'speedTest' }),
        }, fromGraphics, CURRENT_LESSON ? {
          title: CURRENT_LESSON.title,
          done: lessonDone(store, CURRENT_LESSON.id),
          onLesson: () => dispatch({ type: 'lesson' }),
        } : undefined);
      case 'lesson':
        if (!CURRENT_LESSON) return;
        return showLesson(shell, CURRENT_LESSON, {
          onCrawl: () => dispatch({ type: 'crawl' }),
          onStart: () => dispatch({ type: 'toStart' }),
          onFinish: () => markLessonDone(store, CURRENT_LESSON!.id),
        });
      case 'crawl':
        shownCard = cardNow();
        return shownCard === 0 ? showCrawl(shell) : showUnderground(shell, shownCard === 1);
      case 'pause':
        return showPause(shell, {
          onResume: () => dispatch({ type: 'resume' }),
          onGraphics: () => dispatch({ type: 'graphics' }),
          onStart: () => dispatch({ type: 'toStart' }),
        }, fromGraphics);
      case 'graphics':
        return showGraphics(shell, graphics.choice, (c) => {
          graphics.choose(c);
          applyActive();
        }, () => dispatch({ type: 'back' }));
      case 'speedTest':
        return showTestIntro(shell, () => runner.start(), () => dispatch({ type: 'toStart' }));
      case 'results':
        return showReport();
    }
  }

  function showReport(): void {
    if (!report) return;
    showResult(shell, report.text, report.pass, {
      summary: report.summary,
      recommended: lost ? null : state.recommended,
      applied: state.applied,
      onUseRecommended: () => {
        if (state.recommended) graphics.useRecommended(state.recommended);
        applyActive();
        dispatch({ type: 'useRecommended' });
      },
      onBack: lost ? undefined : () => dispatch({ type: 'toStart' }),
    });
  }

  function finishTest(): void {
    const r = runner.result!;
    report = { text: r.text, pass: r.pass };
    // Back to the player's own preset now the measuring is done.
    applyActive();
    dispatch({ type: 'testDone', recommended: recommendedPreset(r.tier, testBase.id) });
  }

  // Preallocated: commands() runs every 60 Hz step and must not allocate.
  const keyCmds: Commands = { move: { x: 0, y: 0 }, action: false, wormView: false, pause: false };
  const touchCmds: Commands = { move: NO_COMMANDS.move, action: false, wormView: false, pause: false };
  const heldCmds: Commands = { move: { x: 0, y: 0 }, action: false, wormView: false, pause: false };

  /**
   * This step's commands: the keyboard, the joystick and the touch Action button merged (Space or
   * the button hold `action`); the speed test's drive while it runs; nothing off the crawl screen
   * (paused, they are only watched: a press held through the pause stays spent).
   */
  function commands(): Commands {
    if (runner.running) return AUTO_DRIVE_MOVE;
    if (state.screen !== 'crawl' && !frozen()) return NO_COMMANDS;
    touchCmds.move = joystick.value; // the joystick replaces its value object; no copy needed
    touchCmds.action = actionPrompt.touchHeld;
    return mergeCommandsInto(keysToCommandsInto(keyboard.down, keyCmds), touchCmds, heldCmds);
  }

  /** Paused (or the Graphics menu over a pause): the simulation stops, the last frame stays. */
  function frozen(): boolean {
    return lost || state.screen === 'pause' || (state.screen === 'graphics' && state.graphicsFrom === 'pause');
  }

  function update(dt: number): void {
    const cmds = commands();
    if (frozen()) game.hold(cmds.action);
    else {
      game.step(dt, cmds.move, cmds.action, runner.running && params.dig);
      // ?prompt= shows one kind over the game's own and counts the presses (tests, screenshots).
      if (params.prompt && pressEdge.update(cmds.action)) app.dataset.actionPresses = String(++presses);
      const on = state.screen === 'crawl' && !runner.running && app.dataset.promptOff === undefined;
      actionPrompt.set(on ? params.prompt ?? game.prompt : null);
      // Gone down, come up, or the first visit's hint has had its time: the crawl card changes.
      if (state.screen === 'crawl' && shownCard !== cardNow()) draw();
    }
    keyboard.endStep();
    actionPrompt.endStep();
  }

  function render(now: number, alpha: number): void {
    meter.frame(now);
    const elapsed = Math.min(250, Math.max(0, now - lastNow));
    lastNow = now;
    const still = frozen();
    if (!still) clock += elapsed;
    if (runner.running && runner.frame(now, meter.fps)) finishTest();
    if (still && !dirty) return;
    dirty = false;
    setTime(clock / 1000);
    cut.sync(alpha, clock / 1000, camera, window.innerWidth, window.innerHeight);
    renderer.render(world.scene, camera);
    shell.setFps(meter.fps, CHOICE_LABELS[spec.id], runner.running ? runner.quality.tier : undefined);
    // Auto is fed only by frames actually drawn on the crawl screen: never menus, pauses or the
    // speed test (GraphicsControl also skips a meter window after every interruption).
    if (!runner.running && state.screen === 'crawl' && graphics.updateAuto(now, meter.fps)) applyActive();
  }

  applyActive();
  resize();
  warmShaders(renderer, world, camera);
  cut.preload(renderer, camera);
  // ?speedtest=1 only (automated checks; students never load it): the underground's hollow tiles
  // and the last frame's draw calls, for tests/e2e/underground.spec.ts.
  if (params.speedTest) {
    (window as unknown as { __wormDebug: unknown }).__wormDebug = {
      hollow: () => {
        const m = world.scene.getObjectByName('cutHollow') as THREE.Mesh | undefined;
        let shown = !!m;
        for (let o: THREE.Object3D | null = m ?? null; o; o = o.parent) shown &&= o.visible;
        return { inScene: !!m, visible: shown, count: m ? m.geometry.drawRange.count : 0 };
      },
      drawCalls: () => renderer.info.render.calls,
    };
  }
  window.addEventListener('resize', resize);
  const loop = startLoop(update, render, {
    maxFps: MAX_FPS,
    // update() or render() threw: the loop has stopped (and logged it). Say so, do not freeze silently.
    onError: crash,
  });

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    // Without preventDefault the browser never offers to restore the context; we do not restore
    // it anyway, because a mid-test reset means the numbers cannot be trusted.
    e.preventDefault();
    loop.stop();
    if (runner.running) {
      runner.abort();
      report = { text: formatContextLostResults(basicDeviceInfo()), pass: false, summary: RESET_NOTE };
      state = transition(state, { type: 'testDone', recommended: null });
      lost = true;
      showReport();
    } else if (state.screen === 'results' && report) {
      // The test already finished: the real verdict and report matter more than the reset.
      report = { ...report, summary: RESET_AFTER_TEST_NOTE };
      lost = true;
      showReport();
    } else {
      lost = true;
      showLost(shell);
    }
  });

  document.addEventListener('visibilitychange', () => {
    graphics.interruptAuto(performance.now());
    if (document.hidden) {
      runner.onHidden();
      dispatch({ type: 'hidden' });
    } else {
      runner.onVisible(performance.now());
    }
  });

  // Esc or P pauses and resumes; Esc also leaves the Graphics screen and the lesson.
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const pauseKey = e.code === 'Escape' || e.code === 'KeyP';
    if (state.screen === 'crawl' && pauseKey) dispatch({ type: 'pause' });
    else if (state.screen === 'pause' && pauseKey) dispatch({ type: 'resume' });
    else if (state.screen === 'graphics' && e.code === 'Escape') dispatch({ type: 'back' });
    else if (state.screen === 'lesson' && e.code === 'Escape') dispatch({ type: 'toStart' });
    else return;
    e.preventDefault();
  });
  onPauseButton = () => dispatch({ type: 'pause' });
}
