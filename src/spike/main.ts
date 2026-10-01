import * as THREE from 'three';
import './spike.css';
import { startLoop } from '../core/loop';
import type { Vec3 } from '../core/vec';
import { FpsMeter } from '../render/fps';
import { QualityController, TIERS } from '../render/quality';
import { setRimLight, setResolution, setTime } from '../render/paintedMaterial';
import { buildScene } from './scene';
import { AUTO_DRIVE_MOVE, LOCOMOTION } from './drive';
import { terrainHeight } from '../surface/terrain';
import { createBody, followHead } from '../worm/body';
import { advanceWave, type WaveState } from '../worm/wormShape';
import { BELLY_LIFT, WAVES, wormLength, type WormPose } from '../worm/wormMesh';
import { stepWorm, clampToNeck, type WormMotion } from '../worm/locomotion';
import {
  createFollowCam, stepFollowCam, type FollowCamOptions,
} from '../surface/followCamera';
import { KeyboardInput } from '../input/keyboard';
import { TouchJoystick } from '../input/touchJoystick';
import { keysToCommands, mergeCommands, NO_COMMANDS, type Commands } from '../input/commands';
import {
  SpeedTest, PHASES, quickPhases, parseParams, formatResults, formatNoWebGLResults,
  formatContextLostResults, verdict,
  type DeviceInfo, type PhaseSpec,
} from './speedTest';
import { createUi } from './ui';

const WORM_SEGMENTS = 16;
const SPACING = 0.22;
const CAM_DISTANCE = 2.6;
const CAM_HEIGHT = 1.1;
/** The camera aims a little ahead of the head, so the worm sits low in frame and the forest looms. */
const LOOK_AHEAD = 1.0;
const LOOK_UP = 0.6;
const MAX_NECK_BEND = 1.3;
/** Slow resting "breath" of the contraction wave, in waves per second. */
const BREATH_HZ = 0.22;
/** The camera never dips closer than this to the ground beneath it. */
const CAM_GROUND_MARGIN = 0.5;
const CAM_OPTS: FollowCamOptions = {
  distance: CAM_DISTANCE,
  height: CAM_HEIGHT,
  yawSmoothTime: 0.5,
  posRate: 10,
  maxYawSpeed: 1.8,
};

const params = parseParams(location.search);
const app = document.getElementById('app')!;
// The card exists before any 3D setup, so a computer without WebGL 2 still gets a report.
const ui = createUi(app);

/** Everything in the report that does not need the GPU. */
function basicDeviceInfo(): Omit<DeviceInfo, 'gpu'> {
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    cores: navigator.hardwareConcurrency ?? 'unknown',
    memoryGb: nav.deviceMemory ?? 'unknown',
    screen: `${screen.width}x${screen.height}`,
    pixelRatio: window.devicePixelRatio,
    userAgent: navigator.userAgent,
  };
}

const RESET_NOTE = 'The graphics reset during the test. Reload the page and try again.';

let renderer: THREE.WebGLRenderer | null = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
} catch (e) {
  // Three r186 needs WebGL 2 and throws without it. That is a FAIL worth reporting, not a blank page.
  const reason = e instanceof Error ? e.message : String(e);
  ui.showResult(formatNoWebGLResults(basicDeviceInfo(), reason), false, false,
    'This computer could not start the 3D graphics.');
}
if (renderer) run(renderer);

function run(renderer: THREE.WebGLRenderer): void {

  app.appendChild(renderer.domElement);
  // Near plane 0.2 (not 0.1) doubles depth precision for the thin, layered leaf litter. The
  // camera stays >= CAM_GROUND_MARGIN (0.5) above the ground and 2.6 behind the worm, so
  // nothing it normally looks at comes within 0.2 of the lens.
  const camera = new THREE.PerspectiveCamera(60, 1, 0.2, 120);
  const world = buildScene(params.leaves, WORM_SEGMENTS);

  const keyboard = new KeyboardInput();
  const joystick = new TouchJoystick(app);
  const meter = new FpsMeter();
  const quality = new QualityController();

  const WAVES_PER_UNIT = WAVES / wormLength(WORM_SEGMENTS, SPACING);

  // The simulated spine is the worm's belly line; the tube is built up from it.
  let motion: WormMotion = { head: { x: 0, y: terrainHeight(0, 0) + BELLY_LIFT, z: 0 }, heading: 0 };
  const body = createBody(WORM_SEGMENTS, SPACING, motion.head, motion.heading);
  let cam = createFollowCam(motion.head, motion.heading, CAM_OPTS);
  let mode: 'idle' | 'testing' | 'free' = 'idle';
  let test: SpeedTest | null = null;
  /** The real verdict and report once a test finishes, so a later graphics reset cannot lose them. */
  let finished: { text: string; pass: boolean } | null = null;
  const wave: WaveState = { phase: 0, activity: 0 };
  const pose: WormPose = { spine: new Float32Array(WORM_SEGMENTS * 3), phase: 0, activity: 0, timeSec: 0 };
  const drawSize = new THREE.Vector2();

  // Previous-step snapshots, preallocated so taking them allocates nothing. Render lerps prev -> current.
  const prevBody: Vec3[] = body.map((s) => ({ x: s.x, y: s.y, z: s.z }));
  const prevCamPos: Vec3 = { ...cam.pos };
  const prevHead: Vec3 = { ...motion.head };
  const prevWave: WaveState = { ...wave };
  let prevYaw = cam.yaw;

  function copyVec(dst: Vec3, src: Vec3): void {
    dst.x = src.x;
    dst.y = src.y;
    dst.z = src.z;
  }

  function applyTier(i: number): void {
    const t = TIERS[i];
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1) * t.resolutionScale);
    setRimLight(t.rimLight);
    world.leaves.setDensity(t.leafDensity);
    world.props.setDensity(t.leafDensity);
    world.atmosphere.visible = t.rimLight;
    updateResolution();
  }

  function updateResolution(): void {
    renderer.getDrawingBufferSize(drawSize);
    setResolution(drawSize.x, drawSize.y);
  }

  function resize(): void {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    updateResolution();
  }

  function commands(): Commands {
    if (mode === 'testing') return AUTO_DRIVE_MOVE;
    // Free mode only obeys keys and joystick once the player chose "Try driving the worm",
    // not while the result card is up.
    if (mode === 'free' && ui.isDriving()) {
      return mergeCommands(keysToCommands(keyboard.down), { ...NO_COMMANDS, move: joystick.value });
    }
    return NO_COMMANDS;
  }

  function update(dt: number): void {
    for (let i = 0; i < body.length; i++) copyVec(prevBody[i], body[i]);
    copyVec(prevCamPos, cam.pos);
    prevYaw = cam.yaw;
    copyVec(prevHead, motion.head);
    prevWave.phase = wave.phase;
    prevWave.activity = wave.activity;

    const cmd = commands();
    const move = { x: cmd.move.x, y: Math.max(0, cmd.move.y) };
    motion = { ...motion, heading: clampToNeck(motion.heading, body[0], body[1], MAX_NECK_BEND) };
    motion = stepWorm(motion, move, dt, LOCOMOTION);
    // stepWorm stays flat and pure; the terrain decides the height here.
    motion.head.y = terrainHeight(motion.head.x, motion.head.z) + BELLY_LIFT;
    advanceWave(
      wave, Math.hypot(motion.head.x - prevHead.x, motion.head.z - prevHead.z), dt,
      LOCOMOTION.speed, WAVES_PER_UNIT, BREATH_HZ,
    );
    followHead(body, motion.head, SPACING);
    // Settle each trailing segment onto the ground. On these gentle slopes (< ~20 degrees)
    // this changes the 3D spacing by a few percent at most.
    for (let i = 1; i < body.length; i++) {
      const s = body[i];
      s.y = terrainHeight(s.x, s.z) + BELLY_LIFT;
    }
    cam = stepFollowCam(cam, motion.head, motion.heading, dt, CAM_OPTS);
    const floor = terrainHeight(cam.pos.x, cam.pos.z) + CAM_GROUND_MARGIN;
    if (cam.pos.y < floor) cam.pos.y = floor;
  }

  function phaseLabel(p: PhaseSpec): string {
    return p.id === 'full' ? 'Test 1 of 2: full quality' : 'Test 2 of 2: auto quality';
  }

  function showPhase(p: PhaseSpec): void {
    ui.showRunning(phaseLabel(p), p.id === 'full' ? 1 : 2, 2);
  }

  function deviceInfo(): DeviceInfo {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    renderer.getDrawingBufferSize(drawSize);
    return {
      renderSize: `${drawSize.x}x${drawSize.y}`,
      gpu: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown',
      ...basicDeviceInfo(),
    };
  }

  function onPhaseChange(next: PhaseSpec | null): void {
    if (next) {
      loop.setMaxFps(next.capped ? 30 : Infinity);
      showPhase(next);
      return;
    }
    mode = 'free';
    loop.setMaxFps(30);
    const { full, auto } = test!.results;
    finished = {
      text: formatResults(full, auto, quality.tier, params.leaves, deviceInfo(), test!.restarts),
      pass: verdict(auto) === 'PASS',
    };
    ui.showResult(finished.text, finished.pass);
  }

  function render(now: number, alpha: number): void {
    meter.frame(now);
    setTime(now / 1000);
    if (mode === 'testing' && test) {
      const phase = test.current;
      test.frame(now);
      if (phase?.autoQuality && quality.update(now, meter.fps)) {
        applyTier(quality.tier);
        test.restartMeasurement(now);
      }
      const next = test.current;
      if (next !== phase) onPhaseChange(next);
    }

    const sp = pose.spine;
    for (let i = 0; i < body.length; i++) {
      const a = prevBody[i];
      const b = body[i];
      sp[i * 3] = a.x + (b.x - a.x) * alpha;
      sp[i * 3 + 1] = a.y + (b.y - a.y) * alpha;
      sp[i * 3 + 2] = a.z + (b.z - a.z) * alpha;
    }
    pose.phase = prevWave.phase + (wave.phase - prevWave.phase) * alpha;
    pose.activity = prevWave.activity + (wave.activity - prevWave.activity) * alpha;
    pose.timeSec = now / 1000;
    world.worm.update(pose);

    const h = motion.head;
    const yaw = prevYaw + (cam.yaw - prevYaw) * alpha;
    camera.position.set(
      prevCamPos.x + (cam.pos.x - prevCamPos.x) * alpha,
      prevCamPos.y + (cam.pos.y - prevCamPos.y) * alpha,
      prevCamPos.z + (cam.pos.z - prevCamPos.z) * alpha,
    );
    camera.lookAt(
      prevHead.x + (h.x - prevHead.x) * alpha + Math.sin(yaw) * LOOK_AHEAD,
      prevHead.y + (h.y - prevHead.y) * alpha + LOOK_UP,
      prevHead.z + (h.z - prevHead.z) * alpha + Math.cos(yaw) * LOOK_AHEAD,
    );
    renderer.render(world.scene, camera);
    ui.setFps(meter.fps, quality.tier);
  }

  applyTier(0);
  resize();
  window.addEventListener('resize', resize);
  const loop = startLoop(update, render, { maxFps: 30 });

  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    // Without preventDefault the browser never offers to restore the context; we do not restore
    // it anyway, because a mid-test reset means the numbers cannot be trusted.
    e.preventDefault();
    loop.stop();
    if (mode === 'testing') {
      mode = 'free';
      ui.showResult(formatContextLostResults(basicDeviceInfo()), false, false, RESET_NOTE);
    } else if (finished) {
      // The test already finished: the real verdict and report matter more than the reset.
      ui.showResult(finished.text, finished.pass, false, RESET_NOTE);
    } else {
      ui.showResult(
        'The graphics system reset (WebGL context lost).\nPlease reload this page to try again.',
        false, false, RESET_NOTE,
      );
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      quality.interrupt();
    } else if (mode === 'testing' && test) {
      test.restartMeasurement(performance.now());
      quality.interrupt();
    }
  });

  ui.showStart(() => {
    test = new SpeedTest(params.quick ? quickPhases() : PHASES);
    quality.reset();
    applyTier(0);
    mode = 'testing';
    const first = test.current!;
    loop.setMaxFps(first.capped ? 30 : Infinity);
    showPhase(first);
  });
}
