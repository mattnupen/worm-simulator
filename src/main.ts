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
import { Crawl, SPACING, WORM_SEGMENTS } from './game/crawl';
import { AUTO_DRIVE_MOVE } from './game/drive';
import { scaledLeafCount } from './surface/leafScale';
import { browserStore, loadSettings, updateSettings } from './save/settingsStore';
import { FPS_CAP, SpeedTestRunner } from './perf/speedTestRunner';
import { formatContextLostResults, formatNoWebGLResults } from './perf/speedTest';
import { basicDeviceInfo, deviceInfo } from './perf/device';
import { createShell } from './ui/shell';
import { showCrawl, showLost, showPause, showStart, showVote } from './ui/menus';
import { showSettings } from './ui/settingsMenu';
import { setSoundEnabled } from './ui/lessonSound';
import { applyTextSize } from './ui/textSize';
import { createActionPrompt } from './ui/actionPrompt';
import { showResult, showRunning, showTestIntro } from './ui/speedTestUi';
import { showUnderground } from './ui/undergroundHint';
import { closeLesson, showLesson } from './ui/lesson';
import { CURRENT_LESSON, lessonFor } from './content/lessons';
import { lessonDone, markLessonDone } from './save/lessonStore';
import { loadRound, saveRound } from './save/questStore';
import { PLAY_GOAL_SECONDS, playMinutes, quests, type QuestProgress } from './game/quests';
import { VERSION } from './version';
import { warmShaders } from './render/warmShaders';
import { createBurrowing } from './underground/burrowing';
import { Opening } from './opening/opening';
import { LIE_YAW, captionAt, wormStart } from './opening/script';
import { showOpening, type OpeningCaptions } from './ui/opening';
import { playOpeningSound } from './ui/openingSound';
import { stopCueSound } from './ui/lessonSound';
import { markOpeningSeen, openingSeen } from './save/openingStore';
import { sharedLighting } from './render/paintedMaterial';
import { RobinPreview } from './predators/robinPreview';
import { HuntGame } from './predators/huntGame';
import { HUNT_NOTES } from './predators/huntNotes';
import { NestScene } from './predators/nestScene';
import { NEST_TIMES, nestCaptionAt } from './predators/nestScript';
import { playNestSound } from './predators/nestSound';
import { showNestScene, type NestOverlay } from './ui/nestScene';
import { createMoundView } from './underground/moundMesh';
import { Mounds } from './underground/mounds';
import { setWormRise } from './worm/surfaceHeight';

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
  /** This round's lesson, or the one `?lesson=<id>` previews (content/lessons/index.ts), opened straight away. */
  const lesson = lessonFor(location.search);
  app.appendChild(renderer.domElement);
  let state: ScreenState = initialScreens(params.speedTest, (params.lesson || lesson !== CURRENT_LESSON) && !!lesson);
  // The first card (Start, or the speed-test intro) goes up synchronously, before the slow
  // world build, so no frame is ever painted with an empty card. (The no-WebGL path shows its
  // FAIL card just as synchronously, above.) Its buttons only act once run() has finished.
  const store = browserStore();
  const saved = loadSettings(store);
  /** Sound effects on or off (Settings), as saved. */
  let sound = saved.sound;
  setSoundEnabled(sound);
  /** Text size (Settings), as saved: set before any card shows. */
  let textSize = saved.textSize;
  applyTextSize(textSize);
  // This round's Play and Vote progress (the quest list on Start; src/game/quests.ts).
  const progress = loadRound(store, VERSION.number);
  let playSaved = progress.playSeconds;
  const saveProgress = (): void => {
    saveRound(store, VERSION.number, progress);
    playSaved = progress.playSeconds;
  };
  const questProgress = (): QuestProgress => ({
    learned: !lesson || lessonDone(store, lesson.id),
    playSeconds: progress.playSeconds,
    voted: progress.voted,
  });
  draw();
  // Near plane 0.2 (not 0.1) doubles depth precision for the thin, layered leaf litter. The
  // camera stays >= 0.5 above the litter and 2.6 behind the worm, so nothing it normally looks
  // at comes within 0.2 of the lens.
  const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 120);
  /** The follow camera as play would draw it: the opening eases into it at its end. */
  const gameCam = new THREE.PerspectiveCamera(60, 1, 0.2, 120);
  /** The round's question to think about while crawling: the lesson's own "notice" line. */
  const playQuestion = lesson?.steps.find((s): s is Extract<typeof s, { kind: 'mission' }> => s.kind === 'mission')?.notice;
  const crawl = new Crawl();
  const world = buildWorld(crawl);
  const keyboard = new KeyboardInput();
  const joystick = new TouchJoystick(app);
  // What Action does now, and the touch Action button. The game sets it from where the worm is;
  // ?prompt= shows one kind (none while #app has data-prompt-off) and counts data-action-presses.
  const actionPrompt = createActionPrompt(app);
  // Surface or underground (V2): the game steps the crawl on the surface and digs below it.
  const { game, cut } = createBurrowing(crawl, world, app, shell.panel, store);
  // Casting mounds where the worm can dig, fixed over the forest floor; the worm crawls over them
  // (V4, Matt's review). ?digMarks=0 turns them off.
  const mounds = params.digMarks ? createMoundView(new Mounds()) : null;
  if (mounds) {
    world.scene.add(mounds.mesh);
    setWormRise(mounds.mounds);
  }
  // ?wormLength=0.6: the worm starts that much shorter (V4's broken worm, for review).
  if (params.wormLength !== null) { game.setWormLength(params.wormLength); crawl.reset(); }
  // The opening scene (src/opening/): its props join the scene now, hidden, so warmShaders sees them.
  const opening = new Opening(world.scene);
  /** ?robin=1: the V4 robin's preview loop ahead of the worm (Matt's review). */
  const robinPreview = params.robin ? new RobinPreview(world.scene, params) : null;
  /**
   * The robin hunt (V4, src/predators/huntGame.ts). Off with ?hunt=0 (its one rollback switch) and
   * while the ?robin=1 preview plays; ?robinIn=3 brings the first robin after 3 s up top.
   */
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const hunt = params.hunt && !params.robin ? new HuntGame(world.scene, app, crawl, game, {
    // The robin got the whole worm: it flies it to its nest (the nest scene, with the hunt's own
    // robin), and afterNest starts the new life.
    onWholeWorm: (_action, x, z, heading) => {
      hunt?.hide();
      nestFromHunt = true;
      playNestScene(x, z, heading);
    },
    startAgain: (action) => startAgain(action),
    reducedMotion: () => reduceMotion.matches,
  }, Math.random, params.robinIn, renderer.domElement) : null;
  // The robin's wobble turns the camera once it is posed each frame (V4 revision 1).
  if (hunt) cut.shake = (cam) => hunt.shake(cam);
  /** A touch screen: the grip panel says "Tap when the ring touches the dot" (menus.ts reads the same query). */
  const touchScreen = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  /** The V4 nest scene (src/predators/nestScene.ts): built now, hidden, so warmShaders sees it. */
  const nestScene = new NestScene(world.scene, hunt?.robin);
  let nestOverlay: NestOverlay | null = null;
  /** Where the next nest scene starts: where the robin caught the worm, and its facing. */
  const nestFrom = { x: 0, z: 0, heading: 0 };
  /** The nest scene playing came from a hunt (not the ?nest=1 preview from Start). */
  let nestFromHunt = false;
  /**
   * After the nest scene's fact card, back to play. After a hunt that is a new life: full length,
   * underground in your burrow. The ?nest=1 preview from Start lost no life, so it plays on as is.
   */
  const afterNest = (): void => {
    if (nestFromHunt) {
      nestFromHunt = false;
      startAgain(false);
      hunt?.note(HUNT_NOTES.taken, 5);
    }
    dispatch({ type: 'nestDone' });
  };
  /** The opening's captions while it plays. */
  let captions: OpeningCaptions | null = null;
  /** ?opening=1 plays it on the first Crawl even when seen (Matt's review); once. */
  let openingForced = params.opening === true;
  const openingMove = { x: 0, y: 0 };
  /** The forest's haze, kept while the opening thins it (the bus stands far off). */
  const baseFog = { near: 0, far: 0 };
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
    resetWorld: () => { game.setWormLength(1); crawl.reset(); hunt?.reset(); if (params.dig) game.enterNow(); else game.reset(); dirty = true; },
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
    gameCam.aspect = camera.aspect;
    gameCam.updateProjectionMatrix();
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
    // Leaving play (pause, a hidden tab, back to start): the Play quest's minutes are kept.
    if (state.screen === 'crawl' && progress.playSeconds !== playSaved) saveProgress();
    if (next.screen === 'opening' && state.screen !== 'opening') beginOpening();
    if (next.screen === 'nest' && state.screen !== 'nest') beginNest();
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

  /**
   * Crawl from Start or the lesson: the opening first if this device has not seen this version's
   * (never in the speed test, or with ?opening=0), else straight to play.
   */
  function crawlOrOpening(): void {
    const play = params.opening !== false && !params.speedTest && (openingForced || !openingSeen(store, VERSION.number));
    openingForced = false;
    dispatch({ type: play ? 'opening' : 'crawl' });
  }

  /** The scene from the top: the worm back at the spawn (in the tub), the props, the sound. */
  function beginOpening(): void {
    // A new start: a full-length worm (a robin may have broken the last one).
    game.setWormLength(1);
    crawl.reset();
    hunt?.reset();
    game.reset();
    // The worm starts curled in the bait cup, facing out of its mouth (script.ts), at full length.
    crawl.reset(crawl.hero.count, wormStart(WORM_SEGMENTS, SPACING).map((p) => ({ x: p.x, y: 0, z: p.z })), LIE_YAW);
    opening.start();
    world.worm.group.visible = false;
    baseFog.near = sharedLighting.uFogNear.value;
    baseFog.far = sharedLighting.uFogFar.value;
    sharedLighting.uFogNear.value = baseFog.near * 3.5;
    sharedLighting.uFogFar.value = baseFog.far * 2.4;
    // ?openingAt=: run the scene to that second now, then hold it there (screenshots).
    if (params.openingAt !== null) {
      while (opening.t < params.openingAt) {
        opening.step(1 / 60, crawl.motion.head.z, openingMove);
        game.step(1 / 60, openingMove, false);
      }
    } else {
      playOpeningSound();
    }
    dirty = true;
  }

  /** The scene is over (its end, or Esc or Enter): the props go, play's view is back, and play starts. */
  function endOpeningScene(): void {
    if (!opening.playing) return;
    opening.stop();
    stopCueSound();
    world.worm.group.visible = true;
    camera.fov = gameCam.fov;
    camera.updateProjectionMatrix();
    sharedLighting.uFogNear.value = baseFog.near;
    sharedLighting.uFogFar.value = baseFog.far;
    markOpeningSeen(store, VERSION.number);
    captions = null;
    dirty = true;
    // Straight into play (Matt, 2026-10-16: no card between the scene and play).
    if (state.screen === 'opening') dispatch({ type: 'openingDone' });
  }

  /**
   * A new life after the robin (too short, or taken): full length, underground in "your burrow"
   * (the one last gone down, tunnels and all), the hunt reset. `action`: the Action level held now,
   * so the grip's Space held through it is not a new press after.
   */
  function startAgain(action: boolean): void {
    game.setWormLength(1);
    hunt?.reset();
    game.enterBurrow(action);
    dirty = true;
  }

  /**
   * The hunt's entry point (V4): the robin got the whole worm at (atX, atZ), facing `heading` (0 =
   * +z). From the crawl screen (or Start, the preview), plays the nest scene: the robin flies the
   * worm up to its nest and feeds a nestling, then the fact card, whose "Keep going" calls
   * afterNest. The hunt hides its robin first: the scene flies that same robin.
   */
  function playNestScene(atX: number, atZ: number, heading: number): void {
    nestFrom.x = atX;
    nestFrom.z = atZ;
    nestFrom.heading = heading;
    dispatch({ type: 'nest' });
  }

  function beginNest(): void {
    // The worm is in the robin's bill now (the scene draws it).
    world.worm.group.visible = false;
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    nestScene.start(nestFrom.x, nestFrom.z, nestFrom.heading, reduced);
    // ?nestAt=: run the scene to that second now, then hold it there (screenshots).
    if (params.nestAt !== null) {
      while (nestScene.t < Math.min(params.nestAt, NEST_TIMES.end)) {
        nestScene.step(1 / 60);
        nestScene.pose(1, camera);
      }
    } else {
      playNestSound();
    }
    dirty = true;
  }

  /** Esc, Enter or a tap: straight to the fact card. */
  function skipNest(): void {
    if (!nestScene.playing || nestScene.done) return;
    nestScene.skip();
    stopCueSound();
  }

  /** The fact card's "Keep going" (or Esc on it): the scene goes, play's view is back. */
  function endNestScene(): void {
    if (!nestScene.playing) return;
    nestScene.stop();
    stopCueSound();
    world.worm.group.visible = true;
    camera.fov = gameCam.fov;
    camera.updateProjectionMatrix();
    nestOverlay = null;
    dirty = true;
    if (state.screen === 'nest') afterNest();
  }

  function draw(fromGraphics = false): void {
    switch (state.screen) {
      case 'start':
        return showStart(shell, {
          onCrawl: crawlOrOpening,
          onSettings: () => dispatch({ type: 'graphics' }),
          // A replay, once seen (so it never opens play before the round's Learn is done); on the
          // preview link (?opening=1), always, leading Start.
          onOpening: params.opening === true || openingSeen(store, VERSION.number) ? () => dispatch({ type: 'opening' }) : undefined,
          openingPreview: params.opening === true,
          // ?nest=1: watch the nest scene now, from where the worm is.
          onNest: params.nest ? () => playNestScene(crawl.motion.head.x, crawl.motion.head.z, crawl.motion.heading) : undefined,
        }, fromGraphics, lesson ? {
          lessonTitle: lesson.title,
          quests: quests(questProgress()),
          playMinutes: playMinutes(questProgress()),
          onLesson: () => dispatch({ type: 'lesson' }),
          onVote: () => dispatch({ type: 'vote' }),
        } : undefined);
      case 'vote':
        return showVote(shell, () => {
          progress.voted = true;
          saveProgress();
          dispatch({ type: 'toStart' });
        }, () => dispatch({ type: 'toStart' }));
      case 'lesson':
        if (!lesson) return;
        return showLesson(shell, lesson, {
          onCrawl: crawlOrOpening,
          onStart: () => dispatch({ type: 'toStart' }),
          onFinish: () => markLessonDone(store, lesson.id),
        });
      case 'opening':
        captions = showOpening(shell);
        captions.set(captionAt(opening.t));
        return;
      case 'nest':
        nestOverlay = showNestScene(shell, skipNest, endNestScene);
        nestOverlay.set(nestCaptionAt(nestScene.t), nestScene.dark);
        return;
      case 'crawl':
        shownCard = cardNow();
        return shownCard === 0 ? showCrawl(shell, playQuestion) : showUnderground(shell, shownCard === 1);
      case 'pause':
        return showPause(shell, {
          onResume: () => dispatch({ type: 'resume' }),
          onSettings: () => dispatch({ type: 'graphics' }),
          onStart: () => dispatch({ type: 'toStart' }),
          // The preview link: watch it again from Pause (Matt's review).
          onOpening: params.opening === true ? () => dispatch({ type: 'opening' }) : undefined,
        }, fromGraphics);
      case 'graphics':
        // The Settings screen (the 'graphics' screen state, kept from when it held Graphics only).
        return showSettings(shell, { graphics: graphics.choice, sound, textSize }, {
          onGraphics: (c) => {
            graphics.choose(c);
            applyActive();
          },
          onSound: (on) => {
            sound = updateSettings(store, { sound: on }).sound;
            setSoundEnabled(sound);
          },
          onTextSize: (size) => {
            textSize = updateSettings(store, { textSize: size }).textSize;
            applyTextSize(textSize);
          },
          onBack: () => dispatch({ type: 'back' }),
        });
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
    if (state.screen === 'opening' && opening.playing) {
      // The scene moves the worm itself (out of the tub and under the leaf): the real crawl, so
      // play starts where it ends. ?openingAt= holds it still at that second.
      const hold = params.openingAt !== null && opening.t >= params.openingAt;
      if (hold) openingMove.x = openingMove.y = 0;
      else opening.step(dt, crawl.motion.head.z, openingMove);
      game.step(dt, openingMove, false);
      if (opening.done) endOpeningScene();
      keyboard.endStep();
      actionPrompt.set(null);
      actionPrompt.endStep();
      return;
    }
    if (state.screen === 'nest' && nestScene.playing) {
      // ?nestAt= holds it still at that second.
      if (params.nestAt === null || nestScene.t < params.nestAt) nestScene.step(dt);
      if (nestScene.done && nestOverlay && shell.panel.dataset.phase !== 'card') nestOverlay.showCard();
      keyboard.endStep();
      actionPrompt.set(null);
      actionPrompt.endStep();
      return;
    }
    const cmds = commands();
    const playing = state.screen === 'crawl' && !runner.running && !frozen();
    if (frozen()) game.hold(cmds.action);
    else if (playing && hunt?.held) {
      // In the robin's bill: no crawling or digging; Action is the grip's tap (the hunt reads it
      // below, and poses the worm and the side view itself).
      game.hold(cmds.action);
    } else {
      game.step(dt, cmds.move, cmds.action, runner.running && params.dig);
      // A mound an opening was just made on stops lifting the worm before its next step.
      mounds?.sync(game.openings, game.mode);
    }
    hunt?.step(dt, playing, cmds.action, touchScreen);
    if (!frozen()) {
      // The Play quest counts real play only: never menus, pauses or the speed test.
      if (state.screen === 'crawl' && !runner.running && progress.playSeconds < PLAY_GOAL_SECONDS) {
        progress.playSeconds += dt;
        if (progress.playSeconds - playSaved >= 5 || progress.playSeconds >= PLAY_GOAL_SECONDS) saveProgress();
      }
      // ?prompt= shows one kind over the game's own and counts the presses (tests, screenshots).
      if (params.prompt && pressEdge.update(cmds.action)) app.dataset.actionPresses = String(++presses);
      const on = state.screen === 'crawl' && !runner.running && app.dataset.promptOff === undefined;
      actionPrompt.set(on ? params.prompt ?? hunt?.prompt ?? game.prompt : null);
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
    if (state.screen === 'opening' && opening.playing) {
      // The world as play would pose it (the follow camera into gameCam), then the scene's own
      // camera, and the litter's fade redone for it so the worm shows from there.
      cut.sync(alpha, clock / 1000, gameCam, window.innerWidth, window.innerHeight);
      opening.pose(alpha, camera, gameCam);
      world.worm.group.visible = opening.wormShown;
      world.syncWorm(world.pose, crawl.focus, camera, opening.wormShown);
      captions?.set(captionAt(opening.t));
    } else if (state.screen === 'nest' && nestScene.playing) {
      // As the opening: the world as play poses it, then the scene's own camera, the worm hidden.
      cut.sync(alpha, clock / 1000, gameCam, window.innerWidth, window.innerHeight);
      nestScene.pose(alpha, camera);
      world.syncWorm(world.pose, crawl.focus, camera, false);
      nestOverlay?.set(nestCaptionAt(nestScene.t), nestScene.dark);
    } else {
      cut.sync(alpha, clock / 1000, camera, window.innerWidth, window.innerHeight);
      opening.keepLeaf(crawl.motion.head.x, crawl.motion.head.z, game.mode.mode === 'surface');
    }
    // Casting mounds: part of the forest floor, shown as the middens are (never below).
    mounds?.sync(game.openings, game.mode);
    // The nest scene poses the robin itself (the hunt's robin) while it plays.
    if (!nestScene.playing) hunt?.frame();
    robinPreview?.frame(clock / 1000, state.screen === 'crawl', crawl.motion.head, crawl.motion.heading);
    robinPreview?.aim(camera);
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
      // The scene stops with the page; its sound would run on alone, so it stops.
      if (opening.playing || nestScene.playing) stopCueSound();
      dispatch({ type: 'hidden' });
    } else {
      runner.onVisible(performance.now());
    }
  });

  // Esc or P pauses and resumes; Esc also leaves the Graphics screen, the lesson and Vote.
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    // An open panel (the lesson's photo or "Tell me more") takes Esc for itself.
    if (document.querySelector('dialog[open]')) return;
    const pauseKey = e.code === 'Escape' || e.code === 'KeyP';
    if (state.screen === 'crawl' && pauseKey) dispatch({ type: 'pause' });
    else if (state.screen === 'pause' && pauseKey) dispatch({ type: 'resume' });
    else if (state.screen === 'graphics' && e.code === 'Escape') dispatch({ type: 'back' });
    else if ((state.screen === 'lesson' || state.screen === 'vote') && e.code === 'Escape') dispatch({ type: 'toStart' });
    // The opening: Esc or Enter skips the scene, straight into play.
    else if (state.screen === 'opening' && (e.code === 'Escape' || e.code === 'Enter' || e.code === 'NumpadEnter')) endOpeningScene();
    // The nest scene: Esc or Enter skips to its fact card; there, Esc goes on (Enter presses its button).
    else if (state.screen === 'nest' && !nestScene.done && (e.code === 'Escape' || e.code === 'Enter' || e.code === 'NumpadEnter')) skipNest();
    else if (state.screen === 'nest' && e.code === 'Escape') endNestScene();
    else return;
    e.preventDefault();
  });
  onPauseButton = () => dispatch({ type: 'pause' });
}
