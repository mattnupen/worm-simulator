import * as THREE from 'three';
import './spike.css';
import { startLoop } from '../core/loop';
import type { Vec3 } from '../core/vec';
import { FpsMeter } from '../render/fps';
import { QualityController, TIERS } from '../render/quality';
import { setRimLight } from '../render/paintedMaterial';
import { buildScene, WORLD_HALF } from './scene';
import { terrainHeight } from '../surface/terrain';
import { createBody, followHead } from '../worm/body';
import { stepWorm, clampToNeck, type WormMotion, type LocomotionOptions } from '../worm/locomotion';
import {
  createFollowCam, stepFollowCam, type FollowCamOptions,
} from '../surface/followCamera';
import { KeyboardInput } from '../input/keyboard';
import { TouchJoystick } from '../input/touchJoystick';
import { keysToCommands, mergeCommands, NO_COMMANDS, type Commands } from '../input/commands';
import {
  SpeedTest, PHASES, quickPhases, parseParams, formatResults, verdict,
  type DeviceInfo, type PhaseSpec,
} from './speedTest';
import { createUi } from './ui';

const WORM_SEGMENTS = 16;
const SPACING = 0.22;
const CAM_DISTANCE = 3.2;
const CAM_HEIGHT = 1.6;
const AUTO_DRIVE: Commands = { ...NO_COMMANDS, move: { x: 0.35, y: 1 } };
const MAX_NECK_BEND = 1.3;
const HEAD_RADIUS = 0.14;
/** The camera never dips closer than this to the ground beneath it. */
const CAM_GROUND_MARGIN = 0.5;
const LOCOMOTION: LocomotionOptions = {
  speed: 1.6,
  turnRate: 2.2,
  halfSize: WORLD_HALF - 1,
  minTurnRadius: 1.0,
  pivotZone: 0.15,
};
const CAM_OPTS: FollowCamOptions = {
  distance: CAM_DISTANCE,
  height: CAM_HEIGHT,
  yawSmoothTime: 0.5,
  posRate: 10,
  maxYawSpeed: 1.8,
};

const params = parseParams(location.search);
const app = document.getElementById('app')!;

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
app.appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 120);
const world = buildScene(params.leaves, WORM_SEGMENTS);

const keyboard = new KeyboardInput();
const joystick = new TouchJoystick(app);
const ui = createUi(app);
const meter = new FpsMeter();
const quality = new QualityController();

/** Segment radius tapers from the head toward the tail. */
const segmentRadius = (i: number): number => HEAD_RADIUS * (1 - i / (WORM_SEGMENTS * 1.6));

let motion: WormMotion = { head: { x: 0, y: terrainHeight(0, 0) + HEAD_RADIUS, z: 0 }, heading: 0 };
const body = createBody(WORM_SEGMENTS, SPACING, motion.head, motion.heading);
let cam = createFollowCam(motion.head, motion.heading, CAM_OPTS);
let mode: 'idle' | 'testing' | 'free' = 'idle';
let test: SpeedTest | null = null;
const tmp = new THREE.Object3D();

// Previous-step snapshots, preallocated so taking them allocates nothing. Render lerps prev -> current.
const prevBody: Vec3[] = body.map((s) => ({ x: s.x, y: s.y, z: s.z }));
const prevCamPos: Vec3 = { ...cam.pos };
const prevHead: Vec3 = { ...motion.head };

function copyVec(dst: Vec3, src: Vec3): void {
  dst.x = src.x;
  dst.y = src.y;
  dst.z = src.z;
}

function applyTier(i: number): void {
  const t = TIERS[i];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1) * t.resolutionScale);
  setRimLight(t.rimLight);
  world.leaves.count = Math.floor(world.totalLeaves * t.leafDensity);
}

function resize(): void {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}

function commands(): Commands {
  if (mode === 'testing') return AUTO_DRIVE;
  if (mode === 'free') {
    return mergeCommands(keysToCommands(keyboard.down), { ...NO_COMMANDS, move: joystick.value });
  }
  return NO_COMMANDS;
}

function update(dt: number): void {
  for (let i = 0; i < body.length; i++) copyVec(prevBody[i], body[i]);
  copyVec(prevCamPos, cam.pos);
  copyVec(prevHead, motion.head);

  const cmd = commands();
  const move = { x: cmd.move.x, y: Math.max(0, cmd.move.y) };
  motion = { ...motion, heading: clampToNeck(motion.heading, body[0], body[1], MAX_NECK_BEND) };
  motion = stepWorm(motion, move, dt, LOCOMOTION);
  // stepWorm stays flat and pure; the terrain decides the height here.
  motion.head.y = terrainHeight(motion.head.x, motion.head.z) + HEAD_RADIUS;
  followHead(body, motion.head, SPACING);
  // Settle each trailing segment onto the ground. On these gentle slopes (< ~20 degrees)
  // this changes the 3D spacing by a few percent at most.
  for (let i = 1; i < body.length; i++) {
    const s = body[i];
    s.y = terrainHeight(s.x, s.z) + segmentRadius(i);
  }
  cam = stepFollowCam(cam, motion.head, motion.heading, dt, CAM_OPTS);
  const floor = terrainHeight(cam.pos.x, cam.pos.z) + CAM_GROUND_MARGIN;
  if (cam.pos.y < floor) cam.pos.y = floor;
}

function phaseLabel(p: PhaseSpec): string {
  return p.id === 'full' ? 'Test 1 of 2: full quality' : 'Test 2 of 2: auto quality';
}

function deviceInfo(): DeviceInfo {
  const gl = renderer.getContext();
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    gpu: ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown',
    cores: navigator.hardwareConcurrency ?? 'unknown',
    memoryGb: nav.deviceMemory ?? 'unknown',
    screen: `${screen.width}x${screen.height}`,
    pixelRatio: window.devicePixelRatio,
    userAgent: navigator.userAgent,
  };
}

function onPhaseChange(next: PhaseSpec | null): void {
  if (next) {
    loop.setMaxFps(next.capped ? 30 : Infinity);
    ui.showRunning(phaseLabel(next));
    return;
  }
  mode = 'free';
  loop.setMaxFps(30);
  const { full, auto } = test!.results;
  ui.showResult(
    formatResults(full, auto, quality.tier, params.leaves, deviceInfo(), test!.restarts),
    verdict(auto) === 'PASS',
  );
}

function render(now: number, alpha: number): void {
  meter.frame(now);
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

  for (let i = 0; i < body.length; i++) {
    const a = prevBody[i];
    const b = body[i];
    const r = segmentRadius(i);
    tmp.position.set(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha, a.z + (b.z - a.z) * alpha);
    tmp.scale.setScalar(r);
    tmp.updateMatrix();
    world.worm.setMatrixAt(i, tmp.matrix);
  }
  world.worm.instanceMatrix.needsUpdate = true;

  const h = motion.head;
  camera.position.set(
    prevCamPos.x + (cam.pos.x - prevCamPos.x) * alpha,
    prevCamPos.y + (cam.pos.y - prevCamPos.y) * alpha,
    prevCamPos.z + (cam.pos.z - prevCamPos.z) * alpha,
  );
  camera.lookAt(
    prevHead.x + (h.x - prevHead.x) * alpha,
    prevHead.y + (h.y - prevHead.y) * alpha + 0.35,
    prevHead.z + (h.z - prevHead.z) * alpha,
  );
  renderer.render(world.scene, camera);
  ui.setFps(meter.fps, quality.tier);
}

applyTier(0);
resize();
window.addEventListener('resize', resize);
const loop = startLoop(update, render, { maxFps: 30 });

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
  ui.showRunning(phaseLabel(first));
});
