import type * as THREE from 'three';
import type { Crawl } from '../game/crawl';
import type { BurrowGame } from '../underground/burrowGame';
import type { ActionKind } from '../ui/actionPrompt';
import { createHuntHud, type HuntHud } from '../ui/huntHud';
import { playHuntSound } from '../ui/huntSound';
import { litterTopHeight } from '../surface/litterDepth';
import { UNITS_PER_CM } from '../surface/realScale';
import {
  createHold, holdFromBelow, holdFromSurface, leaveBelow, poseHeld, releaseHold, setBill, slideEnd, snapHeld, SLIDE_SPEED,
} from '../underground/burrowGrab';
import { frameHunt } from '../underground/huntFrame';
import { slabU } from '../underground/slab';
import { HUNT, createHunt, endGrab, resetHunt, robinIn, robinShown, stepHunt, type HuntInput, type HuntPhase, type HuntState } from './hunt';
import { huntPose } from './huntPose';
import { huntOutcome, nextLength, type HuntOutcome } from './huntOutcome';
import { GUSTS, HuntShadow, SHIVER_S, gust } from './huntEffects';
import { HuntGrab } from './huntGrab';
import { HUNT_NOTES } from './huntNotes';
import { placeOnCut, readWorm } from './huntPlace';
import { Robin } from './robin';
import { Wobble } from './wobble';

/** What the page does for the hunt's endings that start a new life (main.ts). */
export interface HuntHost {
  /**
   * The robin got the whole worm (spec 3 and 5) where it stood at (x, z), facing `heading`.
   * `action`: the Action level held now, so a new life started from here doesn't read it as a press.
   */
  onWholeWorm(action: boolean, x: number, z: number, heading: number): void;
  /** Too short: start again at full length in "your burrow". `action` as for onWholeWorm. */
  startAgain(action: boolean): void;
  /** prefers-reduced-motion, read as each warning, tug or grab starts (no leaf shiver, no wobble). */
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
/** The cut to the side view as it grabs on the surface: the screen dims as it strikes, then clears over this long (s). */
const CUT_CLEAR_S = 0.4;
const STRIKE_DIM = 0.55;

const CM = UNITS_PER_CM;
const ease = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/**
 * The robin hunt in play (V4 spec 1 to 3, revision 1): the robin and its hunt (hunt.ts), on the
 * surface or along the cut for a worm in the top two layers; the rhythm grip (huntGrab.ts) while it
 * holds the worm, seen in the side view (burrowGrab.ts, huntFrame.ts); the warnings, the wobble, the
 * camera's look-up, and what happens after. main.ts steps it each game step on the crawl screen and
 * draws it each frame. Allocates nothing per step or frame.
 */
export class HuntGame {
  readonly robin = new Robin();
  readonly hunt: HuntState;
  readonly grab = new HuntGrab();
  readonly wobble = new Wobble();
  private readonly hold = createHold();
  private readonly hud: HuntHud;
  private readonly shadow: HuntShadow;
  // Number fields start as fractions: a field that first held a whole number had V8 box every fraction written later.
  private readonly input: HuntInput = { catchable: false, under: false, hx: 0.5, hz: 0.5, heading: 0.5 };
  private readonly bill = { x: 0.5, y: 0.5, z: 0.5 };
  private last: HuntPhase = 'away';
  private lastT = 0;
  /** The warning's leaf shiver: seconds into it (Infinity when none). */
  private shiverT = Infinity;
  private noteLeft = 0;
  /** This life's first grab shows the grip hint. */
  private hinted = false;
  /** After the grab: the worm sliding down its hole until `slideTo` (then the burrower has it). */
  private sliding = false;
  private slideTo = 0;

  constructor(
    scene: THREE.Scene, root: HTMLElement, private readonly crawl: Crawl, private readonly game: BurrowGame,
    private readonly host: HuntHost, private readonly rand: () => number = Math.random,
    firstIn: number | null = null, tapTarget: HTMLElement | null = null,
  ) {
    this.hunt = createHunt(rand);
    if (firstIn !== null) robinIn(this.hunt, firstIn);
    scene.add(this.robin.mesh);
    this.shadow = new HuntShadow(scene);
    this.hud = createHuntHud(root);
    // A tap or click on the game itself is a tap too (the ring's own panel and the button as well).
    const tap = (e: PointerEvent): void => {
      if (e.button === 0 && this.hunt.phase === 'grab') this.grab.tap();
    };
    tapTarget?.addEventListener('pointerdown', tap);
    this.hud.panel.addEventListener('pointerdown', tap);
  }

  /** The robin holds the worm (or it is sliding back down its hole): no crawling or digging. */
  get held(): boolean {
    return this.hunt.phase === 'grab' || this.sliding;
  }

  /** The Action prompt while the robin holds the worm ('grip': "Tap!"), else null (the game's own). */
  get prompt(): ActionKind | null {
    return this.hunt.phase === 'grab' ? 'grip' : null;
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
      this.grab.step(dt, action, false);
      this.hud.warn(false, false);
      this.hud.grip(null, touch);
      return;
    }
    const h = this.hunt;
    const g = this.game;
    const w = this.input;
    this.wobble.step(dt);
    readWorm(g, h, w);
    const ev = stepHunt(h, dt, w, this.rand);
    if (ev === 'warn') this.warned();
    else if (ev === 'grab') this.grabbed();
    if (h.phase !== this.last && (h.phase === 'leave' || h.phase === 'carry')) playHuntSound('leave');
    // It lands: the wobble.
    if (h.phase === 'arrive' && this.lastT < HUNT.flyIn && h.t >= HUNT.flyIn) this.wobble.kick(this.host.reducedMotion());
    this.last = h.phase;
    this.lastT = h.t;

    const call = this.grab.step(dt, action, h.phase === 'grab');
    if (call === 'good') playHuntSound('good');
    else if (call !== 'none') {
      playHuntSound('tug');
      this.wobble.kick(this.host.reducedMotion());
    }
    const r = this.grab.rhythm;
    const end: HuntOutcome | null = h.phase === 'grab' && r.result !== 'none' ? huntOutcome(r.result, this.rand(), g.wormLength) : null;
    huntPose(h, this.grab.look, litterTopHeight, this.robin.pose);
    if (end) this.finish(end, action);
    else if (h.phase === 'grab') {
      // The worm's head in the bill, the rest down its hole.
      this.robin.billTip(this.bill);
      setBill(this.hold, g.slab!, this.bill);
      poseHeld(g, this.hold, dt);
    }
    if (this.sliding) this.slide(dt);
    // The side view frames the robin hunting a worm underground (and holding it).
    g.robinU = g.mode.mode !== 'surface' && g.slab && robinShown(h) && (h.under || this.held) ? slabU(g.slab, h.x, h.z) : NaN;
    if (this.held && g.slab) frameHunt(g, dt, false);
    // The surface strike dims toward the cut; the cut clears.
    g.cutDip = h.phase === 'strike' && !w.under ? STRIKE_DIM * ease(h.t / HUNT.strike) : Math.max(0, g.cutDip - dt / CUT_CLEAR_S);
    this.hud.grip(h.phase === 'grab' ? r : null, touch);
    this.hud.warn(h.phase === 'arrive' || h.phase === 'stare' || h.phase === 'dash' || h.phase === 'strike', w.under);
    this.lookUp(dt, g.mode.mode === 'surface');
    if (this.shiverT < SHIVER_S) {
      // The wingbeats' puffs: the loose leaves by the worm hop and turn.
      const n = Math.floor((this.shiverT + dt) * GUSTS) - Math.floor(this.shiverT * GUSTS);
      if (g.mode.mode === 'surface' && n > 0) gust(this.crawl.hero, Math.floor(this.shiverT * GUSTS));
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
      // Under the robin as it flies in over the worm to where it lands, darkening as it comes down.
      const k = ease(h.t / HUNT.flyIn);
      this.shadow.place(p.x, p.z, h.away, WINGS_CM * CM, BODY_CM * 1.6 * CM, 0.35 + 0.4 * k);
      return;
    }
    // Under its body; spreading and fading as it rises to fly off.
    const up = Math.min(1, p.lift / 40);
    const size = BODY_CM + (WINGS_CM - BODY_CM) * up;
    this.shadow.place(p.x, p.z, p.yaw, size * CM, (BODY_CM + 4 * up) * 1.3 * CM, 0.75 * (1 - up));
  }

  /** The robin's wobble on the camera, as posed this frame (cutScene.ts shake). */
  shake(camera: THREE.Camera): void {
    this.wobble.apply(camera);
  }

  /** The robin and its shadow out of sight now (the nest scene takes the robin over). */
  hide(): void {
    this.robin.pose.visible = false;
    this.robin.update();
    this.shadow.hide();
    this.wobble.stop();
    this.hud.warn(false, false);
    this.hud.grip(null, false);
  }

  /** A new life (or the speed test's reset): no robin, no grab, the hint again on the next grab. */
  reset(): void {
    resetHunt(this.hunt, this.rand);
    this.last = 'away';
    this.lastT = 0;
    this.grab.start();
    this.sliding = false;
    this.shiverT = Infinity;
    this.hinted = false;
    this.game.robinU = NaN;
    this.game.cutDip = 0;
    this.crawl.lookUp = 0;
    this.robin.pose.visible = false;
    this.shadow.hide();
    this.wobble.stop();
    this.hud.warn(false, false);
    this.hud.grip(null, false);
  }

  private warned(): void {
    playHuntSound('arrive');
    if (!this.host.reducedMotion()) this.shiverT = 0;
  }

  /**
   * The robin has the worm: into the side view at once. On the surface the worm gets a burrow where
   * it lies (its tail end down a new hole); underground the robin pulls its front up through the
   * litter. The robin stands on the cut's line, the rhythm starts, and the first grab's hint shows.
   */
  private grabbed(): void {
    const g = this.game;
    const h = this.hunt;
    if (g.mode.mode === 'surface') {
      // The tunnel leans away from the robin: which side of the head it stands along the heading.
      const c = this.crawl.motion;
      const ahead = (h.x - c.head.x) * Math.sin(c.heading) + (h.z - c.head.z) * Math.cos(c.heading);
      holdFromSurface(g, this.hold, ahead >= 0 ? 1 : -1);
      g.cutDip = 1;
    } else holdFromBelow(g, this.hold);
    this.grab.start();
    // From now on this robin is on the cut's line, as one that came for a worm underground.
    h.under = true;
    placeOnCut(g, h, this.hold, this.robin);
    huntPose(h, this.grab.look, litterTopHeight, this.robin.pose);
    this.robin.billTip(this.bill);
    setBill(this.hold, g.slab!, this.bill);
    snapHeld(g, this.hold);
    g.robinU = slabU(g.slab!, h.x, h.z);
    frameHunt(g, 0, g.cutDip >= 1);
    if (this.hinted) return;
    this.hinted = true;
    this.note(HUNT_NOTES.grip, 7);
  }

  /** The mini-game's ending (spec 3). */
  private finish(end: HuntOutcome, action: boolean): void {
    const h = this.hunt;
    const g = this.game;
    switch (end) {
      case 'escaped':
        endGrab(h, 'escaped');
        playHuntSound('escape');
        this.startSlide();
        this.note(HUNT_NOTES.escaped, 2.5);
        break;
      case 'broke':
        endGrab(h, 'broke');
        g.setWormLength(nextLength(g.wormLength) ?? 1);
        this.startSlide();
        this.note(HUNT_NOTES.broke, 5);
        break;
      case 'tooShort':
        endGrab(h, 'broke');
        this.note(HUNT_NOTES.tooShort, 5);
        this.host.startAgain(action);
        break;
      case 'taken':
        endGrab(h, 'taken');
        leaveBelow(g);
        this.host.onWholeWorm(action, h.x, h.z, h.yaw);
        break;
    }
  }

  private startSlide(): void {
    this.sliding = true;
    this.slideTo = slideEnd(this.hold);
  }

  /** The worm slides down its hole, then the burrower has it (underground play goes on). */
  private slide(dt: number): void {
    const hold = this.hold;
    hold.slide = Math.min(this.slideTo, hold.slide + SLIDE_SPEED * dt);
    poseHeld(this.game, hold, dt);
    if (hold.slide < this.slideTo) return;
    this.sliding = false;
    releaseHold(this.game);
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
