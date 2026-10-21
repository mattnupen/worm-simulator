import type * as THREE from 'three';
import type { Crawl } from '../game/crawl';
import type { BurrowGame } from '../underground/burrowGame';
import type { ActionKind } from '../ui/actionPrompt';
import { createHuntHud, type HuntHud } from '../ui/huntHud';
import { playHuntSound } from '../ui/huntSound';
import { litterTopHeight } from '../surface/litterDepth';
import { UNITS_PER_CM } from '../surface/realScale';
import { HUNT, createHunt, endGrab, resetHunt, robinIn, stepHunt, type HuntInput, type HuntPhase, type HuntState } from './hunt';
import { huntPose } from './huntPose';
import { huntOutcome, nextLength, type HuntOutcome } from './huntOutcome';
import { HuntShadow, SHIVER_S, shiver } from './huntEffects';
import { HUNT_NOTES } from './huntNotes';
import { Robin } from './robin';
import { createTug, startTug, stepTug } from './tug';

/** What the page does for the hunt's endings that start a new life (main.ts). */
export interface HuntHost {
  /** The robin got the whole worm (spec 3 and 5). */
  onWholeWorm(): void;
  /** Too short: start again at full length in "your burrow". */
  startAgain(): void;
  /** prefers-reduced-motion, read as each warning starts (no leaf shiver). */
  reducedMotion(): boolean;
}

/** The camera looks up while the robin stands within this many cm of the head, most at LOOK_FULL_CM. */
const LOOK_FROM_CM = 60;
const LOOK_FULL_CM = 18;
/** How fast the look-up eases in and out (1/s): gentle, never a snap. */
const LOOK_RATE = 1.6;
/** The shadow: a robin's spread wings (about 38 cm), and its body standing (cm). */
const WINGS_CM = 38;
const BODY_CM = 9;
/** The shadow starts this far behind the worm (cm), sweeping over it to where the robin lands. */
const SWEEP_BEHIND_CM = 120;

const CM = UNITS_PER_CM;
const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * The robin hunt in play (V4 spec 1 to 3): the robin and its hunt (hunt.ts), the grip mini-game
 * (tug.ts) while it holds the worm, the warnings, the camera's look-up, and what happens after.
 * main.ts steps it each game step on the crawl screen and draws it each frame. Allocates nothing
 * per step or frame.
 */
export class HuntGame {
  readonly robin = new Robin();
  readonly hunt: HuntState;
  readonly tug = createTug();
  private readonly hud: HuntHud;
  private readonly shadow: HuntShadow;
  private readonly input: HuntInput = { surface: false, hx: 0, hz: 0, heading: 0 };
  private readonly bill = { x: 0, y: 0, z: 0 };
  private last: HuntPhase = 'away';
  /** The warning's shiver: seconds into it (Infinity when none), round this spot. */
  private shiverT = Infinity;
  private readonly shiverAt = { x: 0, z: 0 };
  /** The shadow's sweep: from behind the worm to where the robin lands. */
  private readonly sweepFrom = { x: 0, z: 0 };
  private noteLeft = 0;
  /** This life's first grab shows the grip hint. */
  private hinted = false;

  constructor(
    scene: THREE.Scene, root: HTMLElement, private readonly crawl: Crawl, private readonly game: BurrowGame,
    private readonly host: HuntHost, private readonly rand: () => number = Math.random,
    firstIn: number | null = null,
  ) {
    this.hunt = createHunt(rand);
    if (firstIn !== null) robinIn(this.hunt, firstIn);
    scene.add(this.robin.mesh);
    this.shadow = new HuntShadow(scene);
    this.hud = createHuntHud(root);
  }

  /** The robin holds the worm: no crawling, Action grips. */
  get held(): boolean {
    return this.hunt.phase === 'grab';
  }

  /** The Action prompt while held ('grip'), else null (the game's own). */
  get prompt(): ActionKind | null {
    return this.held ? 'grip' : null;
  }

  /** A short line under the warning's place for `seconds` (the hooks' notes, too). */
  note(text: string, seconds: number): void {
    this.hud.note(text);
    this.noteLeft = seconds;
  }

  /**
   * One game step. `active`: on the crawl screen and playing (not paused, the speed test, a menu);
   * otherwise nothing moves and the HUD steps aside. `action`: the Action level (held, not pressed).
   */
  step(dt: number, active: boolean, action: boolean, touch: boolean): void {
    if (!active) {
      this.hud.warn(false);
      this.hud.grip(null, touch);
      return;
    }
    const h = this.hunt;
    const c = this.crawl;
    const w = this.input;
    w.surface = this.game.mode.mode === 'surface';
    w.hx = c.motion.head.x;
    w.hz = c.motion.head.z;
    w.heading = c.motion.heading;
    const ev = stepHunt(h, dt, w, this.rand);
    if (ev === 'warn') this.warned();
    else if (ev === 'grab') this.grabbed();
    if (h.phase !== this.last && (h.phase === 'leave' || h.phase === 'carry')) playHuntSound('leave');
    this.last = h.phase;

    let end: HuntOutcome | null = null;
    if (h.phase === 'grab') {
      const tugs = this.tug.tugs;
      stepTug(this.tug, dt, action, this.rand);
      if (this.tug.tugs > tugs) playHuntSound('tug');
      if (this.tug.result !== 'none') end = huntOutcome(this.tug.result, this.rand(), this.game.wormLength);
    }
    huntPose(h, this.tug, litterTopHeight, this.robin.pose);
    if (end) this.finish(end);
    else if (h.phase === 'grab') {
      // The head in the bill: lifted a little, and pulled toward the robin as it leans back to tug.
      this.robin.billTip(this.bill);
      c.held.x = this.bill.x;
      c.held.y = this.bill.y;
      c.held.z = this.bill.z;
      c.held.on = true;
    }
    this.hud.grip(h.phase === 'grab' ? this.tug : null, touch);
    this.hud.warn(h.phase === 'arrive' || h.phase === 'stare' || h.phase === 'dash' || h.phase === 'strike');
    this.lookUp(dt, w.surface);
    if (this.shiverT < SHIVER_S) {
      if (w.surface && c.reaction) {
        shiver(c.disturbance, this.shiverAt.x, this.shiverAt.z, this.shiverT, c.reach.stamp, c.reach.onTop);
        c.disturbed = true;
      }
      this.shiverT += dt;
    }
    if (this.noteLeft > 0) {
      this.noteLeft -= dt;
      if (this.noteLeft <= 0) this.hud.note(null);
    }
  }

  /** Each drawn frame: the robin's mesh and its shadow, from the last step's pose. */
  frame(): void {
    const p = this.robin.pose;
    this.robin.update();
    const h = this.hunt;
    if (!p.visible) {
      this.shadow.hide();
      return;
    }
    if (h.phase === 'arrive' && h.t < HUNT.flyIn) {
      // Sweeping in over the worm to where it lands, darkening as it comes down.
      const k = ease(h.t / HUNT.flyIn);
      const f = this.sweepFrom;
      this.shadow.place(f.x + (h.x - f.x) * k, f.z + (h.z - f.z) * k, h.away, WINGS_CM * CM, BODY_CM * 1.6 * CM, 0.35 + 0.4 * k);
      return;
    }
    // Under its body; spreading and fading as it rises to fly off.
    const up = Math.min(1, p.lift / 40);
    const size = BODY_CM + (WINGS_CM - BODY_CM) * up;
    this.shadow.place(p.x, p.z, p.yaw, size * CM, (BODY_CM + 4 * up) * 1.3 * CM, 0.75 * (1 - up));
  }

  /** A new life (or the speed test's reset): no robin, no grab, the hint again on the next grab. */
  reset(): void {
    resetHunt(this.hunt, this.rand);
    this.last = 'away';
    this.tug.result = 'none';
    this.shiverT = Infinity;
    this.hinted = false;
    this.crawl.held.on = false;
    this.crawl.lookUp = 0;
    this.robin.pose.visible = false;
    this.shadow.hide();
    this.hud.warn(false);
    this.hud.grip(null, false);
  }

  private warned(): void {
    const c = this.crawl;
    const h = this.hunt;
    playHuntSound('arrive');
    if (!this.host.reducedMotion()) {
      this.shiverT = 0;
      this.shiverAt.x = c.motion.head.x;
      this.shiverAt.z = c.motion.head.z;
    }
    const b = SWEEP_BEHIND_CM * CM;
    this.sweepFrom.x = c.motion.head.x - Math.sin(h.away) * b;
    this.sweepFrom.z = c.motion.head.z - Math.cos(h.away) * b;
  }

  private grabbed(): void {
    startTug(this.tug, this.rand);
    if (this.hinted) return;
    this.hinted = true;
    this.note(HUNT_NOTES.grip, 7);
  }

  /** The mini-game's ending (spec 3). */
  private finish(end: HuntOutcome): void {
    const h = this.hunt;
    const c = this.crawl;
    c.release();
    switch (end) {
      case 'escaped':
        endGrab(h, 'escaped');
        playHuntSound('escape');
        this.game.diveNow();
        this.note(HUNT_NOTES.escaped, 2.5);
        break;
      case 'broke':
        endGrab(h, 'broke');
        this.game.setWormLength(nextLength(this.game.wormLength) ?? 1);
        this.game.diveNow();
        this.note(HUNT_NOTES.broke, 5);
        break;
      case 'tooShort':
        endGrab(h, 'broke');
        this.note(HUNT_NOTES.tooShort, 5);
        this.host.startAgain();
        break;
      case 'taken':
        endGrab(h, 'taken');
        this.host.onWholeWorm();
        break;
    }
  }

  /** Eases the camera's look-up toward the robin standing close to the head. */
  private lookUp(dt: number, surface: boolean): void {
    const h = this.hunt;
    const p = this.robin.pose;
    let want = 0;
    const grounded = h.phase === 'stare' || h.phase === 'dash' || h.phase === 'strike' || h.phase === 'grab'
      || h.phase === 'miss' || (h.phase === 'arrive' && h.t >= HUNT.flyIn);
    if (surface && grounded) {
      const head = this.crawl.motion.head;
      const d = Math.hypot(p.x - head.x, p.z - head.z) / CM;
      want = ease((LOOK_FROM_CM - d) / (LOOK_FROM_CM - LOOK_FULL_CM));
    }
    const c = this.crawl;
    c.lookUp += (want - c.lookUp) * (1 - Math.exp(-LOOK_RATE * dt));
  }
}
